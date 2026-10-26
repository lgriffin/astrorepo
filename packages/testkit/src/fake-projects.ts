import type { NewProject, ProjectRecord, ProjectSource, ProjectSources, ProjectStore } from '@astro/application'

const copy = <T>(value: T): T => structuredClone(value)

/** Astronomy projects in memory, ids p1, p2, ... in the order they are made. */
export class InMemoryProjectStore implements ProjectStore {
  readonly projects = new Map<string, ProjectRecord>()
  private next = 1

  async list(): Promise<ProjectRecord[]> {
    return [...this.projects.values()].map(copy).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
  }

  async get(id: string): Promise<ProjectRecord | null> {
    const p = this.projects.get(id)
    return p ? copy(p) : null
  }

  async create(project: NewProject): Promise<ProjectRecord> {
    const id = `p${this.next++}`
    const record: ProjectRecord = { ...copy(project), id, status: 'active', targetIds: [...new Set(project.targetIds)], updatedAt: project.createdAt }
    this.projects.set(id, record)
    return copy(record)
  }

  async update(id: string, change: Partial<Pick<ProjectRecord, 'name' | 'status' | 'rule' | 'window'>>, at: Date): Promise<void> {
    const p = this.projects.get(id)
    if (!p) return
    Object.assign(p, copy(change), { updatedAt: at })
  }

  async addTargets(id: string, targetIds: string[], at: Date): Promise<void> {
    const p = this.projects.get(id)
    if (!p) return
    p.targetIds = [...new Set([...p.targetIds, ...targetIds])]
    p.updatedAt = at
  }

  async removeTarget(id: string, targetId: string, at: Date): Promise<void> {
    const p = this.projects.get(id)
    if (!p) return
    p.targetIds = p.targetIds.filter(t => t !== targetId)
    p.updatedAt = at
  }
}

export interface FakeSource extends ProjectSource {
  targetIds: string[]
}

/** Catalogues, collections and target names in memory; sizes follow the targets given. */
export class InMemoryProjectSources implements ProjectSources {
  constructor(
    readonly names: Map<string, string> = new Map(),
    readonly catalogueList: Omit<FakeSource, 'size'>[] = [],
    readonly collectionList: Omit<FakeSource, 'size'>[] = []
  ) {}

  private static listed(list: Omit<FakeSource, 'size'>[]): ProjectSource[] {
    return list.map(s => ({ id: s.id, name: s.name, size: s.targetIds.length })).sort((a, b) => a.name.localeCompare(b.name))
  }

  async catalogues(): Promise<ProjectSource[]> {
    return InMemoryProjectSources.listed(this.catalogueList)
  }

  async catalogueTargets(catalogueId: string): Promise<string[]> {
    return [...(this.catalogueList.find(c => c.id === catalogueId)?.targetIds ?? [])]
  }

  async collections(): Promise<ProjectSource[]> {
    return InMemoryProjectSources.listed(this.collectionList)
  }

  async collectionTargets(collectionId: string): Promise<string[]> {
    return [...(this.collectionList.find(c => c.id === collectionId)?.targetIds ?? [])]
  }

  async targetNames(targetIds: string[]): Promise<Map<string, string>> {
    return new Map(targetIds.filter(id => this.names.has(id)).map(id => [id, this.names.get(id) as string]))
  }
}
