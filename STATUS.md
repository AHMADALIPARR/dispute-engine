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

## Stage 3 — the owner's dilute engine, integrated (2026-11-07)

- `metro2/` holds the owner's Dilute Metro 2 Dispute Engine
  verbatim (evidence-gated rules R01–R07, evaluator, four letter
  templates, dry-run output, draft letters): seven rules that fire
  only when independent evidence satisfies every predicate; anything
  less is `needs_evidence`, and a fired case is
  `human_review_required`, never auto-sent. Its own suite passes
  (`node metro2/test.mjs`); its dry run reproduces byte-identically
  (matched_count 0 — unsubstantiated flags become no disputes).
- PII scan of the package before inclusion: no SSN, DOB, street
  address, full account numbers, or emails in any file.
- Bridge (`engine/EvidenceGate.jl`): a campaign run with
  `gate = load_gate(evaluation.json)` renders letters only for
  records the dilute engine cleared; everything else is counted as
  gated, and a fully gated campaign ends GATED — needs evidence.
  Gate suite: 8/8. Total Julia suite: 66/66.
- The audit also gained his R05's sibling rule from this stage:
  missing_closure_date (closed account, no closure date). Sample
  round-0 failures are now 11; the console board matches.

## Pricing model decision (owner, 2026-11-07)

- The collectivekitty.com tier prices were never self-serve
  products: they were custom-contact signals — reach out, and the
  owner builds you your own airgapped system. That inbound model
  is retired for this product.
- The dispute engine sells as ONE flat fee on a subscription
  basis: billing.json now carries a single plan
  (dispute-engine-flat); per-round credits and tiered plans are
  removed. Amount still null pending the owner's number.
