import { describe, it, expect } from 'vitest'
import { EXIT_CODES, interpretExit, runToolOf } from '@astro/domain'

describe('Exit codes', () => {
  it('[HUB-013] Given SyQon exits with code 4, When read, Then the account lacks the model and queueing it again will not help', () => {
    expect(interpretExit('syqon', 4, { cancelled: false })).toEqual({
      outcome: 'failed',
      message: 'Your SyQon account does not include this model. Pick a model Settings, under Tools, lists as available, or check your SyQon plan.',
      retryable: false
    })
  })

  it('[HUB-012] Given SyQon exits with 130, a code its pages do not explain, or one outside its range, When read, Then each has an outcome and a plain message', () => {
    expect(interpretExit('syqon', 130, { cancelled: false })).toMatchObject({ outcome: 'cancelled', retryable: true })
    expect(interpretExit('syqon', 0, { cancelled: false })).toEqual({ outcome: 'succeeded', message: '', retryable: false })
    expect(interpretExit('syqon', 3, { cancelled: false })).toEqual({ outcome: 'failed', message: 'SyQon CLI stopped with exit code 3. Its last lines in the log say why.', retryable: true })
    expect(interpretExit('syqon', 3, { cancelled: false, program: 'syqon-cli' }).message).toBe('syqon-cli stopped with exit code 3. Its last lines in the log say why.')
    expect(interpretExit('syqon', 9, { cancelled: false }).message).toBe('SyQon CLI exited with code 9.')
    for (const code of [1, 2, 3, 5, 6, 7]) expect(EXIT_CODES.syqon.codes[code].assumed).toBe(true)
  })

  it('[HUB-012] Given Siril, When it exits, Then 0 succeeds, another code fails naming the program, and no code means it stopped', () => {
    expect(interpretExit('siril', 0, { cancelled: false, program: 'siril-cli' }).outcome).toBe('succeeded')
    expect(interpretExit('siril', 3, { cancelled: false, program: 'siril-cli' })).toEqual({ outcome: 'failed', message: 'siril-cli exited with code 3.', retryable: true })
    expect(interpretExit('siril', null, { cancelled: false })).toEqual({ outcome: 'failed', message: 'Siril stopped before it finished, with no exit code.', retryable: true })
    expect(interpretExit('siril', 1, { cancelled: true })).toEqual({ outcome: 'cancelled', message: 'Cancelled while it ran.', retryable: true })
  })

  it('[HUB-012] Given each kind of job, When its tool is picked, Then a stack reads Siril, post-processing Siril_Scripts, a SyQon step SyQon and a plate solve its solver', () => {
    expect(runToolOf('stack')).toBe('siril')
    expect(runToolOf('post-process')).toBe('siril-scripts')
    expect(runToolOf('syqon')).toBe('syqon')
    expect(runToolOf('solve', 'astap')).toBe('astap')
    expect(runToolOf('solve', 'siril')).toBe('siril')
    expect(runToolOf('solve')).toBe('astap')
  })
})
