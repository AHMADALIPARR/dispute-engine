# Sovereign Dispute Engine — the credit-repair algorithm as software.
#
# The method, from the owner's own letters: never argue the debt.
# Audit the RECORD. Every tradeline field must conform to the
# reporting standard (Metro 2) and the bureau's statutory accuracy
# duty (FCRA). A field that cannot be proven conforming is marked;
# the marked fields become letters demanding documented proof of
# compliance or deletion; each round feeds the surviving failures
# back in at higher granularity until nothing unverifiable remains.
#
# Zero dependencies: Julia stdlib only, including the small JSON
# reader below (credit-report exports arrive as JSON).

using SHA
using Printf

# ---------- minimal strict JSON reader (objects, arrays, strings,
# numbers, booleans, null). String escapes match JSON.parse, including
# \uXXXX, so a browser reading the same file gets the same text. ----------
struct JSONParseError <: Exception
    msg::String
end

mutable struct Parser
    s::String
    i::Int
end

function skip_ws(p::Parser)
    while p.i <= lastindex(p.s) && p.s[p.i] in (' ', '\t', '\n', '\r')
        p.i = nextind(p.s, p.i)
    end
end

function parse_value(p::Parser)
    skip_ws(p)
    p.i > lastindex(p.s) && throw(JSONParseError("unexpected end of input"))
    c = p.s[p.i]
    if c == '{'
        return parse_object(p)
    elseif c == '['
        return parse_array(p)
    elseif c == '"'
        return parse_string(p)
    elseif c == 't'
        startswith(SubString(p.s, p.i), "true") || throw(JSONParseError("bad literal at $(p.i)"))
        p.i += 4
        return true
    elseif c == 'f'
        startswith(SubString(p.s, p.i), "false") || throw(JSONParseError("bad literal at $(p.i)"))
        p.i += 5
        return false
    elseif c == 'n'
        startswith(SubString(p.s, p.i), "null") || throw(JSONParseError("bad literal at $(p.i)"))
        p.i += 4
        return nothing
    else
        return parse_number(p)
    end
end

function parse_object(p::Parser)
    obj = Dict{String,Any}()
    p.i = nextind(p.s, p.i) # {
    skip_ws(p)
    if p.i <= lastindex(p.s) && p.s[p.i] == '}'
        p.i = nextind(p.s, p.i)
        return obj
    end
    while true
        skip_ws(p)
        key = parse_string(p)
        skip_ws(p)
        (p.i <= lastindex(p.s) && p.s[p.i] == ':') || throw(JSONParseError("expected : at $(p.i)"))
        p.i = nextind(p.s, p.i)
        obj[key] = parse_value(p)
        skip_ws(p)
        c = p.s[p.i]
        if c == '}'
            p.i = nextind(p.s, p.i)
            return obj
        end
        c == ',' || throw(JSONParseError("expected , at $(p.i)"))
        p.i = nextind(p.s, p.i)
    end
end

function parse_array(p::Parser)
    arr = Any[]
    p.i = nextind(p.s, p.i) # [
    skip_ws(p)
    if p.i <= lastindex(p.s) && p.s[p.i] == ']'
        p.i = nextind(p.s, p.i)
        return arr
    end
    while true
        push!(arr, parse_value(p))
        skip_ws(p)
        c = p.s[p.i]
        if c == ']'
            p.i = nextind(p.s, p.i)
            return arr
        end
        c == ',' || throw(JSONParseError("expected , at $(p.i)"))
        p.i = nextind(p.s, p.i)
    end
end

function read_hex4(p::Parser)
    hex = UInt32(0)
    for _ in 1:4
        p.i = nextind(p.s, p.i)
        p.i > lastindex(p.s) && throw(JSONParseError("truncated unicode escape"))
        h = p.s[p.i]
        digit = h in '0':'9' ? UInt32(h) - UInt32('0') :
                h in 'a':'f' ? UInt32(h) - UInt32('a') + 10 :
                h in 'A':'F' ? UInt32(h) - UInt32('A') + 10 :
                throw(JSONParseError("bad unicode escape"))
        hex = (hex << 4) | digit
    end
    return hex
