import React, { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
  debounceMs?: number
}

export function SearchBar({
  onSearch,
  placeholder = 'Search by name, designation or alias',
  debounceMs = 300
}: SearchBarProps): React.ReactElement {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSearch(value)
    }, debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, debounceMs, onSearch])

  return (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-astro-muted" strokeWidth={1.75} />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); setValue('') } }}
        placeholder={placeholder}
        aria-label="Search targets"
        className="h-9 w-full rounded-md border border-astro-border bg-astro-bg pl-9 pr-9 text-sm text-astro-text placeholder-astro-muted
                   transition-colors focus:outline-none focus:border-astro-accent focus:ring-1 focus:ring-astro-accent
                   [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => { setValue(''); input.current?.focus() }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-astro-muted hover:text-astro-text"
        >
          <X aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}
