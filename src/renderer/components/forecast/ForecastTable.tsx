import React from 'react'
import { Badge, Table, Td, Th, Tr } from '../ui'
import type { ForecastKindView, IntegrationFilterView } from '@shared/types'

const KIND_TONE = { measured: 'success', theoretical: 'info', 'insufficient data': 'neutral' } as const
const KIND_LABEL: Record<ForecastKindView, string> = { measured: 'Measured', theoretical: 'Theoretical', 'insufficient data': 'Not enough data' }

export function ForecastKind({ kind }: { kind: ForecastKindView }): React.ReactElement {
  return <Badge tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Badge>
}

/** Acquired and accepted light per filter, the goal, and what each extra stretch of capture buys. */
export function ForecastTable({ rows, label = 'Filter' }: { rows: IntegrationFilterView[]; label?: string }): React.ReactElement {
  const added = rows[0]?.forecasts.map(f => f.added) ?? []
  return (
    <Table className="text-xs">
      <thead>
        <tr>
          <Th>{label}</Th>
          <Th>Frames</Th>
          <Th>Acquired</Th>
          <Th>Accepted</Th>
          <Th>Goal</Th>
          {added.map(a => (
            <Th key={a}>+{a}</Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <Tr key={r.filter}>
            <Td>{r.filter}</Td>
            <Td className="text-astro-muted">
              {r.frames}
              {r.rejection ? ` (${r.rejection})` : ''}
            </Td>
            <Td>{r.acquired}</Td>
            <Td>{r.accepted}</Td>
            <Td className="text-astro-muted">
              {r.goal ?? 'None set'}
              {r.toGoal && <span className={`block ${r.toGoal === 'Goal met' ? 'text-astro-success' : ''}`}>{r.toGoal}</span>}
            </Td>
            {r.forecasts.map(f => (
              <Td key={f.added} title={f.evidence}>
                {f.gain ?? '–'}
                {f.range && <span className="block text-astro-muted">{f.range}</span>}
              </Td>
            ))}
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}
