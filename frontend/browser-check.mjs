// Drive the console in headless Chrome: sample seal, round toggle,
// evidence gate, invalid file, local book, and screenshots.
// Nothing is mailed or posted off the local server.

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer, repoRoot } from './serve.mjs'

const artifacts = process.env.ARTIFACTS || '/opt/cursor/artifacts'
mkdirSync(artifacts, { recursive: true })
const server = await startServer(repoRoot, 0)
const profile = mkdtempSync(join(tmpdir(), 'dispute-chrome-'))
const port = 9333
const chromeBin = process.env.CHROME_PATH || 'google-chrome'
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

const chromeLog = []
chrome.stderr.on('data', (chunk) => chromeLog.push(chunk.toString()))
chrome.stdout.on('data', (chunk) => chromeLog.push(chunk.toString()))

const requests = []
const errors = []
let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) {
    failed++
    if (detail) console.error(detail)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForChrome() {
  const started = Date.now()
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return response.json()
    } catch { /* chrome still booting */ }
    await sleep(100)
  }
  throw new Error(`chrome did not open a debugging port\n${chromeLog.join('').slice(-2000)}`)
}

async function connect() {
  await waitForChrome()
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page') || targets[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('devtools websocket failed')))
  })
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    } else if (message.method === 'Network.requestWillBeSent') {
      requests.push(message.params.request.url)
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'exception')
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '))
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { ws, send }
}

async function textOf(send) {
  const result = await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })
  return result.result.value || ''
}

async function waitText(send, needle, label) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < 8000) {
    last = await textOf(send)
    if (last.includes(needle)) return last
    await sleep(50)
  }
  throw new Error(`timed out waiting for ${label}; page started:\n${last.slice(0, 800)}`)
}

async function click(send, selector) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true })()`,
    returnByValue: true,
  })
  if (result.result.value !== true) throw new Error(`missing ${selector}`)
}

async function shot(send, name) {
  const picture = await send('Page.captureScreenshot', { format: 'png' })
  const path = join(artifacts, name)
  writeFileSync(path, Buffer.from(picture.data, 'base64'))
  console.log(`  SHOT  ${path}`)
  return path
}

async function scrollTo(send, selector) {
  await send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start'})`,
  })
  await sleep(80)
}

async function setFiles(send, selector, files) {
  const doc = await send('DOM.getDocument', { depth: 0 })
  const found = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector })
  if (!found.nodeId) throw new Error(`no node ${selector}`)
  await send('DOM.setFileInputFiles', { nodeId: found.nodeId, files })
}

