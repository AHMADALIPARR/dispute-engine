# Sovereign Dispute Engine — User Guide

**[Open the live console](https://ahmadaliparr.github.io/dispute-engine/)** · **[Source on GitHub](https://github.com/AHMADALIPARR/dispute-engine)** · **[Project README](README.md)**

This guide explains the implemented browser console, its local-development companion tools, and the limits that matter when interpreting a campaign. Begin with synthetic examples. Nothing in this guide authorizes sending a dispute or replaces professional legal advice. The engine prepares documents; a person must establish the facts, assess the applicable law, review the wording, and decide whether any separate action is appropriate.

## Contents

- [What the application does](#what-the-application-does)
- [First session with the synthetic sample](#first-session-with-the-synthetic-sample)
- [Preparing report snapshots](#preparing-report-snapshots)
- [Selecting rounds and interpreting the campaign](#selecting-rounds-and-interpreting-the-campaign)
- [Using an evidence gate](#using-an-evidence-gate)
- [Reviewing and exporting drafts](#reviewing-and-exporting-drafts)
- [Using the local client book](#using-the-local-client-book)
- [Checking the verdict chain](#checking-the-verdict-chain)
- [Local developer workflow](#local-developer-workflow)
- [Troubleshooting](#troubleshooting)
- [Safe completion checklist](#safe-completion-checklist)

## What the application does

The hosted application is a static **Campaign console**. It loads program files and synthetic examples from GitHub Pages, then performs its campaign calculation in JavaScript in your browser. The repository's authoritative engine is written in Julia. These are two related execution surfaces, not a Julia server behind the website.

A report snapshot is a structured JSON document describing a consumer, report identifier, tradelines, and optional inquiries. A tradeline represents an account record. An inquiry represents a request for credit-report access. The audit marks records according to the implemented checks, and enabled rounds determine how findings are grouped into draft letters. The program also produces campaign counts and a hash-linked event history.

A marked field is not itself proof of a statutory violation. Missing evidence, an import mistake, an outdated snapshot, and an actual reporting problem are different situations. Likewise, a program verdict is not a bureau decision, a court finding, an account deletion, or a change to a credit score. The console does not fetch current bureau records or observe what happens after a letter leaves your device.

The browser book is temporary session bookkeeping. The merchant panel displays catalog information but cannot collect payment. There is no account registration, Facebook authentication, Stripe checkout, dispute submission, or background mailing service in the inspected console. The artwork's painted sign-in button is not an implemented sign-in workflow.

## First session with the synthetic sample

Open the [live console](https://ahmadaliparr.github.io/dispute-engine/) with JavaScript enabled. You should see **Campaign console** and the notice **Static page · nothing on this page is sent**. Allow the loading message to finish while the console fetches the engine fixture, round configuration, billing catalog, and two synthetic reports.

On its initial default calculation, the console compares the entire campaign result with the fixture's sample campaign. A matching result displays **Matches the Julia engine seal for the synthetic sample campaign.** This is useful evidence that the browser produced the committed example output. It does not mean your browser executed Julia or that every possible report has been proven correct.

Review **Report snapshots** first. Each card shows a round slot, report ID, filename, consumer label, tradeline count, and inquiry count. The default pair comes from `sample/report-round0.json` and `sample/report-round1.json`. They intentionally demonstrate different reporting states. Keep them unchanged during your first pass so that later changes to the board have an understandable cause.

Next inspect **Round control**. The switches show whether each round is **ARMED** or **HELD OUT**. Defaults come from the repository configuration. Toggle one switch and observe that the campaign recalculates when reports are available. This modifies the current browser session only. It does not save a configuration change to GitHub or alter what the Julia command will read from disk.

In **Campaign**, read the board and verdict, then scroll through the marked rows and record exhibit. In **Draft letters**, select a letter to inspect the full text. You can explore without copying or downloading anything. To restore the baseline after experiments, click **Reload synthetic sample**. That reloads the synthetic reports, removes the gate, restores default round switches, and recalculates; it is not a general client-book reset.

## Preparing report snapshots

The console accepts JSON, not a PDF credit report, a screenshot, an HTML download, a spreadsheet, or arbitrary text renamed with a `.json` extension. If your starting information is in another format, a separate carefully reviewed normalization process is necessary. No automated report parser is provided here. Do not upload an original consumer document expecting the console to recognize its layout.

Use the repository's [synthetic report](https://github.com/AHMADALIPARR/dispute-engine/blob/main/sample/report-round0.json) as the structural reference. The browser requires a top-level object with a nonempty `consumer` string, nonempty `report_id` string, and a `tradelines` array. Each tradeline must be an object containing nonempty strings for `id`, `creditor`, `bureau`, and `account_ref`, plus a `fields` object. Optional inquiries must form an array of objects with string values for `bureau`, `creditor`, and `date`.

For orientation, this small structural example contains no actual accounts:

```json
{
  "consumer": "SYNTHETIC DEMO",
  "report_id": "DEMO-R0",
  "tradelines": [],
  "inquiries": []
}
```

It is a shape example, not a realistic test of reporting completeness. An empty report can yield no audit findings simply because it contains no accounts. Never interpret that outcome as proof that a real consumer file is accurate. A populated test should be based on the supplied synthetic fixture, retaining the fields you intend to examine.

Sample tradelines include `certified` and fields such as `account_status`, `balance_owed`, `creditor_remarks`, `date_opened`, `date_last_activity`, `date_reported`, `last_verified`, `loan_type`, and `payment_status`. Closed accounts also illustrate `closed_date` and `term_length`. Inquiry examples include `permissible_purpose_documented`. Preserve JSON numbers and booleans as their proper types; a quoted `"false"` is a string, not the boolean `false`.

Keep account references masked. Assign stable, distinct tradeline IDs so that findings and evidence can refer to the intended record. Do not collapse two accounts merely because their masked references look similar. Check dates against source documents and use the consistent date representation illustrated by the samples. A structurally accepted JSON document can still contain inaccurate or misleading information.

Each selected file must be no larger than **1,000,000 bytes**. The browser validator also rejects reports containing more than **500 tradelines**. Those are input constraints, not a promise that every file below the limits will be fast or semantically valid. Use small synthetic cases when learning the workflow or investigating a problem.

Choose your report files in **Report snapshots**. A successful selection replaces the sample pair for this tab and immediately triggers a calculation. Inspect the displayed round slots rather than assuming the operating system selected files in chronological order. The program uses their displayed sequence; it does not sort them by `report_id` or infer a timeline from dates. If validation fails, the previous displayed campaign is cleared to avoid presenting stale output as the new result.

## Selecting rounds and interpreting the campaign

There are four configured rounds. **Round Kick Regular** uses tradeline granularity to group findings into letters by bureau. **Nerve Boosted** uses field granularity and produces a bureau draft for each failing tradeline. **Punch of Fury Supreme** uses field granularity with bureau-and-creditor scope, producing separate bureau and furnisher drafts. **Paralyzing Touch Point Supreme** uses per-failure granularity and is disabled in the supplied configuration.

The round names are application labels, not recommended legal escalation steps. More letters do not establish stronger evidence. Select rounds to understand the implemented output structure, not to maximize letter volume without a factual basis.

Enabled rounds are filtered and ordered before they are paired with report snapshots by position. The first enabled round consumes the first snapshot, the second consumes the second, and so on. If snapshots run out, later rounds are not processed. Consequently, three enabled switches with two reports do not guarantee three board rows. Disabling an earlier round changes which later round receives a particular snapshot. Check the **Attack** and **Report** columns together after every configuration change.

The board displays **Targets**, **Field failures**, **Inquiries**, **Withheld**, and **Drafts**. Targets count failing tradeline identities, while field failures count individual marked findings. A single account can therefore contribute several field failures but only one target. Draft count depends on grouping and scope, not just on failure count. With an evidence gate, the displayed counts reflect filtering rather than a claim that all original findings were cleared.

The audit checks blank required fields, missing verification, contradictory locate-consumer remarks with an open balance, incoherent dates, missing closure dates, live terms on closed accounts, uncertified tradelines, and inquiries without documented permissible purpose. These are the project's implemented checks. They are not a complete implementation of a reporting standard and do not establish that every marked condition independently warrants deletion.

A **RESOLVED** verdict means the relevant audit path found no remaining findings under its inputs and control flow. **HELD -> escalate** means findings remain. **GATED — needs evidence** indicates that withholding affected the campaign. None of these outcomes records a real-world bureau response. Campaign execution can also end early when a processed round has no remaining cleared findings, so do not assume all enabled rounds always run.

Two output details deserve special attention. Inquiry content is rendered by the tradeline-granularity branch, not the field/per-failure branches. Also, the current per-failure bureau-and-creditor branch generates two copies addressed to the bureau; it does not produce a correctly differentiated furnisher copy. The field-granularity branch does distinguish bureau and furnisher. Inspect actual addressees instead of relying on the scope label alone.

## Using an evidence gate

The evidence gate is optional. With no evaluation file loaded, the console explicitly says the press is not gated. That default allows exploration of the concentrated audit's proposed drafts; it is not evidence approval. Anyone considering a real document must separately assess what supports each claim.

The separate Node evaluator lives under `metro2/`. Its rules require independent evidence, and its supplied dry run has zero matches until relevant evidence is supplied. Its documentation warns that missing or unknown evidence must not automatically be treated as proof that a proposition is false. Historical observations also require reconciliation with a current report. Review that workflow before attempting to interpret evaluation output.

Load an evaluation JSON in **Evidence gate**. The console only clears record IDs associated with the exact case status `human_review_required`. Everything else remains withheld. The status means review is required, not that review has been completed. Changing a status merely to generate a letter defeats the purpose of the gate and supplies no independent support for the underlying claim.

Identity alignment is essential. A tradeline clearance must identify the same `id` used by the report. Inquiry clearance uses `INQ:` followed by the creditor name. The supplied dilute package's identifiers, such as `edu_01`, do not automatically match sample tradelines such as `T1`. Loading that dry run against the sample campaign can therefore clear nothing. A zero-draft gated run may be an expected withholding result, not an error.

Read the gate status message after loading: it shows cleared IDs or says no record is cleared. Then compare the board's **Withheld** counts and the marked-row messages. To return to ungated exploration, click **Remove gate**. The console recalculates with its current reports. Removing the gate changes filtering; it does not obtain evidence, validate claims, or approve anything for sending.

## Reviewing and exporting drafts

Select a letter under **Draft letters** to display its full text. Review the recipient, consumer label, account references, marked fields, explanations, legal references, and requested action. The project includes assertive template language. Do not assume that a template's legal proposition is correct for your circumstances merely because the program rendered it without an error.

Generated addresses remain `[CONSUMER ADDRESS]` and `[BUREAU ADDRESS]`. Before any separate real-world use, replace every placeholder in a suitable protected editing environment and independently verify the intended recipient address. Do not silently add unsupported facts or treat the engine's wording as independent evidence. If legal advice is needed, obtain it from an appropriately qualified professional.

**Copy selected draft** copies only the currently selected letter to the device clipboard, subject to browser permission. Clipboard history, synchronization, and other applications may retain that text. If the browser refuses clipboard access, the console reports the refusal; that does not mean the draft was transmitted somewhere else.

**Download drafts (.txt)** writes a combined `draft-letters.txt` file containing the current campaign's drafts with separating labels. It is a text export, not a PDF or a mailed packet. Review all included letters, particularly if you changed round settings after inspecting an earlier letter. The current selection is not a guarantee that every other exported draft has been checked.

**Download campaign JSON** writes `campaign.json`, containing the computed campaign result, rounds, draft text, and chain information. This is useful for local comparison and review. It is not a substitute for the original report snapshots or the independent evidence documents. There is no implemented browser workflow that restores a session simply by importing this campaign export.

Keep outputs in an appropriately protected location. Browser downloads may enter a shared folder, cloud backup, or desktop indexing system. Do not attach a real campaign file to a public issue or commit it to the repository. For reproducibility, maintain a private record of the input versions and round settings alongside any reviewed export, using whatever secure process your situation requires.

## Using the local client book

The **Client book** demonstrates a local client identifier, report attachments, campaign totals, and optional invoice memos. For the safest first demonstration, click **Use the synthetic sample client**. This fills the sample name and email locally but does not record the campaign yet. The fields participate in identifier creation; they are not an email subscription or a message recipient workflow.

Once a valid campaign is on screen, click **Record campaign in the local book**. A name and email must be present. The console creates a book, attaches the currently loaded report IDs, records campaign counts, and displays a summary. The sample identifier can be compared with the committed Julia CRM fixture. Other identifiers are labeled local and are not asserted against that sample seal.

Importantly, recording a campaign currently starts a new empty browser book and book-event chain. It does not append to a durable multi-client database. If you previously added memos or recorded a different campaign, export what you need before recording again. This replacement behavior matters even within a single tab; refreshing is not the only way to lose previous bookkeeping.

To demonstrate a memo, enter text in **Invoice memo** and a whole, nonnegative number in **Memo amount (cents)**, then click **Add local invoice memo**. An amount of `2500` represents twenty-five dollars, not twenty-five hundred dollars. The summary shows an open memo balance. That number is local bookkeeping only: no card is charged, no invoice is emailed, and no Stripe customer or subscription is created.

Use **Download book JSON** to save `client-book-session.json`. This exports the current book, not a full durable application account or a supported restore package. The interface has no book-import button. The **Merchant catalog** remains informational, with checkout unavailable; setting a catalog amount would not turn this static page into a payment system.

## Checking the verdict chain

The **Verdict chain** shows event records and SHA-256 hashes. Each hash is computed from the previous hash, a separator, and the current record; the first previous value is `GENESIS`. **Re-check chain** recomputes that relationship for the displayed campaign and reports whether the entries match the rule.

**Demonstrate a bad hash** modifies a copy of the first hash and checks that copy. The campaign chain on screen is not changed by this demonstration. It illustrates detection of an inconsistent hash within the given data structure. It is not an adversarial security assessment of the entire application.

A valid chain does not prove that input facts are true, that all relevant fields were audited, that a recipient received anything, or that a record was created at a particular time. Someone able to replace an entire chain can compute a new internally consistent chain. There is no independent signature or trusted external timestamp established by this check. Preserve that distinction when describing exports to anyone else.

## Local developer workflow

For a local console, obtain and extract the repository, open a terminal in its root, and run:

```sh
node frontend/serve.mjs
```

Open `http://127.0.0.1:4173/` and stop the server with Ctrl+C when finished. Serving over HTTP allows the console to fetch its adjacent configuration and fixture resources; simply double-clicking `index.html` is not the recommended setup. Node.js 22 is the version used by the inspected CI configuration.

The Julia implementation can be exercised separately with Julia 1.11:

```sh
julia engine/DisputeEngine.jl
julia engine/export_campaign.jl sample/report-round0.json sample/report-round1.json
julia engine/export_campaign.jl --gate frontend/fixtures/gate-sample.json sample/report-round0.json
```

These commands run local tooling, not the hosted browser session. A custom browser run is labeled as a browser calculation rather than a match for the synthetic seal. For important comparisons, use the exporter with the intended report files and equivalent configuration, then review differences rather than assuming identical settings.

The separate evidence evaluator can be invoked from the repository root as follows:

```sh
node metro2/evaluate.mjs metro2/dilute_metro2_package.json metro2/evaluation_dry_run.json
```

This writes the specified evaluation output. Use a deliberate private output path when working with sensitive evidence, and avoid overwriting a record you need to preserve. Evaluation and letter rendering remain separate operations.

Maintainer checks are documented in the [README](README.md#tests-and-verification). The frontend's `npm test` includes a Julia/browser comparison, so Node alone is insufficient for that suite. Chrome is needed for the browser check. No application tests were run for this documentation task, and no historical pass count is presented as a new result. A source inspection verifies what commands are defined, not that your environment will execute them successfully.

## Troubleshooting

**The console remains in a loading or failed state.** Confirm that JavaScript is enabled and that you opened the correct project URL. On a local copy, use the included server from the repository root. Missing fixtures, rounds, or billing resources can prevent initialization. Do not interpret an empty board during startup as an empty or accurate report.

**A JSON import is refused.** Check actual file contents, not just its extension. JSON requires quoted property names, correct commas, and valid strings. Confirm required report and tradeline properties, the file-size limit, and the tradeline-count limit. Make corrections in a separate synthetic copy first. An invalid attempt clears the displayed previous result so that stale drafts are not mistaken for new output.

**The sample-seal banner disappeared.** This is expected after changes to inputs, rounds, or evidence produce a result different from the fixture. It is not by itself a security incident or proof of an incorrect calculation. Restore the defaults with **Reload synthetic sample** if you want to compare the baseline again.

**Some enabled rounds do not appear.** Compare enabled-round count with report count and inspect whether an earlier round ended the campaign. Pairing is positional. More switches do not create more snapshots, and the program does not invent later report data.

**There are findings but no drafts.** Check gate clearance and ID alignment, then inspect granularity and inquiry behavior. Withholding may be deliberate. Do not remove safeguards or alter evidence statuses simply to obtain output.

**The book or memo vanished.** A refresh, clearing the tab, or recording a new campaign can discard prior session bookkeeping. Download desired records before those actions. The app does not offer cloud recovery, autosave, or book restoration.

## Safe completion checklist

Before finishing, confirm which inputs and rounds produced the current output. Distinguish synthetic demonstration data from any independently normalized material. Review evidence alignment, draft addressees, remaining placeholders, and the meaning of each verdict. Save only the exports you actually need, and verify their destination on your device.

Use **Clear this tab** when you want the console to discard reports, gate, computed result, and local book. That action is not secure deletion of downloads, clipboard contents, screenshots, browser caches, or operating-system backups. Manage those separately according to your own data-handling requirements.

Finally, keep any mailing, filing, payment, or communication outside this application's claimed capabilities. The successful end of a console session is an understood, reviewed local artifact—not a promise of debt deletion, regulatory compliance, or an externally completed dispute.
