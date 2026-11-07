// Browser port of engine/DisputeEngine.jl, engine/CRM.jl, and
// engine/EvidenceGate.jl. Letter prose comes from the Julia seal's
// `copy` object so the frames are not a second source. frontend/integration.mjs
// refuses a result that differs from `julia engine/export_campaign.jl`.

import { sha256Hex } from './sha256.mjs'

const COPY_KEYS = [
  'ACCURACY',
  'REINVEST',
  'METRO2',
  'PERMISSIBLE',
  'LETTER_FRAME',
  'ACCOUNT_VERDICT',
  'UNCERTIFIED_VERDICT',
  'CRRG_FRAME',
  'LONG_FRAME',
  'MASTER_FRAME',
  'CERTIFY_DEMAND',
  'ANTI_STALL_SHIELD',
  'INQUIRY_DEMAND',
]

const EM = '\u2014'

export function sha256(text) {
  return sha256Hex(text)
}

function blank(v) {
  return v == null || (typeof v === 'string' && (v.trim() === '' || v.trim() === '--'))
}

function unique(values) {
  const out = []
  const seen = new Set()
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

function fail(tradelineId, field, rule, citation, detail) {
  return { tradeline_id: tradelineId, field, rule, citation, detail }
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export function loadRounds(doc) {
  const rounds = [...(doc?.rounds || [])]
  rounds.sort((a, b) => a.order - b.order)
  return rounds.filter((round) => round.enabled === true)
}

export function assertGate(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.cases)) {
    throw new Error('evidence file needs a cases array')
  }
  doc.cases.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || typeof entry.record_id !== 'string' || typeof entry.status !== 'string') {
      throw new Error(`gate case ${index + 1} needs record_id and status`)
    }
  })
  return doc
}

export function loadGate(doc) {
  assertGate(doc)
  const cleared = new Set()
  for (const entry of doc.cases) {
    if (entry.status === 'human_review_required') cleared.add(entry.record_id)
  }
  return cleared
}

export function gateFilter(failures, cleared) {
  return failures.filter((row) => cleared.has(row.tradeline_id))
}

export function validateReport(report, label = 'report') {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error(`${label} must be a JSON object`)
  }
  if (typeof report.consumer !== 'string' || report.consumer.trim() === '') {
    throw new Error(`${label} needs a consumer string`)
  }
  if (typeof report.report_id !== 'string' || report.report_id.trim() === '') {
    throw new Error(`${label} needs a report_id string`)
  }
  if (!Array.isArray(report.tradelines)) throw new Error(`${label} needs a tradelines array`)
  if (report.tradelines.length > 500) throw new Error(`${label} has too many tradelines`)
  report.tradelines.forEach((tl, index) => {
    const where = `${label} tradeline ${index + 1}`
    if (tl === null || typeof tl !== 'object' || Array.isArray(tl)) {
      throw new Error(`${where} is not an object`)
    }
    for (const key of ['id', 'creditor', 'bureau', 'account_ref']) {
      if (typeof tl[key] !== 'string' || tl[key].trim() === '') throw new Error(`${where} needs ${key}`)
    }
    if (tl.fields === null || typeof tl.fields !== 'object' || Array.isArray(tl.fields)) {
      throw new Error(`${where} needs a fields object`)
    }
  })
  if (report.inquiries != null) {
    if (!Array.isArray(report.inquiries)) throw new Error(`${label} inquiries must be an array`)
    report.inquiries.forEach((inquiry, index) => {
      const where = `${label} inquiry ${index + 1}`
      if (inquiry === null || typeof inquiry !== 'object' || Array.isArray(inquiry)) {
        throw new Error(`${where} is not an object`)
      }
      for (const key of ['bureau', 'creditor', 'date']) {
        if (typeof inquiry[key] !== 'string') throw new Error(`${where} needs ${key}`)
      }
    })
  }
  return report
}

export function verifyChain(chain) {
  let prev = 'GENESIS'
  for (const entry of chain) {
    if (sha256Hex(`${prev}|${entry.record}`) !== entry.hash) return false
    prev = entry.hash
  }
  return true
}

function seal(chain, record) {
  const prev = chain.length === 0 ? 'GENESIS' : chain[chain.length - 1].hash
  const hash = sha256Hex(`${prev}|${record}`)
  chain.push({ record, hash })
  return hash
}

