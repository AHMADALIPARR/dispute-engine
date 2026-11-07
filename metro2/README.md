# Dilute Metro 2 Dispute Engine

Inputs: screenshot-derived records plus independent evidence. The JSON package includes normalized observations, seven evidence-gated rules, four letter templates, and workflow configuration. Historical items are not assumed to appear on a current report.

## JSON rules

`condition.all` means every predicate must pass. Operators: `exists` (non-null), `equals` (strict), `not_equal_field` (compare to another dotted path), `contains` (substring), `is_null`. Missing/unknown evidence is never automatically treated as proof that a proposition is false. Records must be manually reconciled with a current report.

## Recommended algorithm

1. Input original credit report metadata and full loan-level identity in protected storage.
2. Parse trade lines without assuming that similar masked identifiers are the same account.
3. Join relevant records to verifiable documents, not to assertions within the draft letters.
4. Evaluate `condition.all`; when all predicates are true, emit a case with rule ID, evidence pointers, legal basis, and text request. Otherwise emit `needs_evidence`.
5. Require human confirmation of all case claims before rendering letters.
6. Render letter templates, replace every placeholder, and verify mailing address from bureau or furnisher.
7. Log postal receipt and response dates. Typically investigation is 30 days, sometimes up to 45 days, subject to legal conditions.
8. Compare results to the next report; do not reflexively redispute without new information.

Do not treat the CDIA Metro 2 format as a statute, insist on paper-only verification, demand deletion without an actual basis, or treat a 2024 tradeline as necessarily present in 2026. Avoid sending full SSN or DOB in generated JSON; add only identifying information actually required using secure handling.

## Executable JS evaluator

`node test.mjs` executes assertion-based checks; `node evaluate.mjs dilute_metro2_package.json evaluation_dry_run.json` writes a deterministic dry-run (zero matches until independent evidence is entered). Requires Node.js with ECMAScript modules. Rendering/sending is intentionally separated from evaluation; four personalized, unsent draft letters are in `draft_letters.md`.
