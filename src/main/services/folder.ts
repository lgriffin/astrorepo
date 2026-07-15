import { getSqlite } from '../db/connection'
import { ulid } from 'ulid'
import fs from 'fs'
import path from 'path'
import type { FolderTemplate } from '@shared/types'

export function generateFolders(targetId: string, templateId?: string): { path: string; createdDirs: string[] } {
  const sqlite = getSqlite()

  const target = sqlite.prepare('SELECT id, canonical_name, folder_path FROM targets WHERE id = ?').get(targetId) as { id: string; canonical_name: string; folder_path: string | null } | undefined
  if (!target) throw new Error('Target not found')

  const tplId = templateId ?? getDefaultTemplateId(sqlite)
  const template = sqlite.prepare('SELECT structure FROM folder_templates WHERE id = ?').get(tplId) as { structure: string } | undefined
  if (!template) throw new Error('Template not found')

  const structure = JSON.parse(template.structure) as Record<string, unknown>
  const baseSetting = sqlite.prepare("SELECT value FROM app_settings WHERE key = 'base_folder_path'").get() as { value: string } | undefined
  const basePath = baseSetting?.value ?? path.join(process.env.HOME || process.env.USERPROFILE || '.', 'AstroRepo')

  const safeName = sanitizeName(target.canonical_name)
  const targetDir = path.join(basePath, safeName)
  const createdDirs: string[] = []

  createDirsRecursive(targetDir, structure, createdDirs)

  const now = new Date().toISOString()
  sqlite.prepare('UPDATE targets SET folder_path = ?, updated_at = ? WHERE id = ?').run(targetDir, now, targetId)

  return { path: targetDir, createdDirs }
}

export function listTemplates(): FolderTemplate[] {
  const sqlite = getSqlite()
  const rows = sqlite
    .prepare('SELECT id, name, structure, is_builtin, created_at FROM folder_templates ORDER BY name')
    .all() as Array<Record<string, unknown>>

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    structure: JSON.parse(r.structure as string),
    isBuiltin: (r.is_builtin as number) === 1,
    createdAt: r.created_at as string
  }))
}

export function createTemplate(name: string, structure: Record<string, unknown>): FolderTemplate {
  const sqlite = getSqlite()
  const id = ulid()
  const now = new Date().toISOString()

  sqlite
    .prepare('INSERT INTO folder_templates (id, name, structure, is_builtin, created_at) VALUES (?, ?, ?, 0, ?)')
    .run(id, name, JSON.stringify(structure), now)

  return { id, name, structure, isBuiltin: false, createdAt: now }
}

function createDirsRecursive(basePath: string, structure: Record<string, unknown>, created: string[]): void {
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath, { recursive: true })
    created.push(basePath)
  }

  for (const [dir, sub] of Object.entries(structure)) {
    const dirPath = path.join(basePath, dir)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
      created.push(dirPath)
    }
    if (sub && typeof sub === 'object' && Object.keys(sub).length > 0) {
      createDirsRecursive(dirPath, sub as Record<string, unknown>, created)
    }
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/__+/g, '_')
}

function getDefaultTemplateId(sqlite: ReturnType<typeof getSqlite>): string {
  const row = sqlite.prepare("SELECT id FROM folder_templates WHERE is_builtin = 1 LIMIT 1").get() as { id: string } | undefined
  if (!row) throw new Error('No default folder template found')
  return row.id
}
