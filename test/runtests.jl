using Test

include(joinpath(@__DIR__, "..", "engine", "DisputeEngine.jl"))

root = joinpath(@__DIR__, "..")
r0 = parse_json(read(joinpath(root, "sample", "report-round0.json"), String))
r1 = parse_json(read(joinpath(root, "sample", "report-round1.json"), String))

@testset "json reader" begin
    @test r0["report_id"] == "SAMPLE-R0"
    @test length(r0["tradelines"]) == 5
    @test r0["tradelines"][1]["fields"]["balance_owed"] == 4242
    @test r0["tradelines"][3]["certified"] == true
    @test_throws JSONParseError parse_json("{bad")
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
    @test length(byid["T5"]) == 3
    @test length(fails) == 10
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
    @test result.board[1].failures == 10
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
end

@testset "verdict chain: tamper refused" begin
    chain = VerdictChain()
    seal!(chain, "a")
    seal!(chain, "b")
    @test verify_chain(chain)
    push!(chain.entries, ("forged", chain.entries[end][2]))
    @test !verify_chain(chain)
end