export function createEngine(copy) {
  for (const key of COPY_KEYS) {
    if (typeof copy?.[key] !== 'string' || copy[key].length === 0) {
      throw new Error(`engine copy is missing ${key}`)
    }
  }

  function auditTradeline(tl) {
    const fields = tl.fields
    const id = tl.id
    const failures = []
    for (const req of ['account_status', 'loan_type', 'payment_status']) {
      if (blank(fields[req])) {
        failures.push(fail(id, req, 'blank_required_field', copy.METRO2, 'required field is blank or unreported'))
      }
    }
    if (!hasOwn(fields, 'balance_owed') || fields.balance_owed == null) {
      failures.push(fail(id, 'balance_owed', 'blank_required_field', copy.METRO2, 'balance owed is not reported'))
    }
    const lastVerified = hasOwn(fields, 'last_verified') ? fields.last_verified : null
    const dateReported = hasOwn(fields, 'date_reported') ? fields.date_reported : ''
    if (blank(lastVerified)) {
      failures.push(fail(id, 'last_verified', 'missing_verification', copy.ACCURACY, 'tradeline was never verified'))
    } else if (typeof lastVerified === 'string' && typeof dateReported === 'string' && lastVerified < dateReported) {
      failures.push(fail(
        id,
        'last_verified',
        'missing_verification',
        copy.ACCURACY,
        `last verified ${lastVerified} predates the reported date ${dateReported} ${EM} the record on file is unverified`,
      ))
    } else if (typeof lastVerified !== 'string' || typeof dateReported !== 'string') {
      throw new Error(`tradeline ${id} has a non-string verification date`)
    }
    const remarksRaw = hasOwn(fields, 'creditor_remarks') ? fields.creditor_remarks : ''
    if (remarksRaw != null && typeof remarksRaw !== 'string') {
      throw new Error(`tradeline ${id} creditor_remarks must be a string`)
    }
    const remarks = String(remarksRaw ?? '').toUpperCase()
    const balance = hasOwn(fields, 'balance_owed') ? fields.balance_owed : 0
    const status = fields.account_status ?? ''
    if (
      remarks.includes('CANNOT LOCATE') &&
      status === 'Open' &&
      typeof balance === 'number' &&
      Number.isFinite(balance) &&
      balance > 0
    ) {
      failures.push(fail(
        id,
        'creditor_remarks',
        'incoherent_remark',
        copy.ACCURACY,
        `furnisher reports it cannot locate the consumer while reporting an open balance of ${balance}`,
      ))
    }
    const lastActivity = hasOwn(fields, 'date_last_activity') ? fields.date_last_activity : ''
    const dateOpened = hasOwn(fields, 'date_opened') ? fields.date_opened : ''
    if (!blank(lastActivity) && !blank(dateOpened) && lastActivity < dateOpened) {
      failures.push(fail(
        id,
        'date_last_activity',
        'date_incoherence',
        copy.METRO2,
        `last activity ${lastActivity} predates the account opening ${dateOpened}`,
      ))
    }
    if (status === 'Closed' && blank(hasOwn(fields, 'closed_date') ? fields.closed_date : null)) {
      failures.push(fail(id, 'closed_date', 'missing_closure_date', copy.METRO2, 'closed account reports no closure date'))
    }
    if (status === 'Closed') {
      for (const stale of ['payment_status', 'term_length']) {
        if (hasOwn(fields, stale) && !blank(fields[stale])) {
          failures.push(fail(
            id,
            stale,
            'stale_terms_on_closed',
            copy.ACCURACY,
            `closed account still reports active terms (${stale} = ${fields[stale]}) ${EM} the record presents a closed obligation as a live one`,
          ))
        }
      }
    }
    if (tl.certified !== true) {
      failures.push(fail(
        id,
        '(tradeline)',
        'uncertified_tradeline',
        copy.REINVEST,
        'content was never certified to be in conformity with reporting standards',
      ))
    }
    return failures
  }

  function auditReport(report) {
    return report.tradelines.flatMap((tl) => auditTradeline(tl))
  }

  function auditInquiries(report) {
    const failures = []
    for (const inquiry of report.inquiries ?? []) {
      if (inquiry.permissible_purpose_documented !== true) {
        failures.push(fail(
          `INQ:${inquiry.creditor}`,
          'inquiry',
          'inquiry_without_permissible_purpose',
          copy.PERMISSIBLE,
          `inquiry by ${inquiry.creditor} dated ${inquiry.date} carries no documented permissible purpose`,
        ))
      }
    }
    return failures
  }

  function frameForRound(order) {
    if (order === 1) return copy.LONG_FRAME
    if (order === 2) return copy.MASTER_FRAME
    if (order === 3) return copy.CRRG_FRAME
    return copy.LETTER_FRAME
  }

  function renderLetter(consumer, bureau, targets, failures, frame, inquiries) {
    const lines = [consumer, '[CONSUMER ADDRESS]', '', bureau, '[BUREAU ADDRESS]', '', frame]
    for (const tl of targets) {
      const own = failures.filter((row) => row.tradeline_id === tl.id)
      if (own.length === 0) continue
      lines.push('')
      lines.push(tl.creditor)
      lines.push(`Account: ${tl.account_ref} \u2014 ${bureau}`)
      for (const row of own) {
        lines.push(`  [MARKED] ${row.field}: ${row.detail} [${row.rule}; ${row.citation}]`)
      }
      lines.push(own.some((row) => row.rule === 'uncertified_tradeline') ? copy.UNCERTIFIED_VERDICT : copy.ACCOUNT_VERDICT)
    }
    if (inquiries.length > 0) {
      lines.push('')
      lines.push('Inquiries')
      for (const row of inquiries) {
        lines.push(`  [MARKED] ${row.detail} [${row.rule}; ${row.citation}]`)
        lines.push(copy.INQUIRY_DEMAND)
      }
    }
    lines.push('')
    lines.push(copy.CERTIFY_DEMAND)
    lines.push('')
    lines.push(consumer)
    lines.push('Please send your written response to my address above.')
    lines.push('')
    lines.push(copy.ANTI_STALL_SHIELD)
    return `${lines.join('\n')}\n`
  }

  function runCampaign(rounds, reports, gate = null) {
    const chain = []
    const board = []
    let totalGated = 0
    for (let index = 0; index < rounds.length; index++) {
      if (index >= reports.length) break
      const round = rounds[index]
      const report = reports[index]
      let failures = auditReport(report)
      let inquiries = auditInquiries(report)
      let gated = 0
      if (gate) {
        const keptFailures = gateFilter(failures, gate)
        const keptInquiries = gateFilter(inquiries, gate)
        gated = failures.length - keptFailures.length + (inquiries.length - keptInquiries.length)
        failures = keptFailures
        inquiries = keptInquiries
        totalGated += gated
      }
      const failingIds = unique(failures.map((row) => row.tradeline_id))
      const tls = Object.create(null)
      for (const tl of report.tradelines) tls[tl.id] = tl
      const bureaus = unique(failingIds.map((id) => tls[id].bureau))
      const inqByBureau = new Map()
      const inqMeta = Object.create(null)
      for (const inquiry of report.inquiries ?? []) inqMeta[`INQ:${inquiry.creditor}`] = inquiry
      for (const row of inquiries) {
        const bureau = inqMeta[row.tradeline_id].bureau
        if (!inqByBureau.has(bureau)) inqByBureau.set(bureau, [])
        inqByBureau.get(bureau).push(row)
      }
      const letters = []
      if (round.granularity === 'tradeline') {
        const order = unique([...bureaus, ...inqByBureau.keys()])
        for (const bureau of order) {
          const targets = failingIds.filter((id) => tls[id].bureau === bureau).map((id) => tls[id])
          letters.push(renderLetter(
            report.consumer,
            bureau,
            targets,
            failures,
            frameForRound(round.order),
            inqByBureau.get(bureau) || [],
          ))
        }
      } else if (round.granularity === 'field') {
        for (const id of failingIds) {
          letters.push(renderLetter(report.consumer, tls[id].bureau, [tls[id]], failures, copy.LETTER_FRAME, []))
          if (round.scope === 'bureau-and-creditor') {
            letters.push(renderLetter(report.consumer, tls[id].creditor, [tls[id]], failures, copy.LETTER_FRAME, []))
          }
        }
      } else if (round.granularity === 'per-failure') {
        const copies = round.scope === 'bureau-and-creditor' ? 2 : 1
        for (const row of failures) {
          const tl = tls[row.tradeline_id]
          for (let n = 0; n < copies; n++) {
            letters.push(renderLetter(report.consumer, tl.bureau, [tl], [row], copy.LETTER_FRAME, []))
          }
        }
      }
      const record = `round=${round.id} report=${report.report_id} targets=${failingIds.length} failures=${failures.length} inquiries=${inquiries.length} gated=${gated} letters=${letters.length}`
      seal(chain, record)
      board.push({
        round: round.name,
        report: report.report_id,
        targets: failingIds.length,
        failures: failures.length,
        inquiries: inquiries.length,
        gated,
        letters: letters.length,
        letter_text: letters,
      })
      if (failures.length === 0 && inquiries.length === 0) {
        const verdict = totalGated + gated > 0 ? `GATED ${EM} needs evidence` : 'RESOLVED'
        seal(chain, `verdict=${verdict} report=${report.report_id}`)
        return { verdict, chain_valid: verifyChain(chain), chain, rounds: board }
      }
    }
    const last = reports.length ? reports[reports.length - 1] : null
    let finalFailures = last ? auditReport(last) : []
    let finalInquiries = last ? auditInquiries(last) : []
    if (gate) {
      finalFailures = gateFilter(finalFailures, gate)
      finalInquiries = gateFilter(finalInquiries, gate)
    }
    const verdict = finalFailures.length === 0 && finalInquiries.length === 0
      ? (totalGated > 0 ? `GATED ${EM} needs evidence` : 'RESOLVED')
      : 'HELD -> escalate'
    seal(chain, `verdict=${verdict}`)
    return { verdict, chain_valid: verifyChain(chain), chain, rounds: board }
  }

  return { auditTradeline, auditReport, auditInquiries, renderLetter, runCampaign }
}

