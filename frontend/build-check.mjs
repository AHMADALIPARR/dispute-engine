// Build check for the dispute console frontend.
//   1. The MDX page compiles (@mdx-js/mdx).
//   2. The round contract holds: rounds/rounds.json is well-formed,
//      ids are unique, orders ascend, every round carries an enabled
//      flag, and the components are data-driven over that file.
//   3. The campaign board matches the engine's verified sample run
//      (the same numbers test/runtests.jl asserts).
// Exits non-zero on any failure. Run: npm run check

import { readFileSync } from 'node:fs'
import { compile } from '@mdx-js/mdx'

let failed = 0
const ok = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failed++
}

const mdxSource = readFileSync(new URL('./pages/dispute-console.mdx', import.meta.url), 'utf8')
const roundsDoc = JSON.parse(readFileSync(new URL('../rounds/rounds.json', import.meta.url), 'utf8'))
const billing = JSON.parse(readFileSync(new URL('../billing/billing.json', import.meta.url), 'utf8'))
const crm = JSON.parse(readFileSync(new URL('./crm.json', import.meta.url), 'utf8'))
const board = JSON.parse(readFileSync(new URL('./board.json', import.meta.url), 'utf8'))
const consoleSource = readFileSync(new URL('./components/DisputeConsole.jsx', import.meta.url), 'utf8')
const toggleSource = readFileSync(new URL('./components/RoundToggle.jsx', import.meta.url), 'utf8')

try {
  await compile(mdxSource, {})
  ok('dispute-console.mdx compiles', true)
} catch (e) {
  ok(`dispute-console.mdx compiles (${e.message})`, false)
}

const rounds = roundsDoc.rounds || []
ok('rounds.json carries rounds', rounds.length > 0)
ok('round ids are unique', new Set(rounds.map((r) => r.id)).size === rounds.length)
ok('round orders ascend', rounds.every((r, i) => i === 0 || r.order > rounds[i - 1].order))
ok('every round carries an enabled flag', rounds.every((r) => typeof r.enabled === 'boolean'))
ok('every round carries scope and granularity', rounds.every((r) => r.scope && r.granularity))
ok('console renders from rounds.json', consoleSource.includes("from '../../rounds/rounds.json'") && consoleSource.includes('.map('))
ok('no round id is hardcoded in the components', rounds.every((r) => !consoleSource.includes(`'${r.id}'`) && !toggleSource.includes(`'${r.id}'`)))
ok('the page mounts the console', mdxSource.includes('<DisputeConsole />'))

const [b1, b2] = board.campaign || []
ok('board round 1 matches the engine sample run', b1 && b1.targets === 4 && b1.failures === 11 && b1.inquiries === 2 && b1.letters === 2)
ok('board round 2 matches the engine sample run', b2 && b2.targets === 2 && b2.failures === 4 && b2.inquiries === 1 && b2.letters === 2)
ok('board verdict matches the engine', board.verdict === 'HELD -> escalate' && board.chain_valid === true)
ok('marked exhibit carries marked fields', board.marked_exhibit.fields.some((f) => f.marked))

const [client] = crm.clients || []
ok('crm board matches the engine crm run', client && client.rounds === 2 && client.letters === 4 && client.reports === 2 && client.status === 'In Round')
ok('console renders the book and the merchant', consoleSource.includes("from '../crm.json'") && consoleSource.includes("from '../../billing/billing.json'"))
ok('merchant state is honest', billing.merchant.state === 'connected' && billing.merchant.processor === 'stripe')
ok('nothing is priced yet', billing.plans.every((p) => p.amount_cents === null) && (billing.products || []).every((p) => p.amount_cents === null))
ok('one flat subscription, no tiers', billing.plans.length === 1 && billing.plans[0].id === 'dispute-engine-flat')

console.log(failed ? `\n${failed} failure(s)` : '\nfrontend check: all green')
process.exit(failed ? 1 : 0)
