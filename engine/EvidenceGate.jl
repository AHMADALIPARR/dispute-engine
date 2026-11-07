# EvidenceGate — the bridge to the owner's dilute Metro 2 evaluator
# (metro2/, included verbatim in this repository).
#
# The dilute engine is the evidence discipline in front of the
# letter press: a case exists only when independent evidence makes
# every predicate of a rule true, and even then its status is
# human_review_required — never auto-send. This bridge reads a
# dilute evaluation and returns the set of record ids cleared for
# letters. Run a campaign with gate = that set and the press renders
# nothing for an uncleared record: the audit may mark a field, but
# only evidence puts it in an envelope.

function load_gate(evaluation_path)
    doc = parse_json(read(evaluation_path, String))
    cleared = Set{String}()
    for c in doc["cases"]
        if c["status"] == "human_review_required"
            push!(cleared, c["record_id"])
        end
    end
    return cleared
end

gate_filter(failures, cleared) = filter(fl -> fl.tradeline_id in cleared, failures)
