const ASTRO_NAME_PATTERNS = [
  /^M\s*\d+/i,
  /^NGC\s*\d+/i,
  /^IC\s*\d+/i,
  /^Sh2[\s-]*\d+/i,
  /^Abell\s*\d+/i,
  /^PGC\s*\d+/i,
  /^UGC\s*\d+/i,
  /^Ced\s*\d+/i,
  /^vdB\s*\d+/i,
  /^LDN\s*\d+/i,
  /^LBN\s*\d+/i,
  /^B\s*\d+$/i,
  /^Cr\s*\d+/i,
  /^Mel\s*\d+/i,
  /^Pal\s*\d+/i,
  /^Stock\s*\d+/i,
  /^Tr\s*\d+/i,
  /^Mrk\s*\d+/i,
  /^HCG\s*\d+/i,
  /^Arp\s*\d+/i,
  /^C\s*\d+$/i,
]

export function isAstronomicalName(name: string): boolean {
  const trimmed = name.trim()
  return ASTRO_NAME_PATTERNS.some(p => p.test(trimmed))
}
