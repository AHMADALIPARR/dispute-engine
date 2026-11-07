# STATUS

Local repository, not pushed. Built 2026-11-07.

## Sources

- The algorithm is the owner's, taken from his own dispute letters
  and Dispute Panda campaign records (photographed 2026-11-07):
  the FCRA/Metro 2 frames (four variants, assigned per round), the
  per-account marked-field blocks and verdicts, the certification
  demand with CFPB/FTC/AG escalation, the § 604 inquiry challenges,
  and the anti-stall shield (§ 1681i, authorship declaration).
  Frame texts are transcribed from his letters; wording follows the
  originals as closely as handwriting transcription allows.
- Dispute Panda is the commercial tool the owner ran this workflow
  in; this engine is an independent implementation of his method,
  not Panda's software. Sample data is synthetic; no real consumer
  data appears anywhere in this repository.

## Verified by execution (Julia 1.11.3, Node 24)

- Engine suite: 42/42 — JSON reader 5, audit 18, campaign 17,
  verdict chain 2.
- Sample campaign: Round Kick Regular over the round-0 report finds
  4 target tradelines, 10 field failures, 2 challenged inquiries,
  and seals 2 bureau letters; Nerve Boosted over the round-1
  snapshot finds the 2 surviving tradelines (4 failures, 1 inquiry)
  and seals 2 letters. Verdict: HELD -> escalate; chain valid.
- Frontend check: 13/13 — MDX compiles, round contract holds,
  campaign board numbers match the engine's sample run exactly.

## Scope limits

- Ingest is JSON. PDF/HTML report parsing is the next stage — the
  owner holds the full PDF of his own report for that wiring.
- Letters render to text with [CONSUMER ADDRESS] / [BUREAU ADDRESS]
  placeholders; nothing is mailed, transmitted, or filed by this
  software. Mailing stays a human act, as it was with the letters.
- The audit encodes the owner's dispute rules as shown in his
  letters; it is a document engine, not legal advice.

## Stage 2 — CRM + merchant rail (2026-11-07)

- CRM (engine/CRM.jl): the client book — clients, reports,
  campaigns, invoices — on a local JSON store with its own writer;
  every event seals into the verdict chain. Suite now 57/57.
- Billing (billing/billing.json): the Stripe object map (customers
  mirror from the CRM, subscriptions for plans, Checkout for
  credits, invoices mirror into the book). All amounts are null:
  pricing is the owner's decision, and unset prices sell nothing.
- Stripe merchant account: NOT connected at build time (checked via
  the connector: not_connected). The connect flow is OAuth; no keys
  are stored in this repository or anywhere in the stack.
- Console: clients board + merchant panel added; check 17/17.
