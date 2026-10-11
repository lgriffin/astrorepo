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
export declare function summarise(report: { files?: Record<string, { mutants: MutantLike[] }> }, top?: number): string
