/**
 * Starts the headless server (`src/server/main.ts`) on a free port with a given data folder, for
 * the scripts that drive the app from outside: the smoke run and the demo library.
 */
import { spawn, type ChildProcess } from 'child_process'
import net from 'net'
import path from 'path'

export const root = path.resolve(__dirname, '..', '..')

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

/** Starts the server and resolves once it is listening; a server that does not start is stopped. */
export function serve(port: number, data: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/server/main.ts'], {
      cwd: root,
      env: { ...process.env, ASTRO_DATA: data, ASTRO_PORT: String(port), ASTRO_BIND: '127.0.0.1' }
    })
    let log = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`The server did not start:\n${log}`))
    }, 60_000)
    const listen = (d: Buffer) => {
      log += d
      if (log.includes('astrorepo is serving')) {
        clearTimeout(timer)
        resolve(child)
      }
    }
    child.stdout?.on('data', listen)
    child.stderr?.on('data', d => { log += d })
    child.on('exit', code => reject(new Error(`The server stopped (${code}):\n${log}`)))
  })
}

/** Calls the served app's channels from Node, with the token the server wrote into its page. */
export async function servedInvoker(base: string): Promise<<T>(channel: string, args?: unknown) => Promise<T>> {
  const page = await (await fetch(`${base}/`)).text()
  const token = /<meta name="astrorepo-token" content="([^"]*)"/.exec(page)?.[1] ?? ''
  return async <T>(channel: string, args?: unknown): Promise<T> => {
    const r = await fetch(`${base}/api/invoke/${channel}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Astrorepo-Token': token },
      body: JSON.stringify({ args: args === undefined ? [] : [args] })
    })
    const body = (await r.json().catch(() => null)) as { value?: unknown; error?: string } | null
    if (!r.ok) throw new Error(`${channel}: ${body?.error ?? `HTTP ${r.status}`}`)
    return (body?.value ?? null) as T
  }
}
