/**
 * The parts of the FTP protocol (RFC 959, 2428 and 3659) a scope's file server needs, as pure
 * rules: reading replies off the control channel, the passive-mode answers, and the two listing
 * formats. The adapter owns the sockets; everything that reads text a server sent lives here, so
 * it is fuzzed like every other parser of untrusted input (spec 033, FUZ-001).
 */

/** One complete reply: its three-digit code and its text, lines joined with \n. */
export interface FtpReply {
  code: number
  text: string
}

/** The longest control-channel text kept while a reply is incomplete; more is a broken server. */
export const MAX_REPLY_CHARS = 64 * 1024

const REPLY_LINE = /^([1-5]\d\d)([ -])(.*)$/

/**
 * Splits text read from the control channel into the complete replies it holds and what is left
 * over (an unfinished reply, kept for the next read). A multi-line reply opens with `123-` and ends
 * at a line starting `123 `; lines before a reply's first line that are not replies are dropped.
 * Throws when an unfinished reply grows past MAX_REPLY_CHARS.
 */
export function readFtpReplies(buffer: string): { replies: FtpReply[]; rest: string } {
  const replies: FtpReply[] = []
  let start = 0
  let open: { code: string; lines: string[]; from: number } | null = null
  for (;;) {
    const nl = buffer.indexOf('\n', start)
    if (nl < 0) break
    const line = buffer.slice(start, nl).replace(/\r$/, '')
    const lineStart = start
    start = nl + 1
    if (open) {
      if (line.startsWith(`${open.code} `) || line === open.code) {
        open.lines.push(line.slice(4))
        replies.push({ code: Number(open.code), text: open.lines.join('\n') })
        open = null
      } else {
        // Many servers repeat the code with a dash on inner lines; that prefix is not text.
        open.lines.push(line.startsWith(`${open.code}-`) ? line.slice(4) : line)
      }
      continue
    }
    const m = REPLY_LINE.exec(line)
    if (!m) continue
    if (m[2] === ' ') replies.push({ code: Number(m[1]), text: m[3] })
    else open = { code: m[1], lines: [m[3]], from: lineStart }
  }
  const rest = open ? buffer.slice(open.from) : buffer.slice(start)
  if (rest.length > MAX_REPLY_CHARS) throw new Error('The scope sent a reply too long to be an FTP reply.')
  return { replies, rest }
}

/** The kind of reply a code is: 1 preliminary, 2 done, 3 more needed, 4 try again, 5 refused. */
export const replyClass = (code: number): number => Math.floor(code / 100)

/** The data port of an extended passive reply (229 `(|||port|)`), or null when it names none. */
export function parseExtendedPassive(text: string): number | null {
  const m = /\((.)\1\1(\d{1,5})\1\)/.exec(text)
  if (!m) return null
  const port = Number(m[2])
  return port >= 1 && port <= 65535 ? port : null
}

/**
 * The address and port of a passive reply (227 `(h1,h2,h3,h4,p1,p2)`), or null when it names none.
 * The adapter connects to the control channel's own host whatever address this names, since a
 * scope behind its own Wi-Fi may name an address the PC cannot reach (and a server should not be
 * able to send the PC elsewhere).
 */
export function parsePassive(text: string): { host: string; port: number } | null {
  const m = /(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/.exec(text)
  if (!m) return null
  const n = m.slice(1).map(Number)
  if (n.some(x => x > 255)) return null
  const port = n[4] * 256 + n[5]
  if (port < 1) return null
  return { host: n.slice(0, 4).join('.'), port }
}

export type RemoteKind = 'file' | 'dir'

/** One entry of a folder on the scope. */
export interface RemoteEntry {
  name: string
  kind: RemoteKind
  /** Null when the listing gives no size. */
  sizeBytes: number | null
}

/**
 * Whether a name from a listing is safe to ask the server for and to name a file after: not
 * empty, not `.` or `..`, and free of slashes and control characters (a CR or LF in a name would
 * otherwise become a second FTP command).
 */
export function isSafeRemoteName(name: string): boolean {
  if (name.length === 0 || name.length > 255 || name === '.' || name === '..') return false
  // eslint-disable-next-line no-control-regex
  return !/[/\\\u0000-\u001f\u007f]/.test(name)
}

const size = (text: string | undefined): number | null => {
  if (text === undefined || !/^\d{1,15}$/.test(text)) return null
  return Number(text)
}

/** One MLSD line (`type=file;size=4194304;modify=20240310213302; img-0001.fits`), or null. */
export function parseMlsdLine(line: string): RemoteEntry | null {
  const gap = line.indexOf(' ')
  if (gap < 0) return null
  const facts = new Map<string, string>()
  for (const fact of line.slice(0, gap).split(';')) {
    const eq = fact.indexOf('=')
    if (eq > 0) facts.set(fact.slice(0, eq).toLowerCase(), fact.slice(eq + 1))
  }
  const name = line.slice(gap + 1)
  const type = facts.get('type')?.toLowerCase()
  if (!isSafeRemoteName(name)) return null
  if (type === 'dir') return { name, kind: 'dir', sizeBytes: null }
  if (type === 'file') return { name, kind: 'file', sizeBytes: size(facts.get('size')) }
  return null
}

const UNIX_LINE = /^([-dl])[-rwxsStTl]{9}[+@.]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d{1,2}\s+(?:\d{1,2}:\d{2}|\d{4})\s(.+)$/
const DOS_LINE = /^\d{2}-\d{2}-\d{2,4}\s+\d{1,2}:\d{2}(?:AM|PM)?\s+(<DIR>|\d+)\s+(.+)$/i

/**
 * One LIST line in the Unix (`-rw-r--r-- 1 0 0 4194304 Mar 10 21:33 img-0001.fits`) or DOS
 * (`03-10-24  09:33PM  4194304 img-0001.fits`) format, or null. Links are left out, since what
 * they point to is not known.
 */
export function parseListLine(line: string): RemoteEntry | null {
  const unix = UNIX_LINE.exec(line)
  if (unix) {
    if (unix[1] === 'l' || !isSafeRemoteName(unix[3])) return null
    return unix[1] === 'd' ? { name: unix[3], kind: 'dir', sizeBytes: null } : { name: unix[3], kind: 'file', sizeBytes: size(unix[2]) }
  }
  const dos = DOS_LINE.exec(line)
  if (dos) {
    if (!isSafeRemoteName(dos[2])) return null
    return dos[1].toUpperCase() === '<DIR>' ? { name: dos[2], kind: 'dir', sizeBytes: null } : { name: dos[2], kind: 'file', sizeBytes: size(dos[1]) }
  }
  return null
}

/**
 * A folder's listing, in either format: the entries that parse, each name once (the first wins),
 * sorted by name. Lines that are not entries (totals, `.` and `..`, links) are left out.
 */
export function parseListing(text: string, format: 'mlsd' | 'list'): RemoteEntry[] {
  const parse = format === 'mlsd' ? parseMlsdLine : parseListLine
  const seen = new Map<string, RemoteEntry>()
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const entry = parse(line)
    if (entry && !seen.has(entry.name)) seen.set(entry.name, entry)
  }
  return [...seen.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** A path on the scope from its parts, always absolute and with forward slashes. */
export function remotePath(...parts: string[]): string {
  const joined = parts.flatMap(p => p.split('/')).filter(p => p.length > 0)
  return `/${joined.join('/')}`
}
