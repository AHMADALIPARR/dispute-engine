// Static smoke for the Pages console. No browser required.
// Serves the repository root the way GitHub Pages serves main, then
// checks paths, the seal, and that the page does not embed secrets.

import { readFileSync } from 'node:fs'
import { startServer, repoRoot } from './serve.mjs'

let failed = 0
const check = (name, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failed++
}

const server = await startServer(repoRoot, 0)

async function get(path) {
  const response = await fetch(server.url + path.replace(/^\//, ''))
  const buffer = Buffer.from(await response.arrayBuffer())
  return { status: response.status, type: response.headers.get('content-type') || '', body: buffer.toString('utf8'), bytes: buffer }
}

try {
  const index = await get('/')
  check('index status', index.status === 200 && index.type.includes('text/html'))
  check('index is the console', index.body.includes('Sovereign Dispute Engine') && index.body.includes('id="run-campaign"'))
  check('index loads the browser engine', index.body.includes('frontend/site/app.mjs') && index.body.includes('frontend/site/app.css'))
  check('asset paths are relative', !/<(?:script|link|img)\b[^>]*(?:src|href)\s*=\s*["']\//i.test(index.body))
  check('no inline script on the console', !/<script(?![^>]*\bsrc=)/i.test(index.body))
  check('content security policy is local only', index.body.includes("default-src 'self'") && index.body.includes("connect-src 'self'") && index.body.includes("form-action 'none'"))
  check('page states it does not send', index.body.includes('nothing on this page is sent') || index.body.includes('Nothing on this page is sent') || index.body.includes('Static page'))
  check('noscript names the julia command', index.body.includes('<noscript>') && index.body.includes('julia engine/DisputeEngine.jl'))

  for (const path of [
    'frontend/site/app.css',
    'frontend/site/app.mjs',
    'frontend/site/engine.mjs',
    'frontend/site/sha256.mjs',
    'frontend/fixtures/engine-seal.json',
    'frontend/fixtures/gate-sample.json',
    'frontend/fixtures/gate-none.json',
    'sample/report-round0.json',
    'sample/report-round1.json',
    'rounds/rounds.json',
    'billing/billing.json',
    'assets/poster.webp',
    '.nojekyll',
  ]) {
    const response = await get(path)
    check(`serves ${path}`, response.status === 200 && response.bytes.length > (path === '.nojekyll' ? -1 : 0))
  }

  const missing = await get('no-such-page')
  check('unknown path is 404', missing.status === 404)
  const escape = await get('sample/%2e%2e/%2e%2e/etc/passwd')
  check('dot segments are not served', escape.status === 403 || escape.status === 404)
  check('passwd body is absent', !escape.body.includes('root:'))

  const seal = JSON.parse((await get('frontend/fixtures/engine-seal.json')).body)
  check('seal is the sample campaign', seal.schema === 'dispute-engine-seal/1' && seal.campaigns.sample.verdict === 'HELD -> escalate' && seal.campaigns.sample.rounds[0].failures === 11 && seal.campaigns.sample.rounds[0].letters === 2)
  check('seal keeps the gated verdict', seal.campaigns.gated_none.verdict.startsWith('GATED') && seal.campaigns.gated_none.rounds[0].letters === 0)
  check('seal letters are drafts', seal.campaigns.sample.rounds[0].letter_text[0].includes('[CONSUMER ADDRESS]') && seal.campaigns.sample.rounds[0].letter_text[0].includes('\u2022\u2022420'))

  const billing = JSON.parse((await get('billing/billing.json')).body)
  check('catalog is unpriced', billing.plans.every((plan) => plan.amount_cents === null))

  const scanned = [
    index.body,
    (await get('frontend/site/app.mjs')).body,
    (await get('frontend/site/engine.mjs')).body,
    (await get('frontend/fixtures/engine-seal.json')).body,
    (await get('billing/billing.json')).body,
  ].join('\n')
  check('no stripe secret', !/sk_live_|sk_test_|rk_live_/.test(scanned))
  check('no private key', !scanned.includes('BEGIN PRIVATE KEY') && !scanned.includes('BEGIN RSA PRIVATE KEY'))
  check('no aws key', !/AKIA[0-9A-Z]{16}/.test(scanned))
  check('no ssn pattern', !/\b\d{3}-\d{2}-\d{4}\b/.test(scanned))

  const notFound = readFileSync(new URL('../404.html', import.meta.url), 'utf8')
  check('pages 404 returns to the console', notFound.includes('location.replace') && notFound.includes('/dispute-engine/'))
} finally {
  await server.close()
}

console.log(failed ? `\n${failed} smoke failure(s)` : '\nfrontend smoke: all green')
process.exit(failed ? 1 : 0)
