/** Small conversions between the way Leigh writes amounts and the numbers the use cases use. */

/** "2 h 12 m", "45 m" or "3 h". */
export function hoursMinutes(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m} m`
  return m === 0 ? `${h} h` : `${h} h ${m} m`
}

const GIB = 1024 ** 3

/** Bytes from a size such as "30 GB" (binary gigabytes, as the job runner counts them) or "500 MB". */
export function bytes(text: string): number {
  const m = /^([\d.]+)\s*(GB|MB|KB|B)$/.exec(text.trim())
  if (!m) throw new Error(`Cannot read "${text}" as a size, such as "30 GB"`)
  const unit = { GB: GIB, MB: 1024 ** 2, KB: 1024, B: 1 }[m[2] as 'GB' | 'MB' | 'KB' | 'B']
  return Math.round(Number(m[1]) * unit)
}

/** A catalogue name as Leigh writes it: "M 81", "NGC 7000", "IC 1396", "Sh2-155". */
export const targetName = { name: 'target', regexp: /(?:M|NGC|IC|Sh2-) ?\d+/, transform: (s: string) => s }
