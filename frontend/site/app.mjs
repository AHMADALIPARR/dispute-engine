import {
  assertGate,
  createEngine,
  crmAddClient,
  crmAddInvoice,
  crmAttachReport,
  crmRecordCampaign,
  crmSummary,
  emptyBook,
  formatUsdFromCents,
  gateFilter,
  loadGate,
  loadRounds,
  validateReport,
  verifyChain,
} from './engine.mjs'

const $ = (id) => document.getElementById(id)

const state = {
  engine: null,
  seal: null,
  roundDocs: [],
  enabled: new Map(),
  reports: [],
  gate: null,
  gateLabel: '',
  result: null,
  book: emptyBook(),
  bookChain: [],
  clientId: '',
  selectedLetter: 0,
  billing: null,
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

function showError(message) {
  state.result = null
  const error = $('error')
  error.hidden = false
  error.textContent = message
  $('verdict').textContent = ''
  $('seal-status').textContent = ''
  $('seal-status').dataset.state = ''
  $('board').replaceChildren()
  $('failure-list').replaceChildren()
  $('exhibit').replaceChildren()
  $('letter-list').replaceChildren()
  $('letter-view').textContent = 'No campaign is on screen. The last attempt failed, so the previous result was cleared.'
  $('chain-log').replaceChildren()
  $('chain-status').textContent = ''
  for (const id of ['download-letters', 'copy-letter', 'chain-check', 'tamper-demo', 'download-result', 'record-campaign']) {
    $(id).disabled = true
  }
  $('boot-status').textContent = 'The campaign is not showing a result.'
}

function sameJson(actual, expected) {
  const sortify = (value) => {
    if (Array.isArray(value)) return value.map(sortify)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortify(value[key])]))
    }
    return value
  }
  return JSON.stringify(sortify(actual)) === JSON.stringify(sortify(expected))
}

function letterCount(result) {
  return result.rounds.reduce((sum, row) => sum + row.letters, 0)
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 1_000_000) {
      reject(new Error(`${file.name} is over the 1 MB limit and was not read.`))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(file)
  })
}

