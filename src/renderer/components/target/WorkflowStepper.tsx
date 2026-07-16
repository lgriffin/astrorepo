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
      <div className="flex items-center gap-0">
        {stages.map((stage, i) => {
          const isComplete = i < currentIdx
          const isCurrent = i === currentIdx
          const isLast = i === stages.length - 1

          return (
            <div key={stage.id} className="flex items-center">
              <button
                onClick={() => !isCurrent && handleAdvance(stage.name)}
                disabled={advancing || isCurrent}
                className="flex flex-col items-center group relative"
                title={stage.name.replace(/_/g, ' ')}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                  isCurrent
                    ? 'bg-astro-accent border-astro-accent text-white shadow-lg shadow-astro-accent/30'
                    : isComplete
                      ? 'bg-astro-success border-astro-success text-white'
                      : 'bg-astro-bg border-astro-border text-astro-muted group-hover:border-astro-accent/50'
                }`}>
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <span className={`text-[10px] mt-1 whitespace-nowrap max-w-[60px] truncate ${
                  isCurrent ? 'text-astro-accent font-semibold' : isComplete ? 'text-astro-success' : 'text-astro-muted'
                }`}>
                  {stage.name.replace(/_/g, ' ')}
                </span>
              </button>
              {!isLast && (
                <div className={`w-6 h-0.5 -mt-4 mx-0.5 ${
                  i < currentIdx ? 'bg-astro-success' : 'bg-astro-border'
                }`} />
              )}
            </div>
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

interface MiniWorkflowProps {
  currentStage: string
  stages: WorkflowStage[]
}

export function MiniWorkflow({ currentStage, stages }: MiniWorkflowProps): React.ReactElement {
  const currentIdx = stages.findIndex((s) => s.name === currentStage)
  const progress = stages.length > 0 ? ((currentIdx + 1) / stages.length) * 100 : 0

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-astro-border rounded-full overflow-hidden">
        <div
          className="h-full bg-astro-accent rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[10px] text-astro-muted whitespace-nowrap">
        {currentStage.replace(/_/g, ' ')}
      </span>
    </div>
  )
}
