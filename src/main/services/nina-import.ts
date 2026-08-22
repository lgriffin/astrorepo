import fs from 'fs'
import { createTarget } from './target'
import type { Target } from '@shared/types'

interface NinaTarget {
  name: string
  ra: number | null
  dec: number | null
}

function parseNinaXml(xml: string): NinaTarget[] {
  const targets: NinaTarget[] = []

  const targetBlocks = xml.match(/<DeepSkyObjectContainer[^>]*>[\s\S]*?<\/DeepSkyObjectContainer>/g) ?? []

  for (const block of targetBlocks) {
    const nameMatch = block.match(/<TargetName[^>]*>([^<]+)<\/TargetName>/i)
      ?? block.match(/<Name[^>]*>([^<]+)<\/Name>/i)
    if (!nameMatch) continue

    const raMatch = block.match(/<RAHours[^>]*>([\d.]+)<\/RAHours>/i)
      ?? block.match(/<RA[^>]*>([\d.]+)<\/RA>/i)
    const decMatch = block.match(/<DecDegrees[^>]*>([-\d.]+)<\/DecDegrees>/i)
      ?? block.match(/<Dec[^>]*>([-\d.]+)<\/Dec>/i)

    targets.push({
      name: nameMatch[1].trim(),
      ra: raMatch ? parseFloat(raMatch[1]) : null,
      dec: decMatch ? parseFloat(decMatch[1]) : null
    })
  }

  if (targets.length === 0) {
    const simpleBlocks = xml.match(/<Target[^>]*>[\s\S]*?<\/Target>/g) ?? []
    for (const block of simpleBlocks) {
      const nameMatch = block.match(/<Name[^>]*>([^<]+)<\/Name>/i)
      if (!nameMatch) continue
      const raMatch = block.match(/<RA[^>]*>([\d.]+)<\/RA>/i)
      const decMatch = block.match(/<Dec[^>]*>([-\d.]+)<\/Dec>/i)
      targets.push({
        name: nameMatch[1].trim(),
        ra: raMatch ? parseFloat(raMatch[1]) : null,
        dec: decMatch ? parseFloat(decMatch[1]) : null
      })
    }
  }

  return targets
}

export function importNinaSequence(filePath: string): { created: Target[]; skipped: string[] } {
  const xml = fs.readFileSync(filePath, 'utf-8')
  const ninaTargets = parseNinaXml(xml)

  const created: Target[] = []
  const skipped: string[] = []

  for (const nt of ninaTargets) {
    try {
      const target = createTarget({
        canonicalName: nt.name,
        objectType: 'unknown',
        raHours: nt.ra,
        decDegrees: nt.dec
      })
      created.push(target)
    } catch {
      skipped.push(nt.name)
    }
  }

  return { created, skipped }
}