end

function parse_string(p::Parser)
    p.s[p.i] == '"' || throw(JSONParseError("expected string at $(p.i)"))
    p.i = nextind(p.s, p.i)
    buf = IOBuffer()
    while p.i <= lastindex(p.s)
        c = p.s[p.i]
        if c == '"'
            p.i = nextind(p.s, p.i)
            return String(take!(buf))
        elseif c == '\\'
            p.i = nextind(p.s, p.i)
            p.i > lastindex(p.s) && throw(JSONParseError("bad escape at end of input"))
            e = p.s[p.i]
            if e == 'u'
                cp = read_hex4(p)
                if 0xD800 <= cp <= 0xDBFF
                    i1 = nextind(p.s, p.i)
                    i2 = i1 <= lastindex(p.s) ? nextind(p.s, i1) : i1
                    if i2 <= lastindex(p.s) && p.s[i1] == '\\' && p.s[i2] == 'u'
                        p.i = i2
                        low = read_hex4(p)
                        0xDC00 <= low <= 0xDFFF || throw(JSONParseError("bad surrogate pair"))
                        cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00)
                    else
                        throw(JSONParseError("lonely high surrogate"))
                    end
                elseif 0xDC00 <= cp <= 0xDFFF
                    throw(JSONParseError("lonely low surrogate"))
                end
                print(buf, Char(cp))
            elseif e == 'n'
                print(buf, '\n')
            elseif e == 't'
                print(buf, '\t')
            elseif e == 'r'
                print(buf, '\r')
            elseif e == 'b'
                print(buf, '\b')
            elseif e == 'f'
                print(buf, '\f')
            elseif e == '"' || e == '\\' || e == '/'
                print(buf, e)
            else
                throw(JSONParseError("bad escape"))
            end
            p.i = nextind(p.s, p.i)
        else
            print(buf, c)
            p.i = nextind(p.s, p.i)
        end
    end
    throw(JSONParseError("unterminated string"))
end

function parse_number(p::Parser)
    j = p.i
    while j <= lastindex(p.s) && (isdigit(p.s[j]) || p.s[j] in ('-', '+', '.', 'e', 'E'))
        j = nextind(p.s, j)
    end
    txt = SubString(p.s, p.i, prevind(p.s, j))
    p.i = j
    return occursin(r"[.eE]", txt) ? parse(Float64, txt) : parse(Int, txt)
end

parse_json(text::AbstractString) = parse_value(Parser(String(text), firstindex(text)))

# ---------- the audit ----------
struct FieldFailure
    tradeline_id::String
    field::String
    rule::String
    citation::String
    detail::String
end

const ACCURACY = "15 U.S.C. § 1681e(b) — maximum possible accuracy"
const REINVEST = "15 U.S.C. § 1681i — duty to reinvestigate"
const METRO2 = "Metro 2 conformance — field must conform to the reporting standard"

blank(v) = v === nothing || (v isa AbstractString && (strip(v) == "" || strip(v) == "--"))

