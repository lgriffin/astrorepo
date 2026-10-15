/** How the renderer reaches the back end: Electron's preload in the desktop app, HTTP in a browser. */
export interface Bridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/** What the bridge asks of the browser window: a typed answer, a message, a new tab. */
export interface BrowserSide {
  ask: (question: string) => string | null
  tell: (message: string) => void
  open: (url: string) => void
}

/** Channels that open a picker, which a browser answers with a typed path instead (PI-012). */
const PICKER = /:pick-(folder|file)$/

/** Exports whose pages do not say where the file went; in a browser the bridge does (PI-012). */
const SILENT_EXPORT = /^export:/

const webPage = (url: unknown): url is string => typeof url === 'string' && /^https?:\/\//i.test(url)

/**
 * The bridge over the headless server's API (specs/035-pi-variant, PI-010): each call is a POST to
 * /api/invoke/<channel> carrying the page's token, and an error answer rejects with its message.
 * What the server cannot do for a browser, the bridge does (PI-012): pickers ask for a path on the
 * computer astrorepo runs on, web pages open in a new tab, and a folder that cannot open or an
 * export saved on the server is told.
 */
export function httpBridge(fetchFn: Fetch, token: string, browser: BrowserSide): Bridge {
  return postingBridge(fetchFn, { 'X-Astrorepo-Token': token }, browser, () => undefined)
}

/** The header a paired companion screen sends its key in (PI-020). */
export const DEVICE_HEADER = 'X-Astrorepo-Device'

/**
 * The bridge of a companion screen served by the desktop app (PI-020): each call carries the
 * screen's key, and when the PC no longer knows the key, `unpaired` runs so the screen pairs again.
 */
export function companionBridge(fetchFn: Fetch, key: string, browser: BrowserSide, unpaired: () => void): Bridge {
  return postingBridge(fetchFn, { [DEVICE_HEADER]: key }, browser, unpaired)
}

function postingBridge(fetchFn: Fetch, credentials: Record<string, string>, browser: BrowserSide, unpaired: () => void): Bridge {
  return {
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      if (PICKER.test(channel)) {
        const kind = channel.endsWith('folder') ? 'folder' : 'file'
        const typed = browser.ask(`Type the full path of the ${kind} on the computer astrorepo runs on.`)
        return { path: typed && typed.trim() ? typed.trim() : null }
      }
      // JSON has no undefined: trailing ones are left off, as a call without them means the same.
      const sent = [...args]
      while (sent.length > 0 && sent[sent.length - 1] === undefined) sent.pop()
      const res = await fetchFn(`/api/invoke/${encodeURIComponent(channel)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...credentials },
        body: JSON.stringify({ args: sent })
      })
      const body = (await res.json().catch(() => null)) as { value?: unknown; error?: string; openInBrowser?: unknown; pair?: unknown } | null
      if (res.status === 401 && body?.pair === true) unpaired()
      if (!res.ok) throw new Error(body?.error ?? `astrorepo did not answer (HTTP ${res.status}).`)
      if (webPage(body?.openInBrowser)) {
        browser.open(body.openInBrowser)
        return { opened: true }
      }
      const value = body?.value ?? null
      const shown = value as { success?: unknown; error?: unknown; saved?: unknown; path?: unknown } | null
      if (channel === 'home:open-folder' && shown?.success === false && typeof shown.error === 'string') browser.tell(shown.error)
      if (SILENT_EXPORT.test(channel) && shown?.saved === true && typeof shown.path === 'string') browser.tell(`Saved on the computer astrorepo runs on: ${shown.path}`)
      return value
    }
  }
}

/** Where the page runs: the desktop app, a browser on the headless server, or a companion screen of the desktop app. */
export type PageMode = 'desktop' | 'browser' | 'companion'

/** Where a companion screen keeps the key the PC gave it. */
export const COMPANION_KEY = 'astrorepo-companion-key'

export type BridgeWindow = Window & { api?: Bridge; astrorepoMode?: PageMode }

/** The companion key this browser holds, or '' (storage can be blocked). */
export function storedCompanionKey(win: Window): string {
  try {
    return win.localStorage.getItem(COMPANION_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Gives the page a bridge when Electron's preload has not: from the token the server wrote into
 * it, or, on a companion screen of the desktop app, from the key the PC gave this screen.
 */
export function installBridge(win: BridgeWindow, doc: Document): void {
  if (win.api) {
    win.astrorepoMode = 'desktop'
    return
  }
  const fetchFn: Fetch = (url, init) => win.fetch(url, init)
  const browser: BrowserSide = {
    ask: question => win.prompt(question),
    tell: message => win.alert(message),
    open: url => { win.open(url, '_blank', 'noopener,noreferrer') }
  }
  if (doc.querySelector('meta[name="astrorepo-companion"]')) {
    win.astrorepoMode = 'companion'
    win.api = companionBridge(fetchFn, storedCompanionKey(win), browser, () => {
      try {
        win.localStorage.removeItem(COMPANION_KEY)
      } catch {
        // Nothing kept, nothing to forget.
      }
      win.location.reload()
    })
    return
  }
  win.astrorepoMode = 'browser'
  const token = doc.querySelector('meta[name="astrorepo-token"]')?.getAttribute('content') ?? ''
  win.api = httpBridge(fetchFn, token, browser)
}
