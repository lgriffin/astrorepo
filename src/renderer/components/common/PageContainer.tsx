import React from 'react'

interface PageContainerProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}

export function PageContainer({
  title,
  subtitle,
  actions,
  children
}: PageContainerProps): React.ReactElement {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-astro-text">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-astro-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
