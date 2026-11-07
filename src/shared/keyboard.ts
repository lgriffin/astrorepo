/**
 * Keyboard rules (specs/046-everyday-ux, U4): the shortcuts the app answers anywhere, listed once
 * so the shortcuts sheet and the handlers agree, and when a key press works a pressable element.
 */

export interface Shortcut {
  /** The keys, as shown: one entry per key to press together (arrows that move either way share one). */
  keys: readonly string[]
  /** What it does, in a sentence. */
  does: string
  /** Where it works. */
  where: string
}

/** Every shortcut the app answers, in the order the sheet lists them. */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: ['Ctrl', 'K'], does: 'Go to any page, setting, target or idea by typing (Cmd+K on a Mac)', where: 'Anywhere' },
  { keys: ['?'], does: 'Show these shortcuts', where: 'Anywhere but a text field' },
  { keys: ['Tab'], does: 'Move to the next control; the first stop is Skip to the page', where: 'Anywhere' },
  { keys: ['Enter'], does: 'Open or press what has focus, such as a row or a day', where: 'Anywhere' },
  { keys: ['Space'], does: 'Press a button, tick a box, or open a row', where: 'Anywhere' },
  { keys: ['Esc'], does: 'Close the palette, a dialog, an explanation or a picture', where: 'Anywhere it is open' },
  { keys: ['↑ ↓'], does: 'Move through the palette’s list', where: 'Go to palette' },
  { keys: ['← →'], does: 'Move between tabs, or to the picture before or after', where: 'Tabs, picture viewer' }
]

interface KeyPress {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

/** Whether something being typed into takes its own keys: a text field, a list box, or editable text. */
export function typingInto(target: { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = (target.tagName ?? '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag !== 'input') return false
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes((target.type ?? 'text').toLowerCase())
}

/** Whether a key press opens the shortcuts sheet: ? with no Ctrl, Cmd or Alt, outside a text field. */
export function opensShortcuts(e: KeyPress, target: Parameters<typeof typingInto>[0]): boolean {
  return e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !typingInto(target)
}

/** Whether a key press works a pressable element, as Enter and Space work a button. */
export function pressesKey(e: KeyPress): boolean {
  return (e.key === 'Enter' || e.key === ' ') && !e.ctrlKey && !e.metaKey && !e.altKey
}
