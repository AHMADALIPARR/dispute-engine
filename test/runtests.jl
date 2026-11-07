using Test

include(joinpath(@__DIR__, "..", "engine", "DisputeEngine.jl"))
include(joinpath(@__DIR__, "..", "engine", "CRM.jl"))
include(joinpath(@__DIR__, "..", "engine", "EvidenceGate.jl"))

root = joinpath(@__DIR__, "..")
r0 = parse_json(read(joinpath(root, "sample", "report-round0.json"), String))
r1 = parse_json(read(joinpath(root, "sample", "report-round1.json"), String))

@testset "json reader" begin
    @test r0["report_id"] == "SAMPLE-R0"
    @test length(r0["tradelines"]) == 5
    @test r0["tradelines"][1]["fields"]["balance_owed"] == 4242
    @test r0["tradelines"][3]["certified"] == true
    @test r0["tradelines"][1]["account_ref"] == "\u2022\u2022420"
    @test parse_json("\"\\u2022\\u2022420\"") == "\u2022\u2022420"
    @test parse_json("\"a\\nb\\t\\r\\b\\f\\\"\\\\/\"") == "a\nb\t\r\b\f\"\\/"
    @test parse_json("\"\\uD83D\\uDE00\"") == "😀"
    @test_throws JSONParseError parse_json("{bad")
    @test_throws JSONParseError parse_json("\"\\q\"")
end

@testset "audit: planted failures found, control clean" begin
    fails = audit_report(r0)
    byid = Dict(id => [fl.rule for fl in fails if fl.tradeline_id == id] for id in ("T1", "T2", "T3", "T4", "T5"))
    @test "incoherent_remark" in byid["T1"]
    @test "uncertified_tradeline" in byid["T1"]
    @test length(byid["T1"]) == 2
    @test "blank_required_field" in byid["T2"]
    @test "missing_verification" in byid["T2"]
    @test "uncertified_tradeline" in byid["T2"]
    @test length(byid["T2"]) == 3
    @test isempty(byid["T3"])
    @test "date_incoherence" in byid["T4"]
    @test "missing_verification" in byid["T4"]
    @test length(byid["T4"]) == 2
    # The Affirm-pattern tradeline: closed, but still wearing live terms,
    # and its last activity predates its opening.
    @test count(==("stale_terms_on_closed"), byid["T5"]) == 2
    @test "date_incoherence" in byid["T5"]
    @test length(byid["T5"]) == 4
    @test "missing_closure_date" in byid["T5"]
    @test length(fails) == 11
    # Inquiries: two undocumented, one documented control.
    inq = audit_inquiries(r0)
    @test length(inq) == 2
    @test all(fl -> fl.rule == "inquiry_without_permissible_purpose", inq)
    @test occursin("1681b", inq[1].citation)
end

@testset "campaign: the loop converges by escalation" begin
    rounds = load_rounds(joinpath(root, "rounds", "rounds.json"))
    @test [r["id"] for r in rounds] == ["round-kick-regular", "nerve-boosted", "punch-of-fury-supreme"]
    result = run_campaign(rounds, [joinpath(root, "sample", "report-round0.json"),
                                   joinpath(root, "sample", "report-round1.json")])
    # Round 1: 4 targets, 10 failures, 2 challenged inquiries,
    # one letter per bureau (Experian + Equifax).
    @test result.board[1].targets == 4
    @test result.board[1].failures == 11
    @test result.board[1].inquiries == 2
    @test result.board[1].letters == 2
    # Round 2 on the surviving snapshot: T1/T5 deleted, T2/T4 remain
    # (2+2 failures), one inquiry still undocumented, one letter per tradeline.
    @test result.board[2].targets == 2
    @test result.board[2].failures == 4
    @test result.board[2].inquiries == 1
    @test result.board[2].letters == 2
    @test result.verdict == "HELD -> escalate"
    @test verify_chain(result.chain)
    # Letters carry the full algorithm: the Round Kick frame, the marked
    # fields, the certification demand, and the anti-stall shield.
    alltext = join(vcat([row.letters_text for row in result.board]...), "\n")
    @test occursin("burden falls on you (the credit bureau)", alltext)
    @test occursin("incoherent_remark", alltext)
    @test occursin("1681e(b)", alltext)
    @test occursin("CFPB, FTC and my Attorney General", alltext)
    @test occursin("intentional disregard of my rights", alltext)
    @test occursin("permissible purpose", alltext)
    @test occursin("\u2022\u2022420", result.board[1].letters_text[1])
    @test !occursin("u2022", result.board[1].letters_text[1])
    @test occursin(INQUIRY_DEMAND, alltext)
