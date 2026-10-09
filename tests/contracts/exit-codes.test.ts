import { EXIT_CODES, type RunTool } from '@astro/domain'
import { exitCodeContract } from '@astro/testkit/contracts/exit-codes.contract'

// One contract for every tool the job runner starts (HUB-012).
for (const [tool, table] of Object.entries(EXIT_CODES) as [RunTool, (typeof EXIT_CODES)[RunTool]][]) exitCodeContract(tool, table)
