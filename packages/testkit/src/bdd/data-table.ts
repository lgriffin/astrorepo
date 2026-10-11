/** A Gherkin data table, passed to a step definition as its last argument. */
export class DataTable {
  constructor(private readonly cells: readonly (readonly string[])[]) {}

  /** Every row, header included. */
  raw(): string[][] {
    return this.cells.map(r => [...r])
  }

  /** Every row after the header. */
  rows(): string[][] {
    return this.raw().slice(1)
  }

  /** One object per row after the header, keyed by the header cells. */
  hashes(): Record<string, string>[] {
    const [header, ...body] = this.raw()
    if (!header) return []
    return body.map(row => Object.fromEntries(header.map((key, i) => [key, row[i]])))
  }

  /** A two-column table read as key | value pairs. */
  rowsHash(): Record<string, string> {
    const raw = this.raw()
    if (raw.some(r => r.length !== 2)) throw new Error('rowsHash needs a table with exactly two columns')
    return Object.fromEntries(raw.map(([k, v]) => [k, v]))
  }
}
