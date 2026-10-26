import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import type { TargetSummary, WorkflowStage } from '@shared/types'

interface TargetCardProps {
  target: TargetSummary
  stages: WorkflowStage[]
}

const typeColors: Record<string, string> = {
  galaxy: 'bg-astro-cat-1/20 text-astro-cat-1',
  emission_nebula: 'bg-astro-danger/20 text-astro-danger',
  reflection_nebula: 'bg-astro-cat-2/20 text-astro-cat-2',
  planetary_nebula: 'bg-astro-cat-3/20 text-astro-cat-3',
  dark_nebula: 'bg-astro-muted/20 text-astro-muted',
  open_cluster: 'bg-astro-warning/20 text-astro-warning',
  globular_cluster: 'bg-astro-cat-4/20 text-astro-cat-4',
  supernova_remnant: 'bg-astro-cat-5/20 text-astro-cat-5',
  galaxy_cluster: 'bg-astro-cat-6/20 text-astro-cat-6',
  star: 'bg-astro-warning/20 text-astro-warning',
  custom: 'bg-astro-accent/20 text-astro-accent'
}

const typeLabels: Record<string, string> = {
  galaxy: 'Galaxy',
  emission_nebula: 'Emission Nebula',
  reflection_nebula: 'Reflection Nebula',
  planetary_nebula: 'Planetary Nebula',
  dark_nebula: 'Dark Nebula',
  open_cluster: 'Open Cluster',
  globular_cluster: 'Globular Cluster',
  star_cluster: 'Star Cluster',
  supernova_remnant: 'Supernova Remnant',
  molecular_cloud: 'Molecular Cloud',
  galaxy_cluster: 'Galaxy Cluster',
  star: 'Star',
  comet: 'Comet',
  asteroid: 'Asteroid',
  planet: 'Planet',
  moon: 'Moon',
  solar_object: 'Solar Object',
  variable_star: 'Variable Star',
  widefield_region: 'Widefield',
  constellation: 'Constellation',
  custom: 'Custom',
  unknown: 'Unknown'
}

export function TargetCard({ target, stages }: TargetCardProps): React.ReactElement {
  const [thumbnail, setThumbnail] = useState<{ data: string; mime: string } | null>(null)
  const colorClass = typeColors[target.objectType] ?? 'bg-astro-border text-astro-muted'
  const typeLabel = typeLabels[target.objectType] ?? target.objectType

  useEffect(() => {
    invoke<{ data: string | null; mime?: string }>('targets:get-thumbnail', { id: target.id })
      .then(r => {
        if (r.data) setThumbnail({ data: r.data, mime: r.mime ?? 'image/jpeg' })
      })
      .catch(() => {})
  }, [target.id])

  const currentIdx = stages.findIndex((s) => s.name === target.workflowStage)

  return (
    <Link
      to={`/targets/${target.id}`}
      className="block bg-astro-surface border border-astro-border rounded-lg overflow-hidden
                 hover:border-astro-accent/50 transition-colors"
    >
      {thumbnail && (
        <div className="h-32 overflow-hidden bg-astro-bg">
          <img
            src={`data:${thumbnail.mime};base64,${thumbnail.data}`}
            alt={target.canonicalName}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-astro-text truncate">{target.canonicalName}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${colorClass}`}>
            {typeLabel}
          </span>
        </div>
        {target.aliases.length > 0 && (
          <p className="text-xs text-astro-muted mb-2 truncate">
            {target.aliases.slice(0, 3).join(' / ')}
            {target.aliases.length > 3 && ` +${target.aliases.length - 3} more`}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-astro-muted mb-2">
          {target.constellation && <span>{target.constellation}</span>}
          {target.magnitude !== null && <span>mag {target.magnitude.toFixed(1)}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-px flex-1">
            {stages.map((stage, i) => (
              <div
                key={stage.id}
                className={`h-1.5 flex-1 first:rounded-l-full last:rounded-r-full ${
                  i <= currentIdx ? 'bg-astro-accent' : 'bg-astro-border'
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] text-astro-muted whitespace-nowrap capitalize ml-1">
            {target.workflowStage.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
    </Link>
  )
}
