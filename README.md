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

This is a document engine, not legal advice. It does not mail,
file, or transmit a dispute.

## Architecture

```
credit-report JSON
        |
        v
engine/DisputeEngine.jl          Julia stdlib. This is the authority.
engine/EvidenceGate.jl           clears a record only for human review
engine/CRM.jl                    local client book, hash-chained events
        |
        |  julia engine/export_campaign.jl
        v
frontend/fixtures/engine-seal.json
        |
        |  node frontend/integration.mjs   (must match, or CI fails)
        v
frontend/site/engine.mjs         same rules, letters, gate, book id, SHA-256 chain
        |
        v
index.html                       static console
```

GitHub Pages is already configured on this repository as **branch
`main`, folder `/`** (legacy build). The public URL is
<https://ahmadaliparr.github.io/dispute-engine/>. Pages copies files.
It does not start Julia, Node, or a payment API. `.nojekyll` is at
the repository root so the console is served as authored, and
`404.html` sends any other path back to that root so a refresh does
not depend on a server route.

The browser cannot run this Julia program. The repository does not
carry a WebAssembly sysimage or a Julia-to-WASM toolchain, and one
was not added. `frontend/site/engine.mjs` is a port of
`DisputeEngine.jl`, `EvidenceGate.jl`, and the client-id and summary
operations in `CRM.jl`. Letter prose is not retyped there: the seal
file contains the Julia constants (`LONG_FRAME`, `MASTER_FRAME`,
`CRRG_FRAME`, `LETTER_FRAME`, the verdicts, the shield, and the
inquiry demand). A sample run is labeled "Matches the Julia engine
seal" only when the browser result equals `campaigns.sample` in
that file. Every other run is labeled as a browser session.

`metro2/` stays the owner's dilute evaluator and still runs with
Node (`node metro2/evaluate.mjs`). The page does not reimplement
rules R01–R07. It accepts an evaluation JSON and applies the same
clearance rule as `EvidenceGate.jl`: status
`human_review_required` is cleared, and everything else is withheld.

Reports chosen in the browser stay in that tab. The page's content
security policy is `default-src 'self'` with `connect-src 'self'`
and `form-action 'none'`. Stripe.js is not loaded. There is no
Facebook login, despite the pitch image.

## The audit (engine/DisputeEngine.jl, Julia, zero dependencies)

- **blank_required_field** — a required field reported blank.
- **missing_verification** — never verified, or last verified before
  the date reported.
- **incoherent_remark** — the furnisher reports it cannot locate
  the consumer while reporting an open balance.
- **date_incoherence** — last activity predating the account opening.
- **missing_closure_date** — a closed account with no closure date.
- **stale_terms_on_closed** — a closed account still wearing live
  payment terms.
- **uncertified_tradeline** — content never certified to conform to
  reporting standards.
- **inquiry_without_permissible_purpose** — the second front: an
  inquiry carrying no documented permissible purpose (FCRA § 604).

The JSON reader decodes standard string escapes, including `\uXXXX`
and surrogate pairs, so a browser `JSON.parse` of the same file
yields the same text. Sample account references written as
`\u2022\u2022` are bullets in both places.

## The rounds (rounds/rounds.json — one contract, two readers)

1. **Round Kick Regular** — one letter per bureau, every failure.
2. **Nerve Boosted** — one letter per failing tradeline.
3. **Punch of Fury Supreme** — bureau and furnisher served together.
4. **Paralyzing Touch Point Supreme** — every failure its own letter.
   This round is held out in the file (`enabled: false`).

Tradeline-granularity rounds pick a frame by round order: order 1
the long frame, order 2 the master frame, order 3 the CRRG frame,
anything else the short frame. Field and per-failure rounds use the
short frame. A per-failure round whose scope is `bureau-and-creditor`
emits two copies, both addressed to the bureau. A field round with
that scope addresses the bureau and then the furnisher. Inquiries
are written into letters on tradeline-granularity rounds.

Letters use the owner's structure: the round's frame, one block per
account with its marked fields and per-account verdict, the
certification demand (CFPB, FTC, Attorney General), and the closing
shield (§ 1681i; authorship declared; no power-of-attorney delay).
Addresses stay `[CONSUMER ADDRESS]` and `[BUREAU ADDRESS]`. Every
round seals into a SHA-256 hash chain whose first previous value is
`GENESIS`.

## The console

Two surfaces read the same round file:

- `frontend/pages/dispute-console.mdx` is the contract panel (campaign
  board, round toggles, marked exhibit, book, merchant). `npm run
  check` compiles it and checks the contract. It is not the deployed
  page.
- `index.html` is the page Pages will serve. It loads the synthetic
  samples, runs the port, and compares the result to the seal. Round
  switches affect this tab only. A local report JSON (1 MB limit)
  can replace the sample. An evaluation JSON can gate the press.
  Drafts can be copied or downloaded. The client book and any
  invoice memo stay in tab memory. Checkout stays disabled: the
  catalog amount is null, and this page cannot call Stripe.

The pitch names a $97 monthly fee. `billing/billing.json` still has
`amount_cents: null`. An unpriced plan sells nothing. The page says
that, and it does not invent a charge.

## The book and the rail

`engine/CRM.jl` is the client book: clients, their reports,
campaigns, letters, and invoices, kept locally with every event
sealed into the verdict chain. `billing/billing.json` is the
merchant catalog: Stripe is the recorded processor (customers,
subscriptions, checkout, invoices) and mirrors **into** the book —
the book is the record, the rail is replaceable. Prices are set in
the catalog by the owner; an unpriced item sells nothing. No Stripe
secret is stored in this repository.

The sample client id is `C` plus the first 8 hex characters of
SHA-256(`SAMPLE CONSUMER` + `sample@example.com`). The console shows
that id only for that synthetic pair, and says when a local id is
not the sealed one.

