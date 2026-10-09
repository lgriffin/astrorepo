import { describe, expect, it } from 'vitest'
import { interpretExit, type ExitCodeTable, type RunTool } from '@astro/domain'

/**
 * Every tool's exit-code table must pass this suite (HUB-012): 0 succeeds, a cancel is a cancel
 * whatever the code, no code fails, every listed failure has a plain message, and a code the
 * table does not know fails with a message naming it.
 */
export function exitCodeContract(tool: RunTool, table: ExitCodeTable): void {
  describe(`Exit-code contract: ${table.label}`, () => {
    it('[HUB-012] Given exit code 0, When read, Then the run succeeded with nothing to say', () => {
      expect(interpretExit(tool, 0, { cancelled: false })).toEqual({ outcome: 'succeeded', message: '', retryable: false })
    })

    it('[HUB-012] Given a run the user cancelled, When read with any code, Then it was cancelled, and running it again could help', () => {
      for (const code of [null, 0, 1, 130]) expect(interpretExit(tool, code, { cancelled: true })).toMatchObject({ outcome: 'cancelled', retryable: true })
    })

    it('[HUB-012] Given no exit code and no cancel, When read, Then it failed and the message names the program', () => {
      const verdict = interpretExit(tool, null, { cancelled: false, program: 'the-tool' })
      expect(verdict.outcome).toBe('failed')
      expect(verdict.message).toMatch(/^the-tool /)
    })

    it('[HUB-012] Given every code the table lists, When read, Then each non-zero code is not a success and its message is a plain sentence', () => {
      for (const [raw, entry] of Object.entries(table.codes)) {
        const code = Number(raw)
        const verdict = interpretExit(tool, code, { cancelled: false })
        expect(verdict.outcome).toBe(entry.outcome)
        expect(verdict.retryable).toBe(entry.retryable)
        if (code === 0) continue
        expect(verdict.outcome).not.toBe('succeeded')
        expect(verdict.message).toMatch(/^[A-Z].*\.$/)
        expect(verdict.message).not.toMatch(/\u2014/)
      }
    })

    it('[HUB-012] Given a code the table does not list, When read, Then it failed with a message naming the code', () => {
      const verdict = interpretExit(tool, 77, { cancelled: false })
      expect(verdict).toEqual({ outcome: 'failed', message: `${table.label} exited with code 77.`, retryable: true })
    })
  })
}
