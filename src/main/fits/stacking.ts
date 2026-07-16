import type { FitsHeaderRecord } from './parser'

export interface StackingInfo {
  isStacked: boolean
  ncombine: number | null
  totalExposure: number | null
  calstat: string | null
  evidence: string[]
}

export function detectStacking(headerMap: Map<string, FitsHeaderRecord>): StackingInfo {
  const evidence: string[] = []
  let ncombine: number | null = null
  let totalExposure: number | null = null
  let calstat: string | null = null

  const ncombineVal = headerMap.get('NCOMBINE')?.value
  if (typeof ncombineVal === 'number' && ncombineVal > 1) {
    ncombine = ncombineVal
    evidence.push(`NCOMBINE=${ncombineVal}`)
  }

  const stackcntVal = headerMap.get('STACKCNT')?.value
  if (typeof stackcntVal === 'number' && stackcntVal > 1) {
    ncombine = ncombine ?? stackcntVal
    evidence.push(`STACKCNT=${stackcntVal}`)
  }

  const nstackVal = headerMap.get('NSTACK')?.value
  if (typeof nstackVal === 'number' && nstackVal > 1) {
    ncombine = ncombine ?? nstackVal
    evidence.push(`NSTACK=${nstackVal}`)
  }

  const imageType = headerMap.get('IMAGETYP')?.value
  if (typeof imageType === 'string') {
    const lower = imageType.toLowerCase()
    if (lower.includes('master') || lower.includes('stacked') || lower.includes('integrated')) {
      evidence.push(`IMAGETYP='${imageType}'`)
    }
  }

  const calstatVal = headerMap.get('CALSTAT')?.value
  if (typeof calstatVal === 'string' && calstatVal.length > 0) {
    calstat = calstatVal
    evidence.push(`CALSTAT='${calstatVal}'`)
  }

  const totalExpVal = headerMap.get('TOTALEXP')?.value ?? headerMap.get('LIVETIME')?.value
  const exptime = headerMap.get('EXPTIME')?.value ?? headerMap.get('EXPOSURE')?.value
  if (typeof totalExpVal === 'number') {
    totalExposure = totalExpVal
    if (typeof exptime === 'number' && totalExpVal !== exptime && totalExpVal > exptime) {
      evidence.push(`TOTALEXP=${totalExpVal} != EXPTIME=${exptime}`)
    }
  }

  return {
    isStacked: evidence.length > 0,
    ncombine,
    totalExposure,
    calstat,
    evidence
  }
}
