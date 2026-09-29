export function normalizeImageType(raw: string | null): 'light' | 'dark' | 'flat' | 'bias' | 'unknown' {
  if (!raw) return 'unknown'
  const lower = raw.toLowerCase().trim()
  if (lower.includes('light')) return 'light'
  if (lower.includes('dark')) return 'dark'
  if (lower.includes('flat')) return 'flat'
  if (lower.includes('bias') || lower.includes('offset')) return 'bias'
  return 'unknown'
}
