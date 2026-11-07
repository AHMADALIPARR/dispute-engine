# Export a campaign as JSON.
#
# With no arguments, print the engine seal: letter copy, the synthetic
# sample campaigns, audit rows, and the sample client id. The browser
# console and frontend/integration.mjs both treat this document as the
# Julia engine's output. With report paths, print one campaign instead.
#
#   julia engine/export_campaign.jl
#   julia engine/export_campaign.jl sample/report-round0.json sample/report-round1.json
#   julia engine/export_campaign.jl --gate frontend/fixtures/gate-sample.json sample/report-round0.json
#
# Nothing is mailed, posted, or written except JSON on stdout.

include(joinpath(@__DIR__, "DisputeEngine.jl"))
include(joinpath(@__DIR__, "CRM.jl"))
include(joinpath(@__DIR__, "EvidenceGate.jl"))

const RESOLVED_REPORT_JSON = """
{"consumer":"SAMPLE CONSUMER","report_id":"SAMPLE-CLEAN","tradelines":[{"id":"OK","creditor":"SAMPLE CLEAN CREDITOR","bureau":"Experian","account_ref":"\\u2022\\u2022000","certified":true,"fields":{"account_status":"Open","loan_type":"Auto","payment_status":"AsAgreed","balance_owed":10,"last_verified":"2024-05-02","date_reported":"2024-05-01","date_last_activity":"2024-05-01","date_opened":"2024-01-01","creditor_remarks":""}}],"inquiries":[{"bureau":"Experian","creditor":"SAMPLE DOCUMENTED","date":"2024-01-01","permissible_purpose_documented":true}]}
"""

function campaign_doc(result)
    rounds = Any[]
    for row in result.board
        push!(rounds, Dict{String,Any}(
            "round" => row.round,
            "report" => row.report,
            "targets" => row.targets,
            "failures" => row.failures,
            "inquiries" => row.inquiries,
            "gated" => row.gated,
            "letters" => row.letters,
            "letter_text" => row.letters_text,
        ))
    end
    chain = Any[]
    for (record, h) in result.chain.entries
        push!(chain, Dict{String,Any}("record" => record, "hash" => h))
    end
    return Dict{String,Any}(
        "verdict" => result.verdict,
        "chain_valid" => verify_chain(result.chain),
        "chain" => chain,
        "rounds" => rounds,
    )
end

function failure_doc(fl::FieldFailure)
    Dict{String,Any}(
        "tradeline_id" => fl.tradeline_id,
        "field" => fl.field,
        "rule" => fl.rule,
        "citation" => fl.citation,
        "detail" => fl.detail,
    )
end

function audit_doc(report)
    Dict{String,Any}(
        "failures" => Any[failure_doc(fl) for fl in audit_report(report)],
        "inquiries" => Any[failure_doc(fl) for fl in audit_inquiries(report)],
    )
end

function rounds_with_ids(root, ids)
    doc = parse_json(read(joinpath(root, "rounds", "rounds.json"), String))
    wanted = Set(ids)
    filter(r -> r["id"] in wanted, sort(doc["rounds"], by = r -> r["order"]))
end

function parse_cli(args)
    gate = nothing
    paths = String[]
    i = 1
    while i <= length(args)
        if args[i] == "--gate"
            i += 1
            i > length(args) && error("--gate needs a file")
            gate = args[i]
        else
            push!(paths, args[i])
        end
        i += 1
    end
    return gate, paths
end

function full_seal(root)
    r0 = joinpath(root, "sample", "report-round0.json")
    r1 = joinpath(root, "sample", "report-round1.json")
    armed = load_rounds(joinpath(root, "rounds", "rounds.json"))
    report0 = parse_json(read(r0, String))
    report1 = parse_json(read(r1, String))
    resolved_path = tempname() * ".json"
    write(resolved_path, RESOLVED_REPORT_JSON)
    resolved_report = parse_json(RESOLVED_REPORT_JSON)
    store = crm_load(tempname() * ".json")
    client_chain = VerdictChain()
    client_id = crm_add_client!(store, client_chain; name = "SAMPLE CONSUMER", email = "sample@example.com")
    try
        return Dict{String,Any}(
            "schema" => "dispute-engine-seal/1",
            "engine" => "engine/DisputeEngine.jl",
            "copy" => Dict{String,Any}(
                "ACCURACY" => ACCURACY,
                "REINVEST" => REINVEST,
                "METRO2" => METRO2,
                "PERMISSIBLE" => PERMISSIBLE,
                "LETTER_FRAME" => LETTER_FRAME,
                "ACCOUNT_VERDICT" => ACCOUNT_VERDICT,
                "UNCERTIFIED_VERDICT" => UNCERTIFIED_VERDICT,
                "CRRG_FRAME" => CRRG_FRAME,
                "LONG_FRAME" => LONG_FRAME,
                "MASTER_FRAME" => MASTER_FRAME,
                "CERTIFY_DEMAND" => CERTIFY_DEMAND,
                "ANTI_STALL_SHIELD" => ANTI_STALL_SHIELD,
                "INQUIRY_DEMAND" => INQUIRY_DEMAND,
            ),
            "sample_client_id" => client_id,
            "sample_client_chain" => Any[Dict{String,Any}("record" => rec, "hash" => h) for (rec, h) in client_chain.entries],
            "resolved_report" => resolved_report,
            "audits" => Dict{String,Any}(
                "r0" => audit_doc(report0),
                "r1" => audit_doc(report1),
            ),
            "campaigns" => Dict{String,Any}(
                "sample" => campaign_doc(run_campaign(armed, [r0, r1])),
                "gated" => campaign_doc(run_campaign(armed, [r0]; gate = load_gate(joinpath(root, "frontend", "fixtures", "gate-sample.json")))),
                "gated_none" => campaign_doc(run_campaign(armed, [r0]; gate = load_gate(joinpath(root, "frontend", "fixtures", "gate-none.json")))),
                "punch" => campaign_doc(run_campaign(rounds_with_ids(root, ["punch-of-fury-supreme"]), [r0])),
                "fury" => campaign_doc(run_campaign(rounds_with_ids(root, ["paralyzing-touch-point-supreme"]), [r0])),
                "resolved" => campaign_doc(run_campaign(rounds_with_ids(root, ["round-kick-regular"]), [resolved_path])),
                "empty_rounds" => campaign_doc(run_campaign(Any[], [r0])),
            ),
        )
    finally
        rm(resolved_path; force = true)
    end
end

function main()
    root = joinpath(@__DIR__, "..")
    gatepath, paths = parse_cli(ARGS)
    if isempty(paths)
        println(json_write(full_seal(root)))
        return
    end
    gate = gatepath === nothing ? nothing : load_gate(gatepath)
    rounds = load_rounds(joinpath(root, "rounds", "rounds.json"))
    println(json_write(campaign_doc(run_campaign(rounds, paths; gate = gate))))
end

if abspath(PROGRAM_FILE) == @__FILE__
    main()
end
