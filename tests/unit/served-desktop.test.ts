import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ServedDesktop } from '../../src/main/http/served-desktop'
import { OpenInBrowser } from '../../src/main/http/http-host'

const dirs: string[] = []
const exportsDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'served-desktop-'))
  dirs.push(d)
  return path.join(d, 'exports')
}
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

describe('The Desktop port when served to a browser (specs/035-pi-variant)', () => {
  it('[PI-012] Given an export, When it is saved twice, Then both land in the exports folder and the first is not overwritten', async () => {
    const dir = exportsDir()
    const desktop = new ServedDesktop(dir)
    await expect(desktop.saveText('targets.csv', 'one')).resolves.toEqual({ saved: true, path: path.join(dir, 'targets.csv') })
    await expect(desktop.saveText('targets.csv', 'two')).resolves.toEqual({ saved: true, path: path.join(dir, 'targets-2.csv') })
    expect(fs.readFileSync(path.join(dir, 'targets.csv'), 'utf-8')).toBe('one')
    expect(fs.readFileSync(path.join(dir, 'targets-2.csv'), 'utf-8')).toBe('two')
  })

  it('[PI-012] Given an export name with folders in it, When it is saved, Then only its file name is used, inside the exports folder', async () => {
    const dir = exportsDir()
    const result = await new ServedDesktop(dir).saveText('../../escape.csv', 'x')
    expect(result).toEqual({ saved: true, path: path.join(dir, 'escape.csv') })
  })

  it('[PI-012] Given a picker, When the server is asked, Then it answers as a cancel, since the browser asks instead', async () => {
    const desktop = new ServedDesktop(exportsDir())
    await expect(desktop.pickFolder()).resolves.toBeNull()
    await expect(desktop.pickFile()).resolves.toBeNull()
  })

  it('[PI-012] Given a folder or a link to open, When asked, Then the folder cannot open here and says where it is, and the link is handed to the browser', async () => {
    const desktop = new ServedDesktop(exportsDir())
    await expect(desktop.openFolder('/data/M31')).resolves.toBe('Folders open only on the computer astrorepo runs on. The folder is /data/M31')
    const opening = desktop.openExternal('https://simbad.cds.unistra.fr/')
    await expect(opening).rejects.toBeInstanceOf(OpenInBrowser)
    await expect(opening).rejects.toMatchObject({ url: 'https://simbad.cds.unistra.fr/' })
  })
})
