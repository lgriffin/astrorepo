import React, { useState, useEffect } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { WorkflowStage } from '@shared/types'

interface WorkflowStepperProps {
  targetId: string
  currentStage: string
  onStageChanged: () => void
}

export function WorkflowStepper({ targetId, currentStage, onStageChanged }: WorkflowStepperProps): React.ReactElement {
  const [stages, setStages] = useState<WorkflowStage[]>([])
  const [advancing, setAdvancing] = useState(false)

  useEffect(() => {
    invoke<WorkflowStage[]>('workflow:stages').then(setStages)
  }, [])

  const currentIdx = stages.findIndex((s) => s.name === currentStage)

  const handleAdvance = async (toStage: string) => {
    setAdvancing(true)
    try {
      await invoke('targets:advance-stage', { id: targetId, to_stage: toStage })
      onStageChanged()
    } finally {
      setAdvancing(false)
    }
  }

  if (stages.length === 0) return <div className="text-sm text-astro-muted">Loading stages...</div>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {stages.map((stage, i) => {
          const isComplete = i < currentIdx
          const isCurrent = i === currentIdx
          return (
            <button
              key={stage.id}
              onClick={() => !isCurrent && handleAdvance(stage.name)}
              disabled={advancing || isCurrent}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                isCurrent
                  ? 'bg-astro-accent text-white border-astro-accent'
                  : isComplete
                    ? 'bg-astro-success/20 text-astro-success border-astro-success/30'
                    : 'bg-astro-bg text-astro-muted border-astro-border hover:border-astro-accent/50'
              }`}
            >
              {stage.name.replace(/_/g, ' ')}
            </button>
          )
        })}
      </div>
      {currentIdx < stages.length - 1 && (
        <button
          onClick={() => handleAdvance(stages[currentIdx + 1].name)}
          disabled={advancing}
          className="text-xs text-astro-accent hover:underline disabled:opacity-50"
        >
          Advance to {stages[currentIdx + 1].name.replace(/_/g, ' ')}
        </button>
      )}
    </div>
  )
}