function audit_tradeline(tl)
    f = tl["fields"]
    fails = FieldFailure[]
    id = tl["id"]
    for req in ("account_status", "loan_type", "payment_status")
        if blank(get(f, req, nothing))
            push!(fails, FieldFailure(id, req, "blank_required_field", METRO2,
                "required field is blank or unreported"))
        end
    end
    if !haskey(f, "balance_owed") || f["balance_owed"] === nothing
        push!(fails, FieldFailure(id, "balance_owed", "blank_required_field", METRO2,
            "balance owed is not reported"))
    end
    lv, dr = get(f, "last_verified", nothing), get(f, "date_reported", "")
    if blank(lv)
        push!(fails, FieldFailure(id, "last_verified", "missing_verification", ACCURACY,
            "tradeline was never verified"))
    elseif lv < dr
        push!(fails, FieldFailure(id, "last_verified", "missing_verification", ACCURACY,
            "last verified $lv predates the reported date $dr — the record on file is unverified"))
    end
    remarks = uppercase(String(get(f, "creditor_remarks", "")))
    bal = get(f, "balance_owed", 0)
    if occursin("CANNOT LOCATE", remarks) && get(f, "account_status", "") == "Open" && bal isa Number && bal > 0
        push!(fails, FieldFailure(id, "creditor_remarks", "incoherent_remark", ACCURACY,
            "furnisher reports it cannot locate the consumer while reporting an open balance of $bal"))
    end
    dla, dop = get(f, "date_last_activity", ""), get(f, "date_opened", "")
    if !blank(dla) && !blank(dop) && dla < dop
        push!(fails, FieldFailure(id, "date_last_activity", "date_incoherence", METRO2,
            "last activity $dla predates the account opening $dop"))
    end
    if get(f, "account_status", "") == "Closed" && blank(get(f, "closed_date", nothing))
        push!(fails, FieldFailure(id, "closed_date", "missing_closure_date", METRO2,
            "closed account reports no closure date"))
    end
    if get(f, "account_status", "") == "Closed"
        for stale in ("payment_status", "term_length")
            if haskey(f, stale) && !blank(f[stale])
                push!(fails, FieldFailure(id, stale, "stale_terms_on_closed", ACCURACY,
                    "closed account still reports active terms ($stale = $(f[stale])) — the record presents a closed obligation as a live one"))
            end
        end
    end
    if get(tl, "certified", false) != true
        push!(fails, FieldFailure(id, "(tradeline)", "uncertified_tradeline", REINVEST,
            "content was never certified to be in conformity with reporting standards"))
    end
    return fails
end

audit_report(report) = vcat([audit_tradeline(tl) for tl in report["tradelines"]]...)

const PERMISSIBLE = "15 U.S.C. § 1681b (FCRA § 604) — a consumer report may be furnished only for a permissible purpose"

"""
The second front of the algorithm: inquiries. An inquiry on the file
without documented permissible purpose is challenged on its own —
remove it, or provide physical proof of the permissible purpose.
"""
function audit_inquiries(report)
    fails = FieldFailure[]
    for inq in get(report, "inquiries", [])
        if get(inq, "permissible_purpose_documented", false) != true
            push!(fails, FieldFailure("INQ:" * inq["creditor"], "inquiry", "inquiry_without_permissible_purpose",
                PERMISSIBLE, "inquiry by " * inq["creditor"] * " dated " * inq["date"] *
                " carries no documented permissible purpose"))
        end
    end
    return fails
end

# ---------- letters ----------
# The full letter algorithm, in the owner's structure: a standards
# frame that fixes the burden of proof, one block per account with
# its failing fields marked and a per-account deletion verdict, a
# certification demand with a named escalation path, and a closing
# shield that pre-answers the bureau's form-letter stall.
const LETTER_FRAME = "To whom it may concern: According to the FCRA and Metro 2 compliance reporting standards, the information listed above is my most up-to-date personal information. If what you have on file for me doesn't match what's listed, then there are problems with either your records or those who provide them for verification purposes. In order to comply with FCRA and Metro 2 compliance regulations, my profile must be accurate and thorough. You must finish your information verification within a reasonable time frame and be able to evaluate and confirm all of the information in my credit report. My credit history, as well as the following information, have never been validated or correctly reported. I will exercise my consumer rights by requesting that factually truthful, verifiable, and compliant data be obtained and placed on my credit report. I also require that any mistakes be fixed permanently."

const ACCOUNT_VERDICT = "Your information is outdated and does not meet the accuracy standards we require. If it is not updated immediately, legal action may be necessary. We value accuracy in our databases and credit reports, so please delete this information immediately."

const UNCERTIFIED_VERDICT = "The content mentioned above has never been certified to conform to any reporting standards. The data provided has never been verified or complete, and it's also out of date. In order to comply with reporting obligations and consumer legislation, documentation confirming compliance is required. The information given so far is insufficient, and I demand that any wrong, incomplete, or unsupported material be deleted."

