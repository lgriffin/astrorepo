import React, { useEffect, useState } from 'react'
import { checkPairing, PAIR_CHECK_EVERY_MS, startPairing, type PairingStarted } from '../../companion'
import { COMPANION_KEY } from '../../bridge'

const fetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => window.fetch(url, init)

/** Two groups of three, easier to read across a room. */
const shown = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

/**
 * What a companion screen shows until the PC pairs it (specs/035-pi-variant, PI-018): a name, then
 * a code to type on the PC in Settings → Companion screens. Large enough to read and tap on a
 * 7-inch touchscreen.
 */
export function PairScreen(): React.ReactElement {
  const [name, setName] = useState('Pi by the scope')
  const [pairing, setPairing] = useState<PairingStarted | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!pairing) return
    const timer = window.setInterval(() => {
      checkPairing(fetchFn, pairing.requestId)
        .then(status => {
          if (status.state === 'paired') {
            try {
              window.localStorage.setItem(COMPANION_KEY, status.key)
            } catch {
              setMessage('This browser will not keep the key, so it cannot stay paired. Allow it to store data for this address.')
              setPairing(null)
              return
            }
            window.location.reload()
          } else if (status.state === 'expired') {
            setPairing(null)
            setMessage('The code ran out before it was typed. Show a new one.')
          }
        })
        .catch(() => setMessage('Cannot reach the PC. Is astrorepo open there with companion screens allowed?'))
    }, PAIR_CHECK_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [pairing])

  async function showCode(): Promise<void> {
    setMessage(null)
    try {
      setPairing(await startPairing(fetchFn, name))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="min-h-screen bg-astro-bg text-astro-text flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <h1 className="text-2xl font-semibold">Pair this screen with your PC</h1>
        {pairing ? (
          <>
            <p className="text-astro-muted">On the PC, open Settings, then Companion screens, and type this code.</p>
            <p className="text-6xl font-mono tracking-widest" aria-label="Pairing code">{shown(pairing.code)}</p>
            <p className="text-sm text-astro-muted">The code lasts five minutes.</p>
            <button onClick={() => setPairing(null)} className="px-6 py-3 border border-astro-border rounded-lg text-lg">
              Cancel
            </button>
          </>
        ) : (
          <>
            <p className="text-astro-muted">Give this screen a name, so you can tell it apart on the PC.</p>
            <input
              value={name}
              maxLength={40}
              onChange={e => setName(e.target.value)}
              aria-label="Screen name"
              className="w-full bg-astro-surface border border-astro-border rounded-lg px-4 py-3 text-lg"
            />
            <button onClick={() => void showCode()} className="w-full px-6 py-4 bg-astro-accent text-white rounded-lg text-lg">
              Show a pairing code
            </button>
          </>
        )}
        {message && <p className="text-astro-warning">{message}</p>}
      </div>
    </div>
  )
}
