# CRM — the client book of the dispute practice.
#
# Panda-shaped on the surface (clients, reports, attacks, letters,
# invoices) because that is the workflow the owner runs; sovereign
# underneath: the book is a local JSON store, every event seals into
# the hash chain, and the payment rail (Stripe) mirrors INTO this
# book — the book is never a mirror of the rail.
#
# Included by DisputeEngine.jl's caller, after the engine: it uses
# the engine's JSON reader and VerdictChain.

struct CRMStore
    path::String
    data::Dict{String,Any}
end

function crm_load(path)
    data = isfile(path) ? parse_json(read(path, String)) :
           Dict{String,Any}("clients" => Any[], "events" => Any[])
    return CRMStore(path, data)
end

crm_save(store::CRMStore) = write(store.path, json_write(store.data))

# Small JSON writer (the engine ships a reader; the book needs both).
function json_write(x)
    io = IOBuffer()
    write_json(io, x)
    return String(take!(io))
end

function write_json(io, x::AbstractDict)
    print(io, "{")
    for (i, (k, v)) in enumerate(sort(collect(x), by = first))
        i > 1 && print(io, ",")
        write_json(io, String(k))
        print(io, ":")
        write_json(io, v)
    end
    print(io, "}")
end

function write_json(io, x::AbstractVector)
    print(io, "[")
    for (i, v) in enumerate(x)
        i > 1 && print(io, ",")
        write_json(io, v)
    end
    print(io, "]")
end

function write_json(io, x::AbstractString)
    print(io, "\"")
    for c in x
        if c == '"'
            print(io, "\\\"")
        elseif c == '\\'
            print(io, "\\\\")
        elseif c == '\n'
            print(io, "\\n")
        else
            print(io, c)
        end
    end
    print(io, "\"")
end

write_json(io, x::Bool) = print(io, x ? "true" : "false")
write_json(io, x::Nothing) = print(io, "null")
write_json(io, x::Number) = print(io, x)

function crm_event!(store::CRMStore, chain::VerdictChain, record::String)
    h = seal!(chain, record)
    push!(store.data["events"], Dict{String,Any}("record" => record, "hash" => h))
    return h
end

function crm_add_client!(store::CRMStore, chain::VerdictChain; name, email)
    id = "C" * bytes2hex(sha256(name * email))[1:8]
    any(c -> c["id"] == id, store.data["clients"]) && return id
    push!(store.data["clients"], Dict{String,Any}(
        "id" => id, "name" => name, "email" => email,
        "status" => "Ready To Attack", "reports" => Any[],
        "campaigns" => Any[], "invoices" => Any[],
        "stripe_customer" => nothing))
    crm_event!(store, chain, "client_added id=$id")
    return id
end

function crm_client(store::CRMStore, id)
    for c in store.data["clients"]
        c["id"] == id && return c
    end
    throw(KeyError(id))
end

function crm_attach_report!(store::CRMStore, chain::VerdictChain, client_id, report_id)
    c = crm_client(store, client_id)
    push!(c["reports"], report_id)
    crm_event!(store, chain, "report_attached client=$client_id report=$report_id")
end

"""Record a finished campaign (the board run_campaign returned) on the client."""
function crm_record_campaign!(store::CRMStore, chain::VerdictChain, client_id, result)
    c = crm_client(store, client_id)
    letters = sum(row.letters for row in result.board; init = 0)
    push!(c["campaigns"], Dict{String,Any}(
        "rounds" => length(result.board), "letters" => letters,
        "verdict" => result.verdict))
    c["status"] = result.verdict == "RESOLVED" ? "Resolved" : "In Round"
    crm_event!(store, chain, "campaign_recorded client=$client_id letters=$letters verdict=$(result.verdict)")
    return letters
end

"""An invoice line in the book. The Stripe invoice is its mirror on
the rail; this record is the practice's own truth."""
function crm_add_invoice!(store::CRMStore, chain::VerdictChain, client_id;
                          description, amount_cents, stripe_invoice = nothing)
    c = crm_client(store, client_id)
    inv = Dict{String,Any}("description" => description,
        "amount_cents" => amount_cents, "status" => "open",
        "stripe_invoice" => stripe_invoice)
    push!(c["invoices"], inv)
    crm_event!(store, chain, "invoice_added client=$client_id amount_cents=$amount_cents")
    return inv
end

function crm_link_stripe_customer!(store::CRMStore, chain::VerdictChain, client_id, stripe_customer_id)
    crm_client(store, client_id)["stripe_customer"] = stripe_customer_id
    crm_event!(store, chain, "stripe_customer_linked client=$client_id")
end

"""The Panda-style client row: name, status, rounds run, letters sent, open balance."""
function crm_summary(store::CRMStore, client_id)
    c = crm_client(store, client_id)
    rounds = sum(get(camp, "rounds", 0) for camp in c["campaigns"]; init = 0)
    letters = sum(get(camp, "letters", 0) for camp in c["campaigns"]; init = 0)
    open_cents = sum(get(inv, "amount_cents", 0) for inv in c["invoices"] if get(inv, "status", "") == "open"; init = 0)
    return (name = c["name"], status = c["status"], reports = length(c["reports"]),
            rounds = rounds, letters = letters, open_balance_cents = open_cents)
end