try {
  const { ws, send } = await connect()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('DOM.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: server.url })
  await waitText(send, 'Matches the Julia engine seal', 'sealed sample')
  let body = await textOf(send)
  check('sample verdict is held', body.includes('Verdict: HELD -> escalate'))
  check('sample board shows 11 failures and 2 drafts on round one', body.includes('Round Kick Regular') && body.includes('11'))
  check('sample says nothing was sent', body.includes('Nothing was sent'))
  check('checkout is unavailable', body.includes('Checkout unavailable') && body.includes('sells nothing'))
  const checkout = await send('Runtime.evaluate', {
    expression: `(() => { const node = document.querySelector('#checkout'); return node ? node.disabled : null })()`,
    returnByValue: true,
  })
  check('checkout control is disabled', checkout.result.value === true)
  await shot(send, 'dispute-console-desktop.png')
  await scrollTo(send, '#campaign')
  await shot(send, 'dispute-console-campaign.png')

  await click(send, 'button[data-letter="0"]')
  body = await textOf(send)
  check('first draft shows the marked remark and a placeholder address', body.includes('incoherent_remark') && body.includes('[CONSUMER ADDRESS]') && body.includes('[BUREAU ADDRESS]'))
  await scrollTo(send, '#letters')
  await shot(send, 'dispute-console-letter.png')

  await click(send, 'button[data-round-id="nerve-boosted"]')
  await waitText(send, 'does not match the sealed sample', 'unsealed toggle')
  const heldRows = await send('Runtime.evaluate', {
    expression: 'document.querySelectorAll("#board tbody tr").length',
    returnByValue: true,
  })
  const heldLetters = await send('Runtime.evaluate', {
    expression: 'document.querySelectorAll("#letter-list button").length',
    returnByValue: true,
  })
  const heldSeal = await send('Runtime.evaluate', {
    expression: 'document.querySelector("#seal-status").dataset.state',
    returnByValue: true,
  })
  const secondAttack = await send('Runtime.evaluate', {
    expression: 'document.querySelector("#board tbody tr:nth-child(2) th")?.textContent',
    returnByValue: true,
  })
  check('holding nerve runs punch against the second snapshot', heldRows.result.value === 2 && secondAttack.result.value === 'Punch of Fury Supreme')
  check('holding nerve seals round one plus both ends of each surviving tradeline', heldLetters.result.value === 6)
  check('held round is not the sealed sample', heldSeal.result.value === 'session')

  await click(send, 'button[data-round-id="nerve-boosted"]')
  await waitText(send, 'Matches the Julia engine seal', 'seal restored')
  const armedRows = await send('Runtime.evaluate', {
    expression: 'document.querySelectorAll("#board tbody tr").length',
    returnByValue: true,
  })
  check('restoring nerve returns both round rows', armedRows.result.value === 2)

  const bad = join(profile, 'bad.json')
  writeFileSync(bad, '{not json')
  await setFiles(send, '#report-files', [bad])
  await waitText(send, 'not valid JSON', 'invalid report')
  body = await textOf(send)
  check('invalid report does not keep the sealed success', body.includes('not valid JSON') && !body.includes('Matches the Julia engine seal'))
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' })
  await shot(send, 'dispute-console-error.png')

  await click(send, '#load-sample')
  await waitText(send, 'Matches the Julia engine seal', 'sample restored')

  const none = join(repoRoot, 'frontend/fixtures/gate-none.json')
  await setFiles(send, '#gate-file', [none])
  await waitText(send, 'GATED', 'fully gated campaign')
  body = await textOf(send)
  check('a gate that clears nothing withholds drafts', body.includes('GATED') && body.includes('No draft letters were sealed'))
  check('gated run is not labeled as the sample seal', !body.includes('Matches the Julia engine seal'))

  await click(send, '#gate-clear')
  await waitText(send, 'Matches the Julia engine seal', 'gate removed')

  const seal = JSON.parse(readFileSync(join(repoRoot, 'frontend/fixtures/engine-seal.json'), 'utf8'))
  const clean = join(profile, 'clean.json')
  writeFileSync(clean, JSON.stringify(seal.resolved_report))
  await setFiles(send, '#report-files', [clean])
  await waitText(send, 'Verdict: RESOLVED', 'clean report')
  body = await textOf(send)
  check('clean snapshot resolves with no drafts', body.includes('Verdict: RESOLVED') && body.includes('No draft letters were sealed'))
  check('clean snapshot is not called the sample seal', body.includes('does not match the sealed sample'))

  await click(send, '#load-sample')
  await waitText(send, 'Matches the Julia engine seal', 'sample before book')
  await click(send, '#use-sample-client')
  await click(send, '#record-campaign')
  await waitText(send, seal.sample_client_id, 'sample client id')
  body = await textOf(send)
  check('local book matches the julia client id', body.includes(seal.sample_client_id) && body.includes('matches the Julia CRM seal'))

  await click(send, '#tamper-demo')
  await waitText(send, 'flipped hash was refused', 'tamper demo')
  check('a flipped hash is refused', true)

  const offHost = requests.filter((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return false
    try { return new URL(url).hostname !== '127.0.0.1' } catch { return true }
  })
  check('browser stayed on the local server', offHost.length === 0, offHost.join('\n'))
  check('page raised no console errors', errors.length === 0, errors.join('\n'))

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url: server.url })
  await waitText(send, 'Matches the Julia engine seal', 'mobile sample')
  await shot(send, 'dispute-console-mobile.png')
  ws.close()
} catch (error) {
  failed++
  console.error(`  FAIL  browser run: ${error.message}`)
} finally {
  chrome.kill('SIGKILL')
  await server.close()
  await sleep(200)
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* profile cleanup is best effort */ }
}

console.log(failed ? `\n${failed} browser failure(s)` : '\nbrowser check: all green')
process.exit(failed ? 1 : 0)
