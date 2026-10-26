import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import type { TargetSummary, WorkflowStage } from '@shared/types'
import { AtlasKind } from '../atlas/AtlasSymbol'

/** A stage's name as a sentence: not_observed reads "Not observed". */
const stageWords = (stage: string): string => {
  const words = stage.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

interface TargetCardProps {
  target: TargetSummary
  stages: WorkflowStage[]
}

export function TargetCard({ target, stages }: TargetCardProps): React.ReactElement {
  const [thumbnail, setThumbnail] = useState<{ data: string; mime: string } | null>(null)

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
          <AtlasKind objectType={target.objectType} className="shrink-0 ml-2 mt-0.5" />
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
          <span className="text-[10px] text-astro-muted whitespace-nowrap ml-1">
            {stageWords(target.workflowStage)}
          </span>
        </div>
      </div>
    </Link>
  )
}
