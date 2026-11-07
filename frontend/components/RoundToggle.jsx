import React, { useState } from 'react'

/**
 * RoundToggle — the round control. One switch per escalation round.
 * The switch state IS the round's `enabled` flag in
 * rounds/rounds.json: the Julia engine fires the rounds whose toggle
 * is on, and a held round seals no letters. Flipping a toggle here
 * and in the JSON are the same act.
 */
export function RoundToggle({ round, onChange }) {
  const [on, setOn] = useState(round.enabled)
  const flip = () => {
    const next = !on
    setOn(next)
    if (onChange) onChange(round.id, next)
  }
  return (
    <div className="sf-toggle-row" data-round-id={round.id}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={on ? 'sf-toggle sf-toggle-on' : 'sf-toggle sf-toggle-off'}
        onClick={flip}
      >
        <span className="sf-toggle-knob" />
      </button>
      <div className="sf-toggle-text">
        <div className="sf-toggle-title">
          {round.order}. {round.name}{' '}
          <span className="sf-toggle-kind">
            {round.scope} · {round.granularity}
          </span>
        </div>
        <div className="sf-toggle-desc">{round.description}</div>
      </div>
      <div className="sf-toggle-state">{on ? 'ARMED' : 'HELD OUT'}</div>
    </div>
  )
}
