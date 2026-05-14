import { Fragment } from 'react'
import { Link } from '@inertiajs/react'

export type TraceNode = {
  label?: string
  href?: string
  code?: string
}

type TraceStripProps = {
  nodes: TraceNode[]
  current?: TraceNode
  className?: string
}

export function TraceStrip({ nodes, current, className }: TraceStripProps) {
  const items = current ? [...nodes, { ...current, href: undefined }] : nodes
  if (items.length === 0) return null

  return (
    <nav
      aria-label="hierarki"
      className={className ? `trace-strip ${className}` : 'trace-strip'}
    >
      {items.map((node, idx) => {
        const isCurrent = current ? idx === items.length - 1 : false
        const content = (
          <>
            {node.code ? <span className="trace-strip__code">{node.code}</span> : null}
            {node.label ? <span className="trace-strip__label">{node.label}</span> : null}
          </>
        )
        return (
          <Fragment key={`${idx}-${node.code ?? ''}-${node.label ?? ''}`}>
            {idx > 0 ? <span aria-hidden="true" className="trace-strip__sep">›</span> : null}
            {node.href ? (
              <Link className="trace-strip__node trace-strip__node--link" href={node.href}>
                {content}
              </Link>
            ) : (
              <span
                aria-current={isCurrent ? 'page' : undefined}
                className={`trace-strip__node${isCurrent ? ' trace-strip__node--current' : ''}`}
              >
                {content}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
