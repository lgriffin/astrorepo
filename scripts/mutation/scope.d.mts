export declare const CORE_ROOTS: string[]
export declare const RUNTIME_PORTS: string[]
export declare const DEFAULT_BREAK: number
export declare function toPosix(file: string): string
export declare function isMutable(file: string): boolean
export declare function listMutable(root?: string): string[]
export declare function changedTargets(changed: string[], exists?: (file: string) => boolean): string[]
export declare function breakThreshold(env?: Record<string, string | undefined>): number
export declare const SKIPPED_NOTE: string
export declare const GATE_FILES: string[]
export declare const GATE_DIRS: string[]
export declare const SMOKE_TARGET: string
export declare function sourcesForTest(file: string): string[]
