export interface MutantLike {
  status: string
}
export interface Score {
  detected: number
  survived: number
  valid: number
  score: number | null
}
export declare function score(mutants: MutantLike[]): Score
export interface Report {
  files?: Record<string, { mutants: MutantLike[] }>
}
export declare function filesBelow(report: Report, threshold: number): { file: string; score: number }[]
export declare function summarise(report: Report, top?: number, floor?: number | null): string
