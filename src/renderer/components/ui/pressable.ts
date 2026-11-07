import type React from 'react'
import { pressesKey } from '@shared/keyboard'

/**
 * Makes a row, card or cell that opens something on a click work from the keyboard too
 * (specs/046-everyday-ux EUX-010): it takes focus, and Enter or Space on it does what a click does.
 * A row of a table keeps its row role; anything else is announced as a button. Keys pressed in a
 * control inside it (a checkbox, a field) stay that control's own.
 */
export function pressable(
  onPress: () => void,
  options: { row?: boolean; expanded?: boolean; pressed?: boolean; label?: string } = {}
): Pick<React.HTMLAttributes<HTMLElement>, 'onClick' | 'onKeyDown' | 'tabIndex' | 'role' | 'aria-expanded' | 'aria-pressed' | 'aria-label'> {
  return {
    onClick: () => onPress(),
    onKeyDown: e => {
      if (e.target !== e.currentTarget || !pressesKey(e)) return
      e.preventDefault()
      onPress()
    },
    tabIndex: 0,
    ...(options.row ? {} : { role: 'button' }),
    ...(options.expanded === undefined ? {} : { 'aria-expanded': options.expanded }),
    ...(options.pressed === undefined ? {} : { 'aria-pressed': options.pressed }),
    ...(options.label === undefined ? {} : { 'aria-label': options.label })
  }
}
