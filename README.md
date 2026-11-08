# Sovereign Dispute Engine

A local document-generation and credit-report auditing project with a static browser campaign console and an authoritative Julia implementation.

**[Open the live console](https://ahmadaliparr.github.io/dispute-engine/)** · **[Source repository](https://github.com/AHMADALIPARR/dispute-engine)** · **[User guide](USER_GUIDE.md)**

> This software produces draft documents, not legal advice or a determination that a debt is invalid. It does not mail, file, or transmit disputes. The hosted console does not accept payments. Review every claim and document before any separate human action.

## Overview

The engine reads structured credit-report JSON, applies its implemented audit rules, groups findings into configurable rounds, renders draft letters, and records campaign events in a SHA-256 hash chain. An optional evidence evaluation limits which marked records may produce drafts.

The live site runs JavaScript in the browser; GitHub Pages serves static files. It does not execute Julia. The browser port compares its default synthetic campaign with a committed Julia-generated fixture. Matching that fixture is a specific sample comparison—not formal verification, legal validation, or assurance about arbitrary consumer files.

## Capabilities and boundaries

| Area | Implemented behavior | Boundary |
| --- | --- | --- |
| Audit | Required-field, verification, date, closure, terms, certification, remark, and inquiry checks | Project rules, not complete Metro 2 or FCRA compliance certification |
| Campaigns | Ordered, switchable rounds with grouped or per-failure drafts | Runs consume available report snapshots; switches do not edit repository configuration |
| Evidence | Accepts evaluation JSON; clears `human_review_required` records | Browser does not execute the Node evidence evaluator; status does not mean a human has approved a letter |
| Draft export | Selected draft copying and combined text download | No PDF/HTML report ingest, PDF output workflow, or postal delivery |
| Client book | Local client identifier, attached report IDs, campaign totals, invoice memos, JSON export | Tab memory; recording a campaign resets the browser book rather than appending to a durable CRM |
| Billing | Displays the merchant catalog; checkout links out to Stripe's hosted page | $97.00/month flat; the catalog link is Stripe test mode; the page itself makes no Stripe request |
| Integrity | SHA-256 event-chain check and altered-hash demonstration | Not a digital signature, trusted timestamp, or independent proof of source facts |

## Try it in your browser

1. Open **[the live console](https://ahmadaliparr.github.io/dispute-engine/)** in a browser with JavaScript enabled.
2. Wait for the synthetic reports and engine seal to load.
3. Look for “Matches the Julia engine seal for the synthetic sample campaign.”
4. Review **Round control**, **Report snapshots**, **Campaign**, and **Draft letters**.
5. Select a draft, then use **Copy selected draft** or **Download drafts (.txt)** if needed.
6. Use **Download campaign JSON** to save the computed result.

Start with the supplied synthetic data. Do not enter social security numbers or full account numbers. See the [full walkthrough](USER_GUIDE.md#first-session-with-the-synthetic-sample) before loading other files.

## Architecture

```text
JSON report snapshots + rounds/rounds.json
               |
               v
engine/DisputeEngine.jl  -- campaign, audit rules, letter frames
engine/EvidenceGate.jl   -- optional record clearance
engine/CRM.jl            -- local book operations
               |
engine/export_campaign.jl
               |
frontend/fixtures/engine-seal.json
               |
frontend/site/engine.mjs -- browser port and parity comparison
frontend/site/app.mjs    -- session UI, local file reads, downloads
index.html              -- deployed static console
```

The separate `metro2/evaluate.mjs` evaluates independent-evidence predicates. The console consumes its evaluation output, not the evaluator itself. The MDX contract panel under `frontend/pages/` is checked during development but is not the deployed entry page.

Useful source links: [Julia engine](https://github.com/AHMADALIPARR/dispute-engine/blob/main/engine/DisputeEngine.jl), [browser implementation](https://github.com/AHMADALIPARR/dispute-engine/blob/main/frontend/site/engine.mjs), [round configuration](https://github.com/AHMADALIPARR/dispute-engine/blob/main/rounds/rounds.json), [sample report](https://github.com/AHMADALIPARR/dispute-engine/blob/main/sample/report-round0.json), and [evidence workflow](https://github.com/AHMADALIPARR/dispute-engine/blob/main/metro2/README.md).

## Local setup

Obtain the repository through your normal GitHub download workflow and extract it. Run the following commands from its root unless a subshell explicitly changes directory.

Development requirements follow the repository CI configuration: **Julia 1.11**, **Node.js 22**, and npm. The browser test additionally requires Chrome. The frontend contract check uses `@mdx-js/mdx`; install locked frontend dependencies with `npm ci`. The Julia engine uses standard-library code, not a separate package installation step.

```sh
# Start the local static console; stop with Ctrl+C.
node frontend/serve.mjs
# Open http://127.0.0.1:4173/
```

There is no `npm run build` script in the inspected package. Static hosting serves the committed files. Opening `index.html` directly with a `file://` URL is not the recommended workflow because the console fetches adjacent JSON resources.

### Run the Julia engine

```sh
julia engine/DisputeEngine.jl
julia engine/export_campaign.jl
julia engine/export_campaign.jl sample/report-round0.json sample/report-round1.json
julia engine/export_campaign.jl --gate frontend/fixtures/gate-sample.json sample/report-round0.json
```

### Run the evidence evaluator

```sh
node metro2/evaluate.mjs metro2/dilute_metro2_package.json metro2/evaluation_dry_run.json
```

This command writes the named evaluation file. The supplied package has no matching independent evidence in its dry run; that is not a verified dispute. Its record identifiers also differ from the sample campaign's identifiers.

## Tests and verification

```sh
julia test/runtests.jl
node metro2/test.mjs
(cd frontend && npm ci && npm test)
node frontend/browser-check.mjs
```

`npm test` runs the MDX contract check, Julia/browser integration comparison, and static smoke checks. Julia must be available for parity testing. The browser suite is also exposed as `npm run test:browser` inside `frontend/`.

After an intentional engine change, maintainers can regenerate the committed seal:

```sh
node frontend/integration.mjs --write
```

Review the fixture diff; do not regenerate it merely to conceal a mismatch. Normal comparison runs omit `--write`.

**Documentation validation status:** source files and the public page were inspected for this documentation. Application suites, Julia execution, browser interactions, and benchmarks were **not executed** during preparation. No inherited pass counts are asserted here. Inspect [CI runs](https://github.com/AHMADALIPARR/dispute-engine/actions) for commit-specific results.

## Hosting and operations

The repository is structured for GitHub Pages at `/dispute-engine/`, using root `index.html`, relative resources, `.nojekyll`, and a root `404.html`. The public page currently presents the campaign console. Confirm actual Pages configuration in repository settings before changing hosting; documentation is not a settings audit.

The [CI workflow](https://github.com/AHMADALIPARR/dispute-engine/blob/main/.github/workflows/ci.yml) defines engine, evaluator, frontend, and Chrome checks. The repository also contains a [release workflow](https://github.com/AHMADALIPARR/dispute-engine/blob/main/.github/workflows/release.yml). A release and a Pages deployment are separate concerns.

Before publishing changes, review tests, sample-seal parity, relative resource loading at the project URL, draft text, and the browser's privacy statements. Production use additionally requires appropriate legal review, operational controls, secure data handling, and independent security assessment; this README does not certify production readiness.

## Privacy and data retention

The inspected console reads selected files using browser `FileReader`, keeps reports and its client book in JavaScript memory, and implements local downloads. It does not implement report uploads, browser-book persistence, authentication, or a book restore workflow. Refreshing loses session state. Recording another campaign replaces the current local book; export first if you need it.

Static page and asset requests still reach the hosting service. Browser extensions, operating-system access, clipboard history, downloaded files, and backups remain outside the application's in-memory boundary. Do not interpret “nothing is sent” as a universal privacy guarantee. Never commit consumer files, exported campaigns, or private evidence to the public repository.

## Known limitations

- JSON input only; no report PDF or HTML parser.
- Browser report limit: 1,000,000 bytes per selected file and at most 500 tradelines per report.
- Enabled rounds pair with reports by list position, not by report ID or date; execution stops when reports run out or an early verdict ends the campaign.
- Inquiry letters are included in tradeline-granularity rounds, not field/per-failure branches.
- Per-failure `bureau-and-creditor` rounds currently emit two bureau-addressed copies; field-granularity rounds address bureau and furnisher separately.
- Drafts retain address placeholders and require independent factual/legal review.
- Invoice memos are not charges, receipts, or subscriptions.

## Contributing and support

Review the [user guide](USER_GUIDE.md), reproduce issues with synthetic inputs, and include the commit, environment, steps, and expected versus actual behavior when opening a [repository issue](https://github.com/AHMADALIPARR/dispute-engine/issues). Remove consumer information from logs and screenshots. Preserve the distinction between proposed findings, evidence-gated records, and reviewed documents.

## License

Read the full [repository LICENSE](https://github.com/AHMADALIPARR/dispute-engine/blob/main/LICENSE) before reuse or deployment. Its identifier is `LicenseRef-Sovereign-Leviathan-SL-AGPL3-001` and its text includes custom terms. Do not infer standard AGPL-only or unrestricted open-source licensing from the identifier.
