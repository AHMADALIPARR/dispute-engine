# Sovereign Dispute Engine

The owner's credit-repair algorithm, implemented as software and
powered by the Sovereign Algorithm Engine pattern: ingest, audit,
verdict, feedback, escalation.

The method never argues the debt. It audits the **record**. Every
field of every tradeline must conform to the reporting standard
(Metro 2) and to the bureau's statutory accuracy duty (FCRA). A
field that cannot be proven conforming is marked; the marked fields
become letters demanding documented proof of compliance or
deletion; each round feeds the surviving failures back in at higher
granularity until nothing unverifiable remains.

## The audit (engine/DisputeEngine.jl, Julia, zero dependencies)

- **blank_required_field** — a required field reported blank.
- **missing_verification** — never verified, or last verified before
  the date reported.
- **incoherent_remark** — the furnisher reports it cannot locate
  the consumer while reporting an open balance.
- **date_incoherence** — last activity predating the account opening.
- **stale_terms_on_closed** — a closed account still wearing live
  payment terms.
- **uncertified_tradeline** — content never certified to conform to
  reporting standards.
- **inquiry_without_permissible_purpose** — the second front: an
  inquiry carrying no documented permissible purpose (FCRA § 604).

## The rounds (rounds/rounds.json — one contract, two readers)

1. **Round Kick Regular** — one letter per bureau, every failure.
2. **Nerve Boosted** — one letter per failing tradeline.
3. **Punch of Fury Supreme** — bureau and furnisher served together.
4. **Paralyzing Touch Point Supreme** — every failure its own letter.

Letters are generated in the owner's full structure: the round's
frame fixing the burden of proof, one block per account with its
marked fields and per-account verdict, the certification demand
with its escalation path (CFPB, FTC, Attorney General), and the
closing shield that pre-answers the bureau's form-letter stall
(§ 1681i; authorship declared; no power-of-attorney delay). Every
round seals into a SHA-256 hash-chained verdict log.

## The console (frontend/)

An MDX dispute console in the Panda style — campaign board, round
toggles, and the marked-tradeline exhibit with the owner's green
highlighter. The toggles render the same `rounds/rounds.json` the
engine reads.

## Running

```
julia engine/DisputeEngine.jl     # campaign over the sample reports
julia test/runtests.jl            # the engine suite
cd frontend && npm run check      # MDX compile + contract check
```

Ingest format is the credit-report JSON export (the same shape the
owner's Panda workflow produced: report .html/.json). Sample
reports under `sample/` are synthetic.