end

@testset "crm: the book keeps the practice" begin
    path = tempname() * ".json"
    store = crm_load(path)
    chain = VerdictChain()
    cid = crm_add_client!(store, chain; name = "SAMPLE CONSUMER", email = "sample@example.com")
    @test crm_add_client!(store, chain; name = "SAMPLE CONSUMER", email = "sample@example.com") == cid
    crm_attach_report!(store, chain, cid, "SAMPLE-R0")
    crm_attach_report!(store, chain, cid, "SAMPLE-R1")
    rounds = load_rounds(joinpath(root, "rounds", "rounds.json"))
    result = run_campaign(rounds, [joinpath(root, "sample", "report-round0.json"),
                                   joinpath(root, "sample", "report-round1.json")])
    letters = crm_record_campaign!(store, chain, cid, result)
    @test letters == 4
    crm_add_invoice!(store, chain, cid; description = "Attack Round Credit x2", amount_cents = 0)
    crm_link_stripe_customer!(store, chain, cid, "cus_SAMPLE")
    s = crm_summary(store, cid)
    @test s.status == "In Round"
    @test s.reports == 2
    @test s.rounds == 2
    @test s.letters == 4
    @test s.open_balance_cents == 0
    # The book survives a save/load round trip through its own writer+reader.
    crm_save(store)
    store2 = crm_load(path)
    @test crm_summary(store2, cid) == s
    @test crm_client(store2, cid)["stripe_customer"] == "cus_SAMPLE"
    @test length(store2.data["events"]) == length(store.data["events"])
    rm(path; force = true)
end

@testset "evidence gate: the dilute engine guards the press" begin
    # A gate clearing only T1 and one inquiry (as a dilute evaluation
    # with human_review_required cases would produce).
    gatefile = tempname() * ".json"
    write(gatefile, """{"cases":[
      {"record_id":"T1","status":"human_review_required"},
      {"record_id":"INQ:SAMPLE AUTO GROUP","status":"human_review_required"},
      {"record_id":"T2","status":"needs_evidence"},
      {"record_id":"T4","status":"needs_evidence"},
      {"record_id":"T5","status":"needs_evidence"}]}""")
    gate = load_gate(gatefile)
    @test gate == Set(["T1", "INQ:SAMPLE AUTO GROUP"])
    rounds = load_rounds(joinpath(root, "rounds", "rounds.json"))
    result = run_campaign(rounds, [joinpath(root, "sample", "report-round0.json")]; gate = gate)
    @test result.board[1].targets == 1
    @test result.board[1].failures == 2
    @test result.board[1].inquiries == 1
    # Two letters: Experian carries T1; Equifax carries the cleared inquiry.
    @test result.board[1].letters == 2
    @test result.board[1].gated == 10
    # A gate that clears nothing renders nothing and says why.
    write(gatefile, """{"cases":[{"record_id":"T1","status":"needs_evidence"}]}""")
    result2 = run_campaign(rounds, [joinpath(root, "sample", "report-round0.json")]; gate = load_gate(gatefile))
    @test result2.board[1].letters == 0
    @test result2.verdict == "GATED — needs evidence"
    rm(gatefile; force = true)
end

@testset "billing catalog: shaped, unpriced, honest" begin
    billing = parse_json(read(joinpath(root, "billing", "billing.json"), String))
    @test billing["merchant"]["processor"] == "stripe"
    @test billing["merchant"]["state"] == "connected"
    @test all(p -> p["amount_cents"] === nothing, billing["plans"])
    @test all(p -> p["amount_cents"] === nothing, billing["products"])
    @test haskey(billing["merchant"]["stripe_objects"], "customers")
end

@testset "verdict chain: tamper refused" begin
    chain = VerdictChain()
    seal!(chain, "a")
    seal!(chain, "b")
    @test verify_chain(chain)
    push!(chain.entries, ("forged", chain.entries[end][2]))
    @test !verify_chain(chain)
end
