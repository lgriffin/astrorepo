import net from 'net'
import { ScopeUnreachableError, type ScopeConnection, type ScopeFiles } from '@astro/application'
import {
  parseExtendedPassive,
  parseListing,
  parsePassive,
  readFtpReplies,
  replyClass,
  type FtpReply,
  type RemoteEntry
} from '@astro/domain'

export interface NodeScopeFilesOptions {
  /** How long the scope may stay silent before the connection counts as lost. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Commands this adapter may send, and nothing else: none of them can remove, rename or write a
 * file on the scope (VSP-005). `send` refuses anything not on the list.
 */
export const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set(['USER', 'PASS', 'TYPE', 'EPSV', 'PASV', 'CWD', 'MLSD', 'LIST', 'REST', 'RETR', 'QUIT'])

const describe = (reply: FtpReply) => `${reply.code} ${reply.text}`.trim()

/** The control channel: one command at a time, replies read with the domain's reply reader. */
class Control {
  private buffer = ''
  private readonly replies: FtpReply[] = []
  private readonly waiting: { resolve: (r: FtpReply) => void; reject: (e: Error) => void }[] = []
  private failure: Error | null = null

  constructor(private readonly socket: net.Socket, private readonly timeoutMs: number) {
    socket.setEncoding('utf8')
    socket.on('data', (text: string) => {
      try {
        const out = readFtpReplies(this.buffer + text)
        this.buffer = out.rest
        for (const r of out.replies) this.deliver(r)
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)))
        socket.destroy()
      }
    })
    socket.on('error', error => this.fail(new Error(`The connection to the scope failed: ${error.message}`)))
    socket.on('timeout', () => {
      this.fail(new Error('The scope stopped answering.'))
      socket.destroy()
    })
    socket.on('close', () => this.fail(new Error('The scope closed the connection.')))
  }

  private deliver(reply: FtpReply) {
    const w = this.waiting.shift()
    if (w) w.resolve(reply)
    else this.replies.push(reply)
  }

  private fail(error: Error) {
    if (this.failure) return
    this.failure = error
    for (const w of this.waiting.splice(0)) w.reject(error)
  }

  /** The next reply the scope sends. */
  next(): Promise<FtpReply> {
    const ready = this.replies.shift()
    if (ready) return Promise.resolve(ready)
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }))
  }

  /** Sends one read-only command and returns its first reply. */
  command(line: string): Promise<FtpReply> {
    const verb = line.split(' ', 1)[0].toUpperCase()
    if (!READ_ONLY_COMMANDS.has(verb)) return Promise.reject(new Error(`${verb} is not a command the app sends to a scope.`))
    if (/[\r\n]/.test(line)) return Promise.reject(new Error('A command to the scope cannot hold a line break.'))
    if (this.failure) return Promise.reject(this.failure)
    this.socket.write(`${line}\r\n`)
    return this.next()
  }

  /**
   * Stops or restarts the silence timer: the control channel is quiet while a file arrives on
   * the data connection, which has its own timer, so a long transfer must not count as silence.
   */
  quietWhileTransferring(quiet: boolean) {
    this.socket.setTimeout(quiet ? 0 : this.timeoutMs)
  }

  destroy() {
    this.socket.destroy()
  }
}

