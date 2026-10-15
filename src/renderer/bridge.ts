/** How the renderer reaches the back end: Electron's preload in the desktop app, HTTP in a browser. */
export interface Bridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/** Channels that open a picker, which a browser answers with a typed path instead (PI-012). */
const PICKER = /:pick-(folder|file)$/

/**
 * The bridge over the headless server's API (specs/035-pi-variant, PI-010): each call is a POST to
 * /api/invoke/<channel> carrying the page's token, and an error answer rejects with its message.
 * Pickers ask for a path on the computer astrorepo runs on.
 */
export function httpBridge(fetchFn: Fetch, token: string, ask: (question: string) => string | null): Bridge {
  return {
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      if (PICKER.test(channel)) {
        const kind = channel.endsWith('folder') ? 'folder' : 'file'
        const typed = ask(`Type the full path of the ${kind} on the computer astrorepo runs on.`)
        return { path: typed && typed.trim() ? typed.trim() : null }
      }
      // JSON has no undefined: trailing ones are left off, as a call without them means the same.
      const sent = [...args]
      while (sent.length > 0 && sent[sent.length - 1] === undefined) sent.pop()
      const res = await fetchFn(`/api/invoke/${encodeURIComponent(channel)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Astrorepo-Token': token },
        body: JSON.stringify({ args: sent })
      })
      const body = (await res.json().catch(() => null)) as { value?: unknown; error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? `astrorepo did not answer (HTTP ${res.status}).`)
      return body?.value ?? null
    }
  }
}

/** Gives the page a bridge when Electron's preload has not, from the token the server wrote into it. */
export function installBridge(win: Window & { api?: Bridge }, doc: Document): void {
  if (win.api) return
  const token = doc.querySelector('meta[name="astrorepo-token"]')?.getAttribute('content') ?? ''
  win.api = httpBridge((url, init) => win.fetch(url, init), token, question => win.prompt(question))
}
