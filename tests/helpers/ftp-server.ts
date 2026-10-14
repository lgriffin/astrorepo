import net from 'net'

/**
 * A small FTP server for the tests, behaving as the Vespera is reported to: anonymous sign-in, a
 * multi-line greeting, passive data connections, MLSD and Unix LIST listings, RETR, and a refusal
 * for anything that would change a file. Files live in memory by absolute path. It records every
 * command it is sent, so a test can show the app never asked to change anything.
 */
export class TestFtpServer {
  readonly files = new Map<string, Buffer>()
  readonly folders = new Set<string>(['/'])
  readonly commands: string[] = []
  /** Off: MLSD is unknown, so clients must fall back to LIST. */
  mlsd = true
  /** Off: EPSV is unknown, so clients must use PASV. */
  epsv = true
  /** The address PASV names; a real scope may name one the PC cannot reach, so clients must ignore it. */
  pasvAddress = '192,168,250,250'
  refuseLogin = false
  /** A file whose transfer is cut off after its first chunk. */
  dropAt: string | null = null
  /** Bytes written per chunk of a RETR. */
  chunkBytes = 64 * 1024
  /** A pause after each chunk of a RETR, for a transfer slower than the client's silence timer. */
  chunkDelayMs = 0
  private server: net.Server | null = null
  private readonly sockets = new Set<net.Socket>()
  port = 0

  put(path: string, content: string | Buffer): this {
    this.files.set(path, Buffer.isBuffer(content) ? content : Buffer.from(content))
    for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1)) this.folders.add(path.slice(0, at))
    return this
  }

  folder(path: string): this {
    this.folders.add(path)
    return this
  }

  async start(): Promise<number> {
    this.server = net.createServer(socket => this.session(socket))
    await new Promise<void>(resolve => this.server!.listen(0, '127.0.0.1', resolve))
    this.port = (this.server.address() as net.AddressInfo).port
    return this.port
  }

  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy()
    await new Promise<void>(resolve => (this.server ? this.server.close(() => resolve()) : resolve()))
  }

  private track(socket: net.Socket) {
    this.sockets.add(socket)
    socket.on('close', () => this.sockets.delete(socket))
    socket.on('error', () => undefined)
  }

  private listing(dir: string, verb: string): string {
    const prefix = dir === '/' ? '/' : `${dir}/`
    const lines: string[] = []
    const children = (set: Iterable<string>) => [...set].filter(p => p !== dir && p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
    for (const f of children(this.folders)) {
      const name = f.slice(prefix.length)
      lines.push(verb === 'MLSD' ? `type=dir;modify=20240310213302; ${name}` : `drwxr-xr-x    2 0        0             4096 Mar 10 21:33 ${name}`)
    }
    for (const f of children(this.files.keys())) {
      const name = f.slice(prefix.length)
      const size = this.files.get(f)!.length
      lines.push(verb === 'MLSD' ? `type=file;size=${size};modify=20240310213302; ${name}` : `-rw-r--r--    1 0        0     ${String(size).padStart(12)} Mar 10 21:33 ${name}`)
    }
    if (verb === 'MLSD') lines.unshift('type=cdir;modify=20240310213302; .', 'type=pdir;modify=20240310213302; ..')
    else lines.unshift(`total ${lines.length}`)
    return lines.map(l => `${l}\r\n`).join('')
  }

  private session(control: net.Socket) {
    this.track(control)
    let cwd = '/'
    let data: Promise<net.Socket> | null = null
    const reply = (text: string) => control.write(`${text}\r\n`)
    const resolve = (p: string) => {
      const parts = (p.startsWith('/') ? p : `${cwd}/${p}`).split('/').filter(Boolean)
      const out: string[] = []
      for (const part of parts) {
        if (part === '..') out.pop()
        else if (part !== '.') out.push(part)
      }
      return `/${out.join('/')}`
    }
    const passive = (): number | Promise<number> => {
      const listener = net.createServer()
      data = new Promise(accept => {
        listener.once('connection', socket => {
          this.track(socket)
          listener.close()
          accept(socket)
        })
      })
      return new Promise(ready => listener.listen(0, '127.0.0.1', () => ready((listener.address() as net.AddressInfo).port)))
    }
    reply('220-Welcome to the test Vespera')
    reply('220 Ready')
    let buffer = ''
    control.setEncoding('utf8')
    control.on('data', async (text: string) => {
      buffer += text
      let nl: number
      while ((nl = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 2)
        this.commands.push(line)
        const space = line.indexOf(' ')
        const verb = (space < 0 ? line : line.slice(0, space)).toUpperCase()
        const arg = space < 0 ? '' : line.slice(space + 1)
        if (verb === 'USER') reply('331 Any password will do')
        else if (verb === 'PASS') reply(this.refuseLogin ? '530 Not today' : '230 Signed in')
        else if (verb === 'TYPE') reply('200 Type set')
        else if (verb === 'EPSV') {
          if (!this.epsv) reply('500 Unknown command')
          else reply(`229 Entering Extended Passive Mode (|||${await passive()}|)`)
        } else if (verb === 'PASV') {
          const port = await passive()
          reply(`227 Entering Passive Mode (${this.pasvAddress},${Math.floor(port / 256)},${port % 256})`)
        } else if (verb === 'CWD') {
          const target = resolve(arg)
          if (this.folders.has(target)) {
            cwd = target
            reply('250 Folder changed')
          } else reply('550 No such folder')
        } else if (verb === 'MLSD' || verb === 'LIST') {
          if (verb === 'MLSD' && !this.mlsd) {
            reply('500 Unknown command')
            continue
          }
          const dir = arg ? resolve(arg) : cwd
          const socket = await data!
          reply('150 Here it comes')
          socket.end(this.listing(dir, verb), () => reply('226 Done'))
        } else if (verb === 'RETR') {
          const file = this.files.get(resolve(arg))
          if (!file) {
            reply('550 No such file')
            continue
          }
          const socket = await data!
          reply('150 Opening binary connection')
          if (this.dropAt === resolve(arg)) {
            socket.write(file.subarray(0, Math.min(this.chunkBytes, file.length - 1)), () => {
              socket.destroy()
              reply('426 Connection closed; transfer aborted')
            })
            continue
          }
          for (let at = 0; at < file.length; at += this.chunkBytes) {
            socket.write(file.subarray(at, at + this.chunkBytes))
            if (this.chunkDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.chunkDelayMs))
          }
          socket.end(() => reply('226 Done'))
        } else if (verb === 'QUIT') {
          reply('221 Bye')
          control.end()
        } else reply('550 Not allowed on this scope')
      }
    })
  }
}
