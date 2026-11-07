// Prove the browser engine matches Julia.
//   node frontend/integration.mjs
//   node frontend/integration.mjs --write   # refresh frontend/fixtures/engine-seal.json
//
// Exits non-zero unless every sealed campaign, audit row, letter, and
// hash chain equals `julia engine/export_campaign.jl`.

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import {
  createEngine,
  loadRounds,
  loadGate,
  assertGate,
  validateReport,
  verifyChain,
  crmAddClient,
  crmAttachReport,
  crmRecordCampaign,
  crmAddInvoice,
  crmSummary,
  emptyBook,
  sha256,
} from './site/engine.mjs'
import { sha256Hex } from './site/sha256.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const sealPath = fileURLToPath(new URL('./fixtures/engine-seal.json', import.meta.url))
let failed = 0

function sortify(value) {
  if (Array.isArray(value)) return value.map(sortify)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortify(value[key])]))
  }
  return value
}

function same(actual, expected) {
  return JSON.stringify(sortify(actual)) === JSON.stringify(sortify(expected))
}

function check(name, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) {
    failed++
    if (detail) console.error(detail)
  }
}

function checkSame(name, actual, expected) {
  const ok = same(actual, expected)
  if (ok) {
    check(name, true)
    return
  }
  const a = JSON.stringify(sortify(actual))
  const b = JSON.stringify(sortify(expected))
  let diff = ''
  const aLines = a.split(',')
  const bLines = b.split(',')
  for (let i = 0; i < Math.max(aLines.length, bLines.length); i++) {
    if (aLines[i] !== bLines[i]) {
      diff = `at field ${i}\n  js:    ${aLines[i]?.slice(0, 240)}\n  julia: ${bLines[i]?.slice(0, 240)}`
      break
    }
  }
  check(name, false, diff || `js length ${a.length} julia length ${b.length}`)
}

const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
check('sha256 abc', sha256Hex('abc') === abc && sha256Hex('abc') === createHash('sha256').update('abc').digest('hex'))
check('sha256 unicode', sha256Hex('\u2022\u2022') === createHash('sha256').update('\u2022\u2022').digest('hex'))

const julia = spawnSync(process.env.JULIA || 'julia', ['engine/export_campaign.jl'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
if (julia.status !== 0) {
  console.error(julia.stderr || julia.stdout)
  console.error('julia export failed')
  process.exit(1)
}
const fresh = JSON.parse(julia.stdout)
check('seal schema', fresh.schema === 'dispute-engine-seal/1' && fresh.engine === 'engine/DisputeEngine.jl')

if (process.argv.includes('--write')) {
  writeFileSync(sealPath, `${JSON.stringify(fresh, null, 2)}\n`)
  console.log('  WROTE frontend/fixtures/engine-seal.json')
}

let committed
try {
  committed = JSON.parse(readFileSync(sealPath, 'utf8'))
} catch (error) {
  committed = null
  check(`committed seal readable (${error.message})`, false)
}
if (committed) checkSame('committed seal matches julia export', committed, fresh)

const engine = createEngine(fresh.copy)
const roundsDoc = JSON.parse(readFileSync(new URL('../rounds/rounds.json', import.meta.url), 'utf8'))
const armed = loadRounds(roundsDoc)
const r0 = validateReport(JSON.parse(readFileSync(new URL('../sample/report-round0.json', import.meta.url), 'utf8')), 'r0')
const r1 = validateReport(JSON.parse(readFileSync(new URL('../sample/report-round1.json', import.meta.url), 'utf8')), 'r1')
const gate = loadGate(JSON.parse(readFileSync(new URL('./fixtures/gate-sample.json', import.meta.url), 'utf8')))
const gateNone = loadGate(JSON.parse(readFileSync(new URL('./fixtures/gate-none.json', import.meta.url), 'utf8')))

checkSame('audit r0', { failures: engine.auditReport(r0), inquiries: engine.auditInquiries(r0) }, fresh.audits.r0)
checkSame('audit r1', { failures: engine.auditReport(r1), inquiries: engine.auditInquiries(r1) }, fresh.audits.r1)
checkSame('sample campaign', engine.runCampaign(armed, [r0, r1], null), fresh.campaigns.sample)
checkSame('gated campaign', engine.runCampaign(armed, [r0], gate), fresh.campaigns.gated)
checkSame('fully gated campaign', engine.runCampaign(armed, [r0], gateNone), fresh.campaigns.gated_none)

const byId = (id) => roundsDoc.rounds.filter((round) => round.id === id).sort((a, b) => a.order - b.order)
checkSame('punch campaign', engine.runCampaign(byId('punch-of-fury-supreme'), [r0], null), fresh.campaigns.punch)
checkSame('fury campaign', engine.runCampaign(byId('paralyzing-touch-point-supreme'), [r0], null), fresh.campaigns.fury)
const resolvedReport = validateReport(fresh.resolved_report, 'resolved')
checkSame(
  'resolved campaign',
  engine.runCampaign(byId('round-kick-regular'), [resolvedReport], null),
  fresh.campaigns.resolved,
)
checkSame('empty rounds', engine.runCampaign([], [r0], null), fresh.campaigns.empty_rounds)

const sample = engine.runCampaign(armed, [r0, r1], null)
check('sample chain verifies', verifyChain(sample.chain) && sample.chain_valid === true)
const tampered = sample.chain.map((entry) => ({ ...entry }))
tampered.push({ record: 'forged', hash: tampered[tampered.length - 1].hash })
check('tampered chain is refused', verifyChain(tampered) === false)
check('sample letters are drafts with the shield', sample.rounds[0].letter_text[0].includes(fresh.copy.ANTI_STALL_SHIELD))
check('sample account ref survived unicode decode', sample.rounds[0].letter_text[0].includes('\u2022\u2022420'))
check('gated none withholds letters', fresh.campaigns.gated_none.rounds[0].letters === 0 && fresh.campaigns.gated_none.verdict.startsWith('GATED'))

const book = emptyBook()
const chain = []
const id = crmAddClient(book, chain, 'SAMPLE CONSUMER', 'sample@example.com')
check('sample client id', id === fresh.sample_client_id)
checkSame('sample client chain', chain, fresh.sample_client_chain)
crmAttachReport(book, chain, id, 'SAMPLE-R0')
crmAttachReport(book, chain, id, 'SAMPLE-R1')
const recorded = crmRecordCampaign(book, chain, id, sample)
crmAddInvoice(book, chain, id, 'Attack Round Credit x2', 0)
const summary = crmSummary(book, id)
check('crm summary matches the julia book', recorded === 4 && summary.status === 'In Round' && summary.reports === 2 && summary.rounds === 2 && summary.letters === 4 && summary.open_balance_cents === 0)
assert.equal(sha256('SAMPLE CONSUMER' + 'sample@example.com').slice(0, 8), id.slice(1))

let threw = false
try { validateReport({}) } catch { threw = true }
check('invalid report is rejected', threw)
let badGate = false
try { assertGate({ cases: [{ status: 'human_review_required' }] }) } catch { badGate = true }
check('incomplete gate is rejected', badGate && loadGate({ cases: [] }).size === 0)

console.log(failed ? `\n${failed} integration failure(s)` : '\nfrontend/engine integration: all green')
process.exit(failed ? 1 : 0)