export function emptyBook() {
  return { clients: [], events: [] }
}

function crmEvent(store, chain, record) {
  const hash = seal(chain, record)
  store.events.push({ record, hash })
  return hash
}

export function crmAddClient(store, chain, name, email) {
  const id = `C${sha256Hex(name + email).slice(0, 8)}`
  if (store.clients.some((client) => client.id === id)) return id
  store.clients.push({
    id,
    name,
    email,
    status: 'Ready To Attack',
    reports: [],
    campaigns: [],
    invoices: [],
    stripe_customer: null,
  })
  crmEvent(store, chain, `client_added id=${id}`)
  return id
}

export function crmClient(store, id) {
  const client = store.clients.find((item) => item.id === id)
  if (!client) throw new Error(`unknown client ${id}`)
  return client
}

export function crmAttachReport(store, chain, clientId, reportId) {
  const client = crmClient(store, clientId)
  client.reports.push(reportId)
  crmEvent(store, chain, `report_attached client=${clientId} report=${reportId}`)
}

export function crmRecordCampaign(store, chain, clientId, result) {
  const client = crmClient(store, clientId)
  const letters = result.rounds.reduce((sum, row) => sum + row.letters, 0)
  client.campaigns.push({ rounds: result.rounds.length, letters, verdict: result.verdict })
  client.status = result.verdict === 'RESOLVED' ? 'Resolved' : 'In Round'
  crmEvent(store, chain, `campaign_recorded client=${clientId} letters=${letters} verdict=${result.verdict}`)
  return letters
}

export function crmAddInvoice(store, chain, clientId, description, amountCents) {
  const client = crmClient(store, clientId)
  const invoice = {
    description,
    amount_cents: amountCents,
    status: 'open',
    stripe_invoice: null,
  }
  client.invoices.push(invoice)
  crmEvent(store, chain, `invoice_added client=${clientId} amount_cents=${amountCents}`)
  return invoice
}

export function crmSummary(store, clientId) {
  const client = crmClient(store, clientId)
  const rounds = client.campaigns.reduce((sum, camp) => sum + (camp.rounds || 0), 0)
  const letters = client.campaigns.reduce((sum, camp) => sum + (camp.letters || 0), 0)
  const open = client.invoices.reduce((sum, invoice) => (
    invoice.status === 'open' ? sum + (invoice.amount_cents || 0) : sum
  ), 0)
  return {
    name: client.name,
    status: client.status,
    reports: client.reports.length,
    rounds,
    letters,
    open_balance_cents: open,
  }
}

export function formatUsdFromCents(cents) {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
