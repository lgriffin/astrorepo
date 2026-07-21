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

const ASTRO_EXTRACT_PATTERNS = [
  /\bM\s*\d+/i,
  /\bNGC\s*\d+/i,
  /\bIC\s*\d+/i,
  /\bSh2[\s-]*\d+/i,
  /\bAbell\s*\d+/i,
  /\bPGC\s*\d+/i,
  /\bUGC\s*\d+/i,
  /\bCed\s*\d+/i,
  /\bvdB\s*\d+/i,
  /\bLDN\s*\d+/i,
  /\bLBN\s*\d+/i,
  /\bB\s*\d+\b/i,
  /\bCr\s*\d+/i,
  /\bMel\s*\d+/i,
  /\bPal\s*\d+/i,
  /\bStock\s*\d+/i,
  /\bTr\s*\d+/i,
  /\bMrk\s*\d+/i,
  /\bHCG\s*\d+/i,
  /\bArp\s*\d+/i,
  /\bC\s*\d+\b/i,
]

export function extractAstronomicalName(text: string): string | null {
  const normalized = text.trim().replace(/_/g, ' ')
  for (const pattern of ASTRO_EXTRACT_PATTERNS) {
    const match = normalized.match(pattern)
    if (match) return match[0]
  }
  return null
}
