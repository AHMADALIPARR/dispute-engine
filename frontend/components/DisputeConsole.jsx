import React from 'react'
import roundsDoc from '../../rounds/rounds.json'
import billing from '../../billing/billing.json'
import board from '../board.json'
import crm from '../crm.json'
import { RoundToggle } from './RoundToggle.jsx'

/**
 * DisputeConsole — the dispute campaign panel. Three exhibits, one
 * source of truth each: the round toggles render rounds/rounds.json
 * (the same file the Julia engine reads), and the campaign board
 * renders board.json, the engine's verified sample run. Nothing is
 * hardcoded here: add a round to the JSON and it appears on the
 * panel and in the engine's escalation ladder.
 */
export function DisputeConsole() {
  const ex = board.marked_exhibit
  return (
    <section className="sf-panel">
      <header className="sf-panel-head">
        <span className="sf-panel-title">DISPUTE CONSOLE — CAMPAIGN CONTROL</span>
        <span className="sf-panel-meta">
          engine: Julia · audit: FCRA / Metro 2 conformance · verdicts: hash-chained
        </span>
      </header>

      <div className="dx-section-title">CAMPAIGN BOARD</div>
      <div style={{ padding: '6px 18px 10px' }}>
        <table className="dx-board">
          <thead>
            <tr>
              <th>Attack</th>
              <th>Report</th>
              <th>Targets</th>
              <th>Field failures</th>
              <th>Inquiries</th>
              <th>Letters</th>
            </tr>
          </thead>
          <tbody>
            {board.campaign.map((row) => (
              <tr key={row.round}>
                <td>{row.round}</td>
                <td>{row.report}</td>
                <td>{row.targets}</td>
                <td>{row.failures}</td>
                <td>{row.inquiries}</td>
                <td>{row.letters}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dx-verdict">
          OVERALL: {board.verdict} · verdict chain valid: {String(board.chain_valid)}
        </div>
      </div>

      <div className="dx-section-title">CLIENTS — THE BOOK</div>
      <div style={{ padding: '6px 18px 10px' }}>
        <table className="dx-board">
          <thead>
            <tr>
              <th>Client</th>
              <th>Status</th>
              <th>Reports</th>
              <th>Rounds</th>
              <th>Letters</th>
              <th>Open balance</th>
            </tr>
          </thead>
          <tbody>
            {crm.clients.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.status}</td>
                <td>{c.reports}</td>
                <td>{c.rounds}</td>
                <td>{c.letters}</td>
                <td>{c.open_balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dx-section-title">
        MERCHANT — {billing.merchant.processor.toUpperCase()} · {billing.merchant.state.replace('_', ' ').toUpperCase()}
      </div>
      <div style={{ padding: '6px 18px 10px', fontSize: 13 }}>
        <div>
          One flat subscription: {billing.plans.map((p) => p.name).join(' · ')} — the whole
          engine, no per-round credits, no tiers. The fee is the owner's to name; unpriced
          sells nothing.
        </div>
        <div style={{ color: '#6d7690' }}>
          Stripe runs the money: customers, subscriptions, checkout, invoices. The CRM is
          the book of record — Stripe mirrors into it, never the other way.
        </div>
      </div>

      <div className="dx-section-title">ROUND CONTROL</div>
      <div className="sf-panel-body">
        {roundsDoc.rounds.map((r) => (
          <RoundToggle key={r.id} round={r} />
        ))}
      </div>

      <div className="dx-section-title">
        MARKED TRADELINE — {ex.creditor} ({ex.account_ref}) · {ex.bureau}
      </div>
      <div className="dx-grid">
        {ex.fields.map((f) => (
          <div key={f.name} className={f.marked ? 'dx-field dx-marked' : 'dx-field'}>
            <span className="dx-field-name">{f.name}</span>
            <span>{f.value}</span>
          </div>
        ))}
      </div>

      <footer className="sf-panel-foot">
        A marked field is a field the letter attacks: prove it conforms, or delete it. The
        bureau never grades its own record — the audit does.
      </footer>
    </section>
  )
}