const CRRG_FRAME = "To whom it may concern: This document is my request for any information on my delinquency or derogatory behavior. I would like this information to be reported accurately and completely in accordance with all established laws and standards. I want any potential negative information to be confirmed. I want to know the absolute truth and facts about it, even if it is certified. You need to have a process for reporting which follows the Metro 2 data field formatted reporting standard. I don't think your report is accurate because of the claims in this complaint. I don't think your report is accurate. I challenge you to make a document that shows all of the evidence for each claim. The document should be verified as correct, complete, and true. You should be aware that, according to the 2020 CRRG: \"ANY DEVIATION OF THESE STANDARDS JEOPARDIZES THE INTEGRITY OF THE DATA.\" The below-noted claims are disputed and have not been confirmed as facts. I am requesting that you remove any false accounts from my credit report. I only want factually accurate, verified, and compliant data documented on my credit report."

const LONG_FRAME = "To whom it may concern: I am writing to notify you of your legal obligation to adhere to the Fair Credit Reporting Act (FCRA), Metro 2 compliance standards, and other federal and state consumer rights. I challenge all inaccuracies or deficiencies of reporting. Please review your data on file for me and make any necessary corrections. As you may know, the Fair Credit Reporting Act (FCRA) is a federal law that promotes the accuracy, fairness, and privacy of information in the files of consumer reporting agencies (CRAs). Under the FCRA, CRAs must take reasonable steps to ensure the maximum possible accuracy of the information they report. They must also correct or delete inaccurate or incomplete information. That being said, you have a responsibility under the Fair Credit Reporting Act to promptly delete any information which is inaccurate or incomplete. It's important to note that under the FCRA, even if an account has only been speculated upon or never confirmed in any way — the burden falls on you (the credit bureau) to provide evidence of its veracity before it can be placed on my credit report. Furthermore, the Metro 2 standard is a common format for reporting credit information, developed by the Consumer Data Industry Association (CDIA) and used by all major credit reporting agencies (CRAs). My credit report data is wrong, which has a negative impact on my credit score! The information in my credit report isn't accurate, so it's not going to be compliant with Metro 2 standards. It was never validated, meaning no one knows if these numbers really represent me or what they're saying about my finances. Now I am exercising my consumer rights and will not stand for it any longer. I'm contacting you because the following account allegations are either untrue, unverified, and incorrect. Please remove them immediately, or I will have no choice but to take legal action against your business! I am writing to remind you that the Federal Trade Commission (FTC) has strict laws relating specifically toward credit reporting agencies. If I do not hear back from your company within thirty days, then it will be reported as non-compliance and an investigation may ensue! Please take this seriously — you might end up costing yourself much more than just dollars in court fees if things go wrong with these types of cases, because their intent was never about money but rather protecting consumers' rights."

const MASTER_FRAME = "To whom it may concern: I am contesting the information on my credit report that I believe is not correct. According to the federal and state laws that apply to me, you are required to report information accurately and completely. You should not keep or report anything that you know is not in compliance with the law or regulations. I am writing to let you know that you need to make sure everything in my credit report is accurate. This includes making sure that you adhere to all FCRA and METRO 2 format reporting standards. For every account that you're reporting, I need evidence (physically verifiable) that you verified the information to be accurate and compliant. For every inquiry I request proof that you confirmed that the creditor had a permissible purpose. I am giving you a month to investigate this matter and determine whether it is still accurate, valid and in compliance. If you cannot provide proof that the information is accurate, compliant or valid I demand that you remove it from the report. I would also like for you to mail me physical proof of the actions you have taken to correct my credit report and a new updated report. This will help me stay updated on the progress you are making. The following items on my report appear questionable! Please certify that all claims are true and accurate, complete and timely reported."

frame_for_round(order) = order == 1 ? LONG_FRAME : order == 2 ? MASTER_FRAME : order == 3 ? CRRG_FRAME : LETTER_FRAME

const CERTIFY_DEMAND = "Appreciatively — You are violating my rights! I have listed the concerns about your reporting in this document. It's not complete and does not meet my standards; according to law, you must certify all aspects of required FCRA/Metro 2 compliance which is done truthfully, correctly (in a timely manner), completely AND accurately as well — or else I would have to escalate these issues to the CFPB, FTC and my Attorney General."

