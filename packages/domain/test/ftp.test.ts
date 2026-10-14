import { describe, expect, it } from 'vitest'
import {
  MAX_REPLY_CHARS,
  isSafeRemoteName,
  parseExtendedPassive,
  parseListLine,
  parseListing,
  parseMlsdLine,
  parsePassive,
  readFtpReplies,
  remotePath,
  replyClass
} from '@astro/domain'

describe('FTP replies', () => {
  it('[VSP-001] Given single and multi-line replies split across reads, When read, Then each complete reply comes back once with the rest kept', () => {
    const first = readFtpReplies('220-Welcome to the Vespera\r\n220-second line\r\n')
    expect(first.replies).toEqual([])
    expect(first.rest).toBe('220-Welcome to the Vespera\r\n220-second line\r\n')
    const second = readFtpReplies(`${first.rest}220 Ready\r\n331 Password please\r\n230 Sig`)
    expect(second.replies).toEqual([
      { code: 220, text: 'Welcome to the Vespera\nsecond line\nReady' },
      { code: 331, text: 'Password please' }
    ])
    expect(second.rest).toBe('230 Sig')
  })

  it('[VSP-001] Given a multi-line reply whose inner lines look like other codes, When read, Then only its own code closes it', () => {
    const out = readFtpReplies('211-Features:\n 250 not the end\n331 nor this\n211 End\n')
    expect(out.replies).toEqual([{ code: 211, text: 'Features:\n 250 not the end\n331 nor this\nEnd' }])
    expect(readFtpReplies('211-x\n211\n').replies).toEqual([{ code: 211, text: 'x\n' }])
  })

  it('[VSP-001] Given lines that are not replies and codes out of range, When read, Then they are dropped', () => {
    expect(readFtpReplies('hello\n600 nope\n099 no\n200 ok\n').replies).toEqual([{ code: 200, text: 'ok' }])
    expect(readFtpReplies('200\n').replies).toEqual([])
  })

  it('[FUZ-003] Given an unfinished reply longer than any real one, When read, Then it is refused rather than kept growing', () => {
    expect(() => readFtpReplies(`220-${'x'.repeat(MAX_REPLY_CHARS)}\n`)).toThrow(/too long/)
    expect(() => readFtpReplies('x'.repeat(MAX_REPLY_CHARS + 1))).toThrow(/too long/)
    expect(readFtpReplies('x'.repeat(MAX_REPLY_CHARS)).rest).toHaveLength(MAX_REPLY_CHARS)
  })

  it('[VSP-001] Given reply codes, When classed, Then the first digit is the class', () => {
    expect([150, 226, 331, 426, 550].map(replyClass)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('passive mode', () => {
  it('[VSP-005] Given passive replies, When read, Then the data port comes back and nonsense gives null', () => {
    expect(parseExtendedPassive('Entering Extended Passive Mode (|||50123|)')).toBe(50123)
    expect(parseExtendedPassive('(!!!21!)')).toBe(21)
    expect(parseExtendedPassive('(|||0|)')).toBeNull()
    expect(parseExtendedPassive('(|||70000|)')).toBeNull()
    expect(parseExtendedPassive('(||50123|)')).toBeNull()
    expect(parsePassive('Entering Passive Mode (10,0,0,1,195,80).')).toEqual({ host: '10.0.0.1', port: 195 * 256 + 80 })
    expect(parsePassive('227 (192, 168, 1, 2, 0, 21)')).toEqual({ host: '192.168.1.2', port: 21 })
    expect(parsePassive('(10,0,0,1,0,0)')).toBeNull()
    expect(parsePassive('(10,0,0,256,1,1)')).toBeNull()
    expect(parsePassive('no address')).toBeNull()
  })
})

describe('listings', () => {
  it('[VSP-001] Given MLSD lines, When read, Then files and folders come back with sizes and the rest is left out', () => {
    expect(parseMlsdLine('type=file;size=4194304;modify=20240310213302; img-0001.fits')).toEqual({ name: 'img-0001.fits', kind: 'file', sizeBytes: 4194304 })
    expect(parseMlsdLine('Type=DIR;modify=20240310213302; 01-images-initial')).toEqual({ name: '01-images-initial', kind: 'dir', sizeBytes: null })
    expect(parseMlsdLine('type=file; no size.json')).toEqual({ name: 'no size.json', kind: 'file', sizeBytes: null })
    expect(parseMlsdLine('type=file;size=-1; neg.fits')).toEqual({ name: 'neg.fits', kind: 'file', sizeBytes: null })
    expect(parseMlsdLine('type=cdir; .')).toBeNull()
    expect(parseMlsdLine('type=OS.unix=slink; link')).toBeNull()
    expect(parseMlsdLine('nospace')).toBeNull()
  })

  it('[VSP-001] Given Unix and DOS LIST lines, When read, Then files and folders come back and links and totals are left out', () => {
    expect(parseListLine('-rw-r--r--    1 0        0         4194304 Mar 10 21:33 img-0001.fits')).toEqual({ name: 'img-0001.fits', kind: 'file', sizeBytes: 4194304 })
    expect(parseListLine('drwxr-xr-x    2 root     root         4096 Jan  1  2024 expert mode')).toEqual({ name: 'expert mode', kind: 'dir', sizeBytes: null })
    expect(parseListLine('lrwxrwxrwx    1 0        0              4 Mar 10 21:33 latest -> obs')).toBeNull()
    expect(parseListLine('03-10-24  09:33PM              4194304 img-0001.fits')).toEqual({ name: 'img-0001.fits', kind: 'file', sizeBytes: 4194304 })
    expect(parseListLine('03-10-2024  21:33       <DIR>          user')).toEqual({ name: 'user', kind: 'dir', sizeBytes: null })
    expect(parseListLine('total 12')).toBeNull()
    expect(parseListLine('drwxr-xr-x 2 0 0 4096 Mar 10 21:33 ..')).toBeNull()
  })

  it('[VSP-013] Given names with slashes or line breaks, When listed, Then they are left out', () => {
    expect(parseMlsdLine('type=file;size=1; ../../evil.fits')).toBeNull()
    expect(parseListLine('-rw-r--r-- 1 0 0 1 Mar 10 21:33 a\\b.fits')).toBeNull()
    expect(isSafeRemoteName('img\r\nDELE x')).toBe(false)
    expect(isSafeRemoteName('a'.repeat(256))).toBe(false)
    expect(isSafeRemoteName('')).toBe(false)
    expect(isSafeRemoteName('M 42 (Orion).fits')).toBe(true)
  })

  it('[VSP-001] Given a whole listing with CRLF line ends and a repeated name, When read, Then entries come back once each, sorted', () => {
    const text = 'type=file;size=2; b.fits\r\ntype=dir; a\r\ntype=file;size=9; b.fits\r\n\r\n'
    expect(parseListing(text, 'mlsd')).toEqual([
      { name: 'a', kind: 'dir', sizeBytes: null },
      { name: 'b.fits', kind: 'file', sizeBytes: 2 }
    ])
    expect(parseListing('total 1\n-rw-r--r-- 1 0 0 3 Mar 10 21:33 z.fits\n', 'list')).toEqual([{ name: 'z.fits', kind: 'file', sizeBytes: 3 }])
  })

  it('[VSP-001] Given path parts, When joined, Then the path is absolute with single forward slashes', () => {
    expect(remotePath('user', '2024 M 42/', '/01-images-initial')).toBe('/user/2024 M 42/01-images-initial')
    expect(remotePath('/')).toBe('/')
    expect(remotePath()).toBe('/')
  })
})
