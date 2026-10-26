import React from 'react'

/** A data table: quiet header, hairline rows, figures in tabular numerals (LF-006). */
export function Table({ className = '', children, ...rest }: React.TableHTMLAttributes<HTMLTableElement>): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm tabular-nums ${className}`} {...rest}>{children}</table>
    </div>
  )
}

export function Th({ className = '', align = 'left', ...rest }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' }): React.ReactElement {
  return <th scope="col" className={`px-3 py-2 text-xs font-medium text-astro-muted border-b border-astro-border ${align === 'right' ? 'text-right' : 'text-left'} ${className}`} {...rest} />
}

export function Td({ className = '', align = 'left', ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' }): React.ReactElement {
  return <td className={`px-3 py-2 text-astro-text border-b border-astro-border/60 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`} {...rest} />
}

/** A row that can be picked, highlighted on hover. */
export function Tr({ className = '', ...rest }: React.HTMLAttributes<HTMLTableRowElement>): React.ReactElement {
  return <tr className={`hover:bg-astro-raised/50 ${className}`} {...rest} />
}