## The evidence gate

`metro2/` is the owner's dilute Metro 2 evaluator, included
verbatim: rules that fire only on independent evidence, human
review before any letter. `engine/EvidenceGate.jl` bridges it in
front of the press — pass a dilute evaluation to the campaign and
only cleared records render. The concentrated engine proposes;
the dilute engine disposes. The package dry run has
`matched_count: 0` until evidence is entered. Its record ids
(`edu_01`, and so on) are not the sample tradeline ids (`T1`, …),
so pointing the sample campaign at that dry run clears nothing.
That is a withheld campaign, not a successful dispute.

## Running

Requirements: Julia 1.11 (tested on 1.11.3) and Node.js 22.
The frontend dev dependency is `@mdx-js/mdx`, used only by the
contract check. No Python. The Pages page itself is HTML, CSS, and
JavaScript and needs no install to open.

```
julia engine/DisputeEngine.jl
julia engine/export_campaign.jl
julia engine/export_campaign.jl sample/report-round0.json sample/report-round1.json
julia engine/export_campaign.jl --gate frontend/fixtures/gate-sample.json sample/report-round0.json
julia test/runtests.jl
node metro2/test.mjs
node metro2/evaluate.mjs metro2/dilute_metro2_package.json metro2/evaluation_dry_run.json
cd frontend && npm ci && npm test
node frontend/browser-check.mjs          # Chrome; writes screenshots
node frontend/serve.mjs                  # http://127.0.0.1:4173/
```

`npm test` is the MDX contract check, the Julia-versus-browser
parity test, and the static smoke test. Refresh the committed seal
after an intentional engine change with:

```
node frontend/integration.mjs --write
```

CI runs that comparison without `--write`, so a drifted seal fails.
Ingest format is the credit-report JSON export. Sample reports under
`sample/` are synthetic. Do not put a real social security number,
full account number, or live consumer file in the repository or in
a download you then commit.

## Testing

Verified on Julia 1.11.3, Node 22, and headless Chrome:

| Command | Result |
| --- | --- |
| `julia test/runtests.jl` | 74 passed: JSON reader 10, audit 19, campaign 20, CRM 10, evidence gate 8, billing 5, verdict chain 2 |
| `node metro2/test.mjs` | pass (missing evidence stays unmatched; proof can require human review; accounts stay isolated) |
| `node frontend/build-check.mjs` | 18/18 |
| `node frontend/integration.mjs` | 23/23, including letter text, hashes, punch, per-failure, resolved, empty rounds, and the sample client id |
| `node frontend/smoke.mjs` | 33/33, including relative asset paths, the content security policy, the seal, an unpriced catalog, and a secret/SSN scan of the console files |
| `node frontend/browser-check.mjs` | 19/19: sealed sample, round toggle, invalid JSON clears the board, a gate that clears nothing, a clean report resolves, local book id, tamper refused, no request left 127.0.0.1 |

The browser check writes:

- `dispute-console-desktop.png`
- `dispute-console-campaign.png`
- `dispute-console-letter.png`
- `dispute-console-error.png`
- `dispute-console-mobile.png`

## Deployment

Production hosting is the existing GitHub Pages setting: **Deploy
from branch `main`, folder `/`**. There is no second host and no
GitHub Actions deploy that could race that setting.

What is live today: <https://ahmadaliparr.github.io/dispute-engine/>
returns the Jekyll rendering of `main` (HTTP 200). It does not serve
this console. Checked before this branch: the body has no
"Campaign console".

What publishes the console: merging this branch to `main`. Pages
will then serve `index.html`, the engine script, the seal, the
samples, and the rounds file from that commit. After the Pages build
finishes, confirm both of these on the live URL:

- the amber line "Static page · nothing on this page is sent"
- the sentence "Matches the Julia engine seal for the synthetic sample campaign."

`.github/workflows/ci.yml` runs the Julia suite, the dilute suite,
`npm test`, and the browser check on every push and pull request.
`.github/workflows/release.yml` runs the same tests (without Chrome)
on a tag `v*` and, only if they pass, creates a GitHub Release with
generated notes. Tag after the merge, from `main`:

```
git checkout main
git pull
git tag v0.2.0
git push origin v0.2.0
```

The tag does not change which files Pages serves. The merge does.
This branch does not merge itself and does not push the tag.

## Limitations

- Ingest is JSON. PDF and HTML report parsing are not implemented.
- Letters are drafts with address placeholders. Nothing is mailed.
- The audit encodes the owner's dispute rules. It is not legal advice.
- A browser session is not the Julia process. Trust the seal banner
  for the sample, and `julia engine/export_campaign.jl` for a file
  you care about.
- Lone UTF-16 surrogates are rejected. Escaped surrogate pairs decode.
- The dilute evaluator is Node-only. The page only filters a file
  it is given.
- The merchant catalog is unpriced. The page cannot take a card.
- The client book is tab memory. Refresh clears it.
- Sample data is synthetic. Do not commit a real consumer report.

## Release notes

### 0.2.0 — Pages console

- Static campaign console at `index.html`, wired to a browser port
  of the Julia engine and checked against `engine/export_campaign.jl`.
- Engine seal for the synthetic sample, the evidence-gate cases,
  punch, per-failure, a clean report, and an empty round list.
- JSON `\u` escapes, including surrogate pairs, now decode in the
  Julia reader. Sample account references render as bullets.
- Content security policy, relative asset paths, and a root
  `404.html` for the existing Pages project URL.
- CI workflow and a tag-triggered GitHub Release workflow.
- No Stripe call, no mailed dispute, and no new price in the catalog.

## License

See `LICENSE` (LicenseRef-Sovereign-Leviathan-SL-AGPL3-001).