function connect(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)} s`))
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.setTimeout(timeoutMs)
      resolve(socket)
    })
    socket.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

class NodeScopeConnection implements ScopeConnection {
  private extendedPassive = true
  private mlsd = true
  /** Set once a transfer was cut short; the control channel may then be out of step, so it is not used again. */
  private broken = false

  constructor(private readonly control: Control, private readonly host: string, private readonly timeoutMs: number) {}

  private usable() {
    if (this.broken) throw new Error('The connection to the scope was interrupted; connect again.')
  }

  private async expect(line: string, ok: (code: number) => boolean): Promise<FtpReply> {
    const reply = await this.control.command(line)
    if (!ok(reply.code)) throw new Error(`The scope refused ${line.split(' ', 1)[0]}: ${describe(reply)}`)
    return reply
  }

  /** A passive data connection, always to the control channel's own host (see parsePassive). */
  private async openData(): Promise<net.Socket> {
    let port: number | null = null
    if (this.extendedPassive) {
      const reply = await this.control.command('EPSV')
      if (reply.code === 229) port = parseExtendedPassive(reply.text)
      else this.extendedPassive = false
    }
    if (port === null) {
      const reply = await this.control.command('PASV')
      if (reply.code === 227) port = parsePassive(reply.text)?.port ?? null
    }
    if (port === null) throw new Error('The scope offered no data connection.')
    return connect(this.host, port, this.timeoutMs)
  }

  /**
   * Runs one transfer command over a fresh data connection, handing each chunk to `sink` in order;
   * the data connection waits while a chunk is being written. Resolves with the command's first
   * reply when the scope refused it (nothing was sent), else once the data has ended, every chunk
   * is written and the scope has said the transfer is complete.
   */
  private async transfer(line: string, sink: (chunk: Buffer) => void | Promise<void>): Promise<FtpReply | null> {
    const data = await this.openData()
    let sinkError: unknown = null
    let written: Promise<void> = Promise.resolve()
    const finished = new Promise<void>((resolve, reject) => {
      data.on('data', (chunk: Buffer) => {
        if (sinkError) return
        data.pause()
        written = written
          .then(() => (sinkError ? undefined : sink(chunk)))
          .then(
            () => void data.resume(),
            error => {
              sinkError ??= error
              data.destroy()
            }
          )
      })
      data.on('timeout', () => data.destroy(new Error('The scope stopped sending.')))
      data.on('error', reject)
      data.on('close', () => void written.then(() => (sinkError ? reject(sinkError) : resolve())))
    })
    finished.catch(() => undefined)
    let first: FtpReply
    try {
      first = await this.control.command(line)
    } catch (error) {
      data.destroy()
      throw error
    }
    if (replyClass(first.code) >= 4) {
      data.destroy()
      return first
    }
    this.control.quietWhileTransferring(true)
    try {
      await finished
    } catch (error) {
      this.broken = true
      throw error
    } finally {
      this.control.quietWhileTransferring(false)
    }
    const last = replyClass(first.code) === 1 ? await this.control.next() : first
    if (replyClass(last.code) !== 2) {
      this.broken = true
      throw new Error(`The transfer did not finish: ${describe(last)}`)
    }
    return null
  }

  async list(dir: string): Promise<RemoteEntry[]> {
    this.usable()
    await this.expect(`CWD ${dir}`, code => replyClass(code) === 2)
    const read = async (verb: 'MLSD' | 'LIST') => {
      const chunks: Buffer[] = []
      const refused = await this.transfer(verb, chunk => void chunks.push(chunk))
      return { refused, text: Buffer.concat(chunks).toString('utf8') }
    }
    if (this.mlsd) {
      const out = await read('MLSD')
      if (!out.refused) return parseListing(out.text, 'mlsd')
      // 500, 502 and 504 say the command is unknown here; anything else is a real refusal.
      if (![500, 502, 504].includes(out.refused.code)) throw new Error(`The scope would not list ${dir}: ${describe(out.refused)}`)
      this.mlsd = false
    }
    const out = await read('LIST')
    if (out.refused) throw new Error(`The scope would not list ${dir}: ${describe(out.refused)}`)
    return parseListing(out.text, 'list')
  }

  /**
   * Streams a file from `offset` to `onChunk`, asking the scope to start there with REST; when it
   * will not, the bytes start at 0. `onStart` hears where they start before the first byte comes.
   * Resolves once the scope says the transfer is complete (spec 034, VIN-024). Writes nothing on the PC.
   */
  async retrieve(remote: string, offset: number, onStart: (from: number) => void, onChunk: (chunk: Uint8Array) => void): Promise<void> {
    this.usable()
    let from = 0
    if (offset > 0) {
      const rest = await this.control.command(`REST ${Math.trunc(offset)}`)
      if (rest.code === 350) from = Math.trunc(offset)
    }
    onStart(from)
    const refused = await this.transfer(`RETR ${remote}`, onChunk)
    if (refused) throw new Error(`The scope would not send ${remote}: ${describe(refused)}`)
  }

  async close(): Promise<void> {
    try {
      if (!this.broken) {
        await Promise.race([this.control.command('QUIT'), new Promise(resolve => setTimeout(resolve, 1000))])
      }
    } catch {
      // Closing never fails: the socket goes either way.
    } finally {
      this.control.destroy()
    }
  }
}

/**
 * The Vespera's file server over FTP (spec 033): anonymous sign-in, binary mode, passive data
 * connections, MLSD listings with LIST as the fallback. Written on Node's sockets with no FTP
 * library, and only ever reads from the scope. Tested against an FTP server in the tests that
 * behaves as the Vespera is reported to; not yet against a real Vespera.
 */
export class NodeScopeFiles implements ScopeFiles {
  constructor(private readonly options: NodeScopeFilesOptions = {}) {}

  async open(host: string, port: number): Promise<ScopeConnection> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let socket: net.Socket
    try {
      socket = await connect(host, port, timeoutMs)
    } catch (error) {
      const why = (error as NodeJS.ErrnoException).code ?? (error as Error).message
      throw new ScopeUnreachableError(`Nothing answered at ${host}:${port} (${why}). Check the PC is on the Vespera's Wi-Fi and the scope is on.`, { cause: error })
    }
    const control = new Control(socket, timeoutMs)
    try {
      let greeting = await control.next()
      while (replyClass(greeting.code) === 1) greeting = await control.next()
      if (greeting.code !== 220) throw new ScopeUnreachableError(`The scope at ${host} is not ready: ${describe(greeting)}`)
      let login = await control.command('USER anonymous')
      if (login.code === 331) login = await control.command('PASS anonymous@')
      if (replyClass(login.code) !== 2) throw new ScopeUnreachableError(`The scope at ${host} refused the sign-in: ${describe(login)}`)
      const type = await control.command('TYPE I')
      if (replyClass(type.code) !== 2) throw new Error(`The scope refused binary mode: ${describe(type)}`)
      return new NodeScopeConnection(control, host, timeoutMs)
    } catch (error) {
      control.destroy()
      if (error instanceof ScopeUnreachableError) throw error
      throw new ScopeUnreachableError(`The scope at ${host} did not finish signing in: ${(error as Error).message}`, { cause: error })
    }
  }
}
