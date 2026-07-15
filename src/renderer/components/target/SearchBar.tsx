import React, { useState, useEffect, useRef } from 'react'

interface SearchBarProps {
  onSearch: (query: string) => void
  placeholder?: string
  debounceMs?: number
}

export function SearchBar({
  onSearch,
  placeholder = 'Search targets by name, designation, or alias...',
  debounceMs = 300
}: SearchBarProps): React.ReactElement {
  const [value, setValue] = useState('')
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
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 bg-astro-surface border border-astro-border rounded-lg
                   text-astro-text placeholder-astro-muted
                   focus:outline-none focus:border-astro-accent focus:ring-1 focus:ring-astro-accent
                   transition-colors"
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-astro-muted hover:text-astro-text"
        >
          x
        </button>
      )}
    </div>
  )
}