const ANTI_STALL_SHIELD = "I am aware that you have been sending out form letters in response to many of the disputes and challenges that consumers have submitted, regardless of the specific information that they have provided. This is illegal, as each dispute and challenge must be addressed individually and on its own merits. My letters were created using software that is available to everyone. If you don't process my letters, you are violating 15 U.S. Code § 1681i. Keep in mind, you are not allowed to delay processing letters from consumers based on the assumption that help from a third party may be available. This is not a legal exception! I am the author of any letters you receive with my name on them. Either I or my advisors wrote them with my full knowledge and consent. I am aware that there is no law that says you need to provide a Power of Attorney in order to delay processing letters from a consumer. If you do not process my letters in a timely manner, I will consider it to be an intentional disregard of my rights as a consumer. I will then contact my lawyer to take legal action."

const INQUIRY_DEMAND = "I would like this removed or proof provided that you have permission to pursue this course of action under the Fair Credit Reporting Act. Please provide documentation showing compliance with FCRA guidelines. Please respond as soon as possible."

function render_letter(consumer, bureau, targets, failures; frame = LETTER_FRAME, inquiries = FieldFailure[])
    io = IOBuffer()
    println(io, consumer)
    println(io, "[CONSUMER ADDRESS]")
    println(io)
    println(io, bureau)
    println(io, "[BUREAU ADDRESS]")
    println(io)
    println(io, frame)
    for tl in targets
        tfails = [fl for fl in failures if fl.tradeline_id == tl["id"]]
        isempty(tfails) && continue
        println(io)
        println(io, tl["creditor"])
        println(io, "Account: ", tl["account_ref"], " — ", bureau)
        for fl in tfails
            println(io, "  [MARKED] ", fl.field, ": ", fl.detail, " [", fl.rule, "; ", fl.citation, "]")
        end
        println(io, any(fl -> fl.rule == "uncertified_tradeline", tfails) ? UNCERTIFIED_VERDICT : ACCOUNT_VERDICT)
    end
    if !isempty(inquiries)
        println(io)
        println(io, "Inquiries")
        for fl in inquiries
            println(io, "  [MARKED] ", fl.detail, " [", fl.rule, "; ", fl.citation, "]")
            println(io, INQUIRY_DEMAND)
        end
    end
    println(io)
    println(io, CERTIFY_DEMAND)
    println(io)
    println(io, consumer)
    println(io, "Please send your written response to my address above.")
    println(io)
    println(io, ANTI_STALL_SHIELD)
    return String(take!(io))
end

# ---------- the feedback loop: rounds over report snapshots ----------
mutable struct VerdictChain
    entries::Vector{Tuple{String,String}} # (canonical record, hash)
    VerdictChain() = new(Tuple{String,String}[])
end

function seal!(chain::VerdictChain, record::String)
    prev = isempty(chain.entries) ? "GENESIS" : chain.entries[end][2]
    h = bytes2hex(sha256(prev * "|" * record))
    push!(chain.entries, (record, h))
    return h
end

function verify_chain(chain::VerdictChain)
    prev = "GENESIS"
    for (record, h) in chain.entries
        bytes2hex(sha256(prev * "|" * record)) == h || return false
        prev = h
    end
    return true
end

function load_rounds(path)
    doc = parse_json(read(path, String))
    filter(r -> get(r, "enabled", false) == true, sort(doc["rounds"], by = r -> r["order"]))
end