function parseJson(text, name) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${name} is not valid JSON. Nothing was run.`)
  }
}

function armedRounds() {
  return loadRounds({
    rounds: state.roundDocs.map((round) => ({ ...round, enabled: state.enabled.get(round.id) === true })),
  })
}

function renderRounds() {
  const list = $('round-list')
  list.replaceChildren()
  const wrap = el('div', { class: 'rounds' })
  for (const round of state.roundDocs) {
    const on = state.enabled.get(round.id) === true
    const button = el('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': String(on),
      'aria-label': `${round.name} ${on ? 'armed' : 'held'}`,
      dataset: { roundId: round.id },
      onclick: () => {
        state.enabled.set(round.id, !state.enabled.get(round.id))
        renderRounds()
        if (state.reports.length) run()
      },
    }, [el('span')])
    wrap.append(el('div', { class: 'round' }, [
      button,
      el('div', { class: 'round-copy' }, [
        el('div', {}, [
          el('strong', {}, `${round.order}. ${round.name} `),
          el('span', { class: 'kind' }, `${round.scope} · ${round.granularity}`),
        ]),
        el('div', {}, round.description),
      ]),
      el('div', { class: on ? 'state-armed' : 'state-held' }, on ? 'ARMED' : 'HELD OUT'),
    ]))
  }
  list.append(wrap)
}

function renderReports() {
  const list = $('report-list')
  list.replaceChildren()
  if (state.reports.length === 0) {
    list.append(el('p', { class: 'prose' }, 'No reports loaded.'))
    return
  }
  const cards = el('div', { class: 'cards' })
  state.reports.forEach((item, index) => {
    const report = item.report
    cards.append(el('article', { class: 'card' }, [
      el('strong', {}, `Round slot ${index + 1}: ${report.report_id}`),
      el('div', {}, `${item.name} · ${report.consumer} · ${report.tradelines.length} tradelines · ${(report.inquiries || []).length} inquiries`),
    ]))
  })
  list.append(cards)
}

function renderGate() {
  const node = $('gate-status')
  if (!state.gate) {
    node.textContent = 'No evidence file loaded. The press is not gated.'
    return
  }
  const ids = [...state.gate]
  node.textContent = ids.length
    ? `${state.gateLabel}: ${ids.length} record${ids.length === 1 ? '' : 's'} cleared (${ids.join(', ')}). Every other marked record is withheld.`
    : `${state.gateLabel}: no record is cleared. human_review_required is the only status that opens the press, so this run should seal no drafts.`
}

function renderBoard(result) {
  const wrap = $('board')
  wrap.replaceChildren()
  if (result.rounds.length === 0) {
    wrap.append(el('p', { class: 'prose' }, 'No rounds were armed, so the engine sealed no round row and no draft. The verdict below is the audit of the last snapshot.'))
    return
  }
  const table = el('table', {}, [
    el('caption', {}, 'Campaign board from this browser run. Swipe sideways if the columns overflow.'),
    el('thead', {}, el('tr', {}, ['Attack', 'Report', 'Targets', 'Field failures', 'Inquiries', 'Withheld', 'Drafts'].map((label) => el('th', { scope: 'col' }, label)))),
  ])
  const body = el('tbody')
  for (const row of result.rounds) {
    body.append(el('tr', {}, [
      el('th', { scope: 'row' }, row.round),
      el('td', {}, row.report),
      el('td', {}, String(row.targets)),
      el('td', {}, String(row.failures)),
      el('td', {}, String(row.inquiries)),
      el('td', {}, String(row.gated)),
      el('td', {}, String(row.letters)),
    ]))
  }
  table.append(body)
  wrap.append(table)
}

function keptFor(report) {
  const failures = state.engine.auditReport(report)
  const inquiries = state.engine.auditInquiries(report)
  if (!state.gate) return { failures, inquiries, withheld: [] }
  return {
    failures: gateFilter(failures, state.gate),
    inquiries: gateFilter(inquiries, state.gate),
    withheld: [...failures, ...inquiries].filter((row) => !state.gate.has(row.tradeline_id)),
  }
}

function renderFailures() {
  const host = $('failure-list')
  host.replaceChildren()
  state.reports.forEach((item) => {
    const kept = keptFor(item.report)
    host.append(el('h3', { class: 'section-label' }, `${item.report.report_id} marked rows`))
    if (kept.failures.length === 0 && kept.inquiries.length === 0) {
      host.append(el('p', { class: 'prose' }, 'Nothing in this snapshot is both marked and cleared.'))
    }
    const cards = el('div', { class: 'cards' })
    for (const row of [...kept.failures, ...kept.inquiries]) {
      cards.append(el('article', { class: 'card' }, [
        el('strong', {}, `${row.tradeline_id} · ${row.field} · ${row.rule}`),
        el('div', {}, row.detail),
        el('div', {}, row.citation),
      ]))
    }
    host.append(cards)
    if (kept.withheld.length) {
      host.append(el('p', { class: 'prose' }, `${kept.withheld.length} marked row${kept.withheld.length === 1 ? '' : 's'} withheld by the evidence gate.`))
    }
  })
}

function renderExhibit() {
  const host = $('exhibit')
  host.replaceChildren()
  const first = state.reports[0]?.report
  if (!first || first.tradelines.length === 0) return
  host.append(el('h3', { class: 'section-label' }, 'Marked fields on the first snapshot'))
  host.append(el('label', { class: 'section-label', for: 'tradeline-select' }, 'Tradeline'))
  const select = el('select', { id: 'tradeline-select' })
  for (const tl of first.tradelines) {
    select.append(el('option', { value: tl.id }, `${tl.id} · ${tl.creditor} · ${tl.bureau}`))
  }
  const paint = () => {
    const tl = first.tradelines.find((item) => item.id === select.value) || first.tradelines[0]
    const kept = keptFor(first)
    const marks = new Map(kept.failures.filter((row) => row.tradeline_id === tl.id).map((row) => [row.field, row]))
    const grid = el('div', { class: 'field-grid', id: 'field-grid' })
    const names = Object.keys(tl.fields)
    if (marks.has('(tradeline)') && !names.includes('(tradeline)')) names.push('(tradeline)')
    for (const name of names) {
      const marked = marks.has(name)
      const value = name === '(tradeline)' ? (tl.certified === true ? 'certified' : 'not certified') : tl.fields[name]
      const shown = value == null || value === '' ? 'blank' : String(value)
      grid.append(el('div', { class: marked ? 'marked' : 'plain-field' }, [
        el('span', {}, [
          el('span', { class: 'field-name' }, name),
          marked ? el('span', { class: 'tag' }, ' Marked') : el('span', { class: 'tag' }, ' Clear'),
        ]),
        el('span', {}, shown),
      ]))
    }
    const prior = $('field-grid')
    if (prior) prior.replaceWith(grid)
    else host.append(grid)
  }
  select.addEventListener('change', paint)
  host.append(select)
  paint()
}

function flatLetters(result) {
  const letters = []
  result.rounds.forEach((row, roundIndex) => {
    row.letter_text.forEach((text, letterIndex) => {
      const lines = text.split('\n')
      letters.push({
        text,
        label: `${row.round} · draft ${letterIndex + 1} · ${lines[3] || 'unknown addressee'}`,
        filename: `draft-${roundIndex + 1}-${letterIndex + 1}.txt`,
      })
    })
  })
  return letters
}

function renderLetters(result) {
  const letters = flatLetters(result)
  const list = $('letter-list')
  list.replaceChildren()
  $('download-letters').disabled = letters.length === 0
  $('copy-letter').disabled = letters.length === 0
  if (letters.length === 0) {
    $('letter-view').textContent = 'No draft letters were sealed for this run.'
    return
  }
  if (state.selectedLetter >= letters.length) state.selectedLetter = 0
  letters.forEach((letter, index) => {
    list.append(el('button', {
      type: 'button',
      'aria-pressed': String(index === state.selectedLetter),
      dataset: { letter: String(index) },
      onclick: () => {
        state.selectedLetter = index
        renderLetters(result)
      },
    }, letter.label))
  })
  $('letter-view').textContent = letters[state.selectedLetter].text
}

function renderChain(result) {
  const log = $('chain-log')
  log.replaceChildren()
  for (const entry of result.chain) {
    log.append(el('li', {}, [
      el('div', {}, entry.record),
      el('code', {}, entry.hash),
    ]))
  }
  $('chain-check').disabled = false
  $('tamper-demo').disabled = false
  $('download-result').disabled = false
  $('chain-status').textContent = result.chain_valid
    ? `Chain checks valid. ${result.chain.length} entries. Tip ${result.chain[result.chain.length - 1].hash}.`
    : 'Chain check failed. This result is not shown as valid.'
}

function renderResult(result) {
  $('error').hidden = true
  const matched = state.seal && sameJson(result, state.seal.campaigns.sample)
  const seal = $('seal-status')
  seal.dataset.state = matched ? 'match' : 'session'
  seal.textContent = matched
    ? 'Matches the Julia engine seal for the synthetic sample campaign.'
    : 'Computed in this browser. It does not match the sealed sample campaign. Compare a local run with julia engine/export_campaign.jl.'
  const verdict = $('verdict')
  verdict.textContent = `Verdict: ${result.verdict}`
  renderBoard(result)
  renderFailures()
  renderExhibit()
  renderLetters(result)
  renderChain(result)
  $('record-campaign').disabled = false
  const drafts = letterCount(result)
  $('boot-status').textContent = `Campaign updated. Verdict ${result.verdict}. ${drafts} draft letter${drafts === 1 ? '' : 's'}. Nothing was sent.`
}

function run() {
  if (!state.engine) return
  if (state.reports.length === 0) {
    showError('Load at least one report snapshot.')
    return
  }
  try {
    for (const item of state.reports) validateReport(item.report, item.name)
    const result = state.engine.runCampaign(armedRounds(), state.reports.map((item) => item.report), state.gate)
    if (!result.chain_valid) throw new Error('The browser chain did not verify. No result is shown as valid.')
    state.result = result
    renderResult(result)
  } catch (error) {
    showError(error.message || 'The campaign failed.')
  }
}

function renderMerchant() {
  const host = $('merchant-body')
  host.replaceChildren()
  const billing = state.billing
  if (!billing) {
    host.append(el('p', { class: 'prose' }, 'billing/billing.json did not load. Checkout stays unavailable.'))
    return
  }
  const plan = (billing.plans || [])[0]
  const amount = plan ? plan.amount_cents : null
  const price = amount == null
    ? 'Amount not set. An unpriced plan sells nothing.'
    : `Catalog amount ${formatUsdFromCents(amount)}. This static page still cannot start checkout.`
  host.append(el('div', { class: 'prose' }, [
    el('p', {}, `Processor recorded in the catalog: ${billing.merchant?.processor || 'unknown'}. Catalog state: ${billing.merchant?.state || 'unknown'}.`),
    el('p', {}, plan ? `${plan.name} · ${plan.interval || 'once'}. ${price}` : 'No plan is in the catalog.'),
    el('p', {}, 'Stripe.js is not loaded. This page cannot create a customer, a subscription, or a charge. The book is the record; the rail is not called from GitHub Pages.'),
  ]))
  host.append(el('div', { class: 'toolbar' }, [
    el('button', { type: 'button', id: 'checkout', disabled: true }, amount == null
      ? 'Checkout unavailable — unpriced plan sells nothing'
      : 'Checkout unavailable on this static page'),
  ]))
}

function renderBook() {
  const host = $('book-body')
  host.replaceChildren()
  if (!state.clientId) {
    host.append(el('p', {}, 'No local client yet.'))
    $('download-book').disabled = true
    $('add-invoice').disabled = true
    return
  }
  const summary = crmSummary(state.book, state.clientId)
  const sampleId = state.seal?.sample_client_id
  const usingSample = $('client-name').value === 'SAMPLE CONSUMER' && $('client-email').value === 'sample@example.com'
  host.append(el('div', { class: 'cards' }, [
    el('article', { class: 'card' }, [
      el('strong', {}, summary.name),
      el('div', {}, `Id ${state.clientId}`),
      el('div', {}, `Status ${summary.status} · reports ${summary.reports} · rounds ${summary.rounds} · draft letters ${summary.letters}`),
      el('div', {}, `Open memo balance ${formatUsdFromCents(summary.open_balance_cents)}`),
      el('div', {}, usingSample && state.clientId === sampleId
        ? 'This id matches the Julia CRM seal for the synthetic sample client.'
        : 'Local id only. It is not asserted against the sample seal.'),
    ]),
  ]))
  $('download-book').disabled = false
  $('add-invoice').disabled = false
}

function download(filename, text, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = el('a', { href: url, download: filename })
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function currentLetters() {
  return state.result ? flatLetters(state.result) : []
}

async function copyLetter() {
  const letters = currentLetters()
  const letter = letters[state.selectedLetter]
  if (!letter) return
  try {
    await navigator.clipboard.writeText(letter.text)
    $('boot-status').textContent = 'Draft copied to the clipboard on this device. It was not sent.'
  } catch {
    $('letter-view').focus()
    $('boot-status').textContent = 'Clipboard was refused. The draft is selected on this page and was not sent.'
  }
}

function recordCampaign() {
  const name = $('client-name').value.trim()
  const email = $('client-email').value.trim()
  if (!state.result) {
    showError('Run a campaign before recording it.')
    return
  }
  if (!name || !email) {
    $('boot-status').textContent = 'A local client needs a name and an email. Nothing was recorded.'
    return
  }
  try {
    state.book = emptyBook()
    state.bookChain = []
    state.clientId = crmAddClient(state.book, state.bookChain, name, email)
    for (const item of state.reports) crmAttachReport(state.book, state.bookChain, state.clientId, item.report.report_id)
    crmRecordCampaign(state.book, state.bookChain, state.clientId, state.result)
    renderBook()
    $('boot-status').textContent = 'Campaign recorded in this tab only. Nothing was sent.'
  } catch (error) {
    showError(error.message)
  }
}

function addInvoice() {
  if (!state.clientId) return
  const raw = $('invoice-cents').value
  if (raw === '') {
    $('boot-status').textContent = 'Enter an amount in cents. No memo was added, and nothing was charged.'
    return
  }
  const cents = Number(raw)
  if (!Number.isInteger(cents) || cents < 0) {
    $('boot-status').textContent = 'Amount must be a whole number of cents. No memo was added.'
    return
  }
  crmAddInvoice(state.book, state.bookChain, state.clientId, $('invoice-memo').value || 'Local memo', cents)
  renderBook()
  $('boot-status').textContent = 'Local invoice memo added in this tab. Stripe was not called.'
}

async function loadSample() {
  const r0 = await fetch(new URL('../../sample/report-round0.json', import.meta.url))
  const r1 = await fetch(new URL('../../sample/report-round1.json', import.meta.url))
  if (!r0.ok || !r1.ok) throw new Error('The synthetic sample reports did not load.')
  state.reports = [
    { name: 'sample/report-round0.json', report: validateReport(await r0.json(), 'sample/report-round0.json') },
    { name: 'sample/report-round1.json', report: validateReport(await r1.json(), 'sample/report-round1.json') },
  ]
  state.gate = null
  state.gateLabel = ''
  $('report-files').value = ''
  $('gate-file').value = ''
  renderReports()
  renderGate()
}

async function boot() {
  const status = $('boot-status')
  try {
    const [sealRes, roundsRes, billingRes] = await Promise.all([
      fetch(new URL('../fixtures/engine-seal.json', import.meta.url)),
      fetch(new URL('../../rounds/rounds.json', import.meta.url)),
      fetch(new URL('../../billing/billing.json', import.meta.url)),
    ])
    if (!sealRes.ok) throw new Error(`Engine seal failed to load (${sealRes.status}). The sample campaign will not be shown as verified.`)
    if (!roundsRes.ok) throw new Error(`rounds.json failed to load (${roundsRes.status}).`)
    if (!billingRes.ok) throw new Error(`billing.json failed to load (${billingRes.status}).`)
    state.seal = await sealRes.json()
    if (state.seal.schema !== 'dispute-engine-seal/1') throw new Error('Engine seal schema is not recognized. No campaign was fabricated.')
    state.engine = createEngine(state.seal.copy)
    const roundsDoc = await roundsRes.json()
    state.roundDocs = [...(roundsDoc.rounds || [])].sort((a, b) => a.order - b.order)
    state.enabled = new Map(state.roundDocs.map((round) => [round.id, round.enabled === true]))
    state.billing = await billingRes.json()
    renderRounds()
    renderMerchant()
    await loadSample()
    $('run-campaign').disabled = false
    run()
    status.textContent = $('boot-status').textContent
  } catch (error) {
    $('run-campaign').disabled = true
    showError(error.message || 'The console could not start.')
  }
}

$('run-campaign').addEventListener('click', run)
$('load-sample').addEventListener('click', async () => {
  try {
    await loadSample()
    for (const round of state.roundDocs) state.enabled.set(round.id, round.enabled === true)
    renderRounds()
    run()
  } catch (error) {
    showError(error.message)
  }
})
$('clear-session').addEventListener('click', () => {
  state.reports = []
  state.gate = null
  state.gateLabel = ''
  state.result = null
  state.book = emptyBook()
  state.bookChain = []
  state.clientId = ''
  $('client-name').value = ''
  $('client-email').value = ''
  $('invoice-cents').value = ''
  $('report-files').value = ''
  $('gate-file').value = ''
  renderReports()
  renderGate()
  renderBook()
  showError('This tab was cleared. Reload the synthetic sample to run the sealed campaign again.')
})
$('report-files').addEventListener('change', async (event) => {
  const files = [...event.target.files]
  if (files.length === 0) return
  try {
    const next = []
    for (const file of files) {
      const json = parseJson(await readFile(file), file.name)
      next.push({ name: file.name, report: validateReport(json, file.name) })
    }
    state.reports = next
    renderReports()
    run()
  } catch (error) {
    showError(`${error.message} The previous campaign was cleared.`)
  }
})
$('gate-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const json = assertGate(parseJson(await readFile(file), file.name))
    state.gate = loadGate(json)
    state.gateLabel = file.name
    renderGate()
    if (state.reports.length) run()
  } catch (error) {
    showError(`${error.message} The evidence file was not applied.`)
  }
})
$('gate-clear').addEventListener('click', () => {
  state.gate = null
  state.gateLabel = ''
  $('gate-file').value = ''
  renderGate()
  if (state.reports.length && state.engine) run()
})
$('download-letters').addEventListener('click', () => {
  const letters = currentLetters()
  if (letters.length === 0) return
  const body = letters.map((letter) => `===== ${letter.label} =====\n${letter.text}`).join('\n')
  download('draft-letters.txt', body, 'text/plain;charset=utf-8')
})
$('copy-letter').addEventListener('click', () => { copyLetter() })
$('download-result').addEventListener('click', () => {
  if (!state.result) return
  download('campaign.json', `${JSON.stringify(state.result, null, 2)}\n`, 'application/json')
})
$('download-book').addEventListener('click', () => {
  download('client-book-session.json', `${JSON.stringify(state.book, null, 2)}\n`, 'application/json')
})
$('chain-check').addEventListener('click', () => {
  if (!state.result) return
  const ok = verifyChain(state.result.chain)
  $('chain-status').textContent = ok
    ? 'Re-check passed. The chain on screen matches the hash rule.'
    : 'Re-check failed. Do not treat this chain as intact.'
})
$('tamper-demo').addEventListener('click', () => {
  if (!state.result?.chain.length) return
  const copy = state.result.chain.map((entry) => ({ ...entry }))
  const flip = copy[0].hash[0] === 'a' ? 'b' : 'a'
  copy[0] = { ...copy[0], hash: flip + copy[0].hash.slice(1) }
  const ok = verifyChain(copy)
  $('chain-status').textContent = ok
    ? 'Unexpected: the altered hash still verified.'
    : 'A flipped hash was refused. The campaign chain on screen was not changed.'
})
$('use-sample-client').addEventListener('click', () => {
  $('client-name').value = 'SAMPLE CONSUMER'
  $('client-email').value = 'sample@example.com'
  $('boot-status').textContent = 'Synthetic sample client filled in locally. It has not been recorded until you record the campaign.'
})
$('record-campaign').addEventListener('click', recordCampaign)
$('add-invoice').addEventListener('click', addInvoice)

boot()