"""
Run the campaign: ingest a report snapshot, audit it, fire the next
round at the failures, ingest the next snapshot, audit again. The
delta between snapshots is the feedback; rounds escalate until no
failures survive or the snapshots run out.
"""
function run_campaign(rounds, report_paths; gate = nothing)
    chain = VerdictChain()
    board = []
    reports = [parse_json(read(p, String)) for p in report_paths]
    total_gated = 0
    for (idx, round) in enumerate(rounds)
        idx <= length(reports) || break
        report = reports[idx]
        failures = audit_report(report)
        inq_all = audit_inquiries(report)
        gated = 0
        if gate !== nothing
            kept_f = gate_filter(failures, gate)
            kept_i = gate_filter(inq_all, gate)
            gated = (length(failures) - length(kept_f)) + (length(inq_all) - length(kept_i))
            failures, inq_all = kept_f, kept_i
            total_gated += gated
        end
        failing_ids = unique(fl.tradeline_id for fl in failures)
        tls = Dict(tl["id"] => tl for tl in report["tradelines"])
        bureaus = unique(tls[i]["bureau"] for i in failing_ids)
        inq_by_bureau = Dict{String,Vector{FieldFailure}}()
        inq_meta = Dict("INQ:" * q["creditor"] => q for q in get(report, "inquiries", []))
        for fl in inq_all
            b = inq_meta[fl.tradeline_id]["bureau"]
            push!(get!(inq_by_bureau, b, FieldFailure[]), fl)
        end
        letters = String[]
        if round["granularity"] == "tradeline"
            for b in union(bureaus, keys(inq_by_bureau))
                targets = [tls[i] for i in failing_ids if tls[i]["bureau"] == b]
                push!(letters, render_letter(report["consumer"], b, targets, failures;
                    frame = frame_for_round(round["order"]),
                    inquiries = get(inq_by_bureau, b, FieldFailure[])))
            end
        elseif round["granularity"] == "field"
            for i in failing_ids
                push!(letters, render_letter(report["consumer"], tls[i]["bureau"], [tls[i]], failures))
                if round["scope"] == "bureau-and-creditor"
                    push!(letters, render_letter(report["consumer"], tls[i]["creditor"], [tls[i]], failures))
                end
            end
        elseif round["granularity"] == "per-failure"
            mult = round["scope"] == "bureau-and-creditor" ? 2 : 1
            for fl in failures
                for _ in 1:mult
                    push!(letters, render_letter(report["consumer"], tls[fl.tradeline_id]["bureau"], [tls[fl.tradeline_id]], [fl]))
                end
            end
        end
        record = @sprintf("round=%s report=%s targets=%d failures=%d inquiries=%d gated=%d letters=%d",
            round["id"], report["report_id"], length(failing_ids), length(failures), length(inq_all), gated, length(letters))
        seal!(chain, record)
        push!(board, (round = round["name"], report = report["report_id"],
                      targets = length(failing_ids), failures = length(failures),
                      inquiries = length(inq_all), gated = gated,
                      letters = length(letters), letters_text = letters))
        if isempty(failures) && isempty(inq_all)
            v = (total_gated + gated) > 0 ? "GATED — needs evidence" : "RESOLVED"
            seal!(chain, "verdict=" * v * " report=" * report["report_id"])
            return (board = board, chain = chain, verdict = v)
        end
    end
    final = isempty(reports) ? FieldFailure[] : audit_report(reports[end])
    final_inq = isempty(reports) ? FieldFailure[] : audit_inquiries(reports[end])
    if gate !== nothing
        final = gate_filter(final, gate)
        final_inq = gate_filter(final_inq, gate)
    end
    verdict = if isempty(final) && isempty(final_inq)
        total_gated > 0 ? "GATED — needs evidence" : "RESOLVED"
    else
        "HELD -> escalate"
    end
    seal!(chain, "verdict=" * verdict)
    return (board = board, chain = chain, verdict = verdict)
end

if abspath(PROGRAM_FILE) == @__FILE__
    root = joinpath(@__DIR__, "..")
    rounds = load_rounds(joinpath(root, "rounds", "rounds.json"))
    paths = length(ARGS) >= 2 ? ARGS : [joinpath(root, "sample", "report-round0.json"),
                                        joinpath(root, "sample", "report-round1.json")]
    result = run_campaign(rounds, paths)
    println("--- Sovereign Dispute Engine: Campaign Board ---")
    for row in result.board
        @printf("%-28s report %-10s targets %d  field failures %d  inquiries %d  letters %d\n",
            row.round, row.report, row.targets, row.failures, row.inquiries, row.letters)
    end
    println("Verdict chain valid: ", verify_chain(result.chain))
    println("OVERALL: ", result.verdict)
    if !isempty(result.board)
        println("\n--- First letter of round 1 ---\n")
        println(result.board[1].letters_text[1])
    end
end
