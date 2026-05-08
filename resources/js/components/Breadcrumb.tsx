import { Link } from '@inertiajs/react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Check } from 'lucide-react'
import { QUICK_JUMP_SECTIONS } from '../lib/topbar-config'

type BreadcrumbProps = {
  workspace: string
  currentLabel: string
  currentPath: string
}

/**
 * Workspace + current page breadcrumb. The current page segment is a
 * Radix DropdownMenu trigger that opens a sectioned quick-jump list.
 *
 * Workspace ("PTPN III") stays static — single-tenant for now.
 */
export function Breadcrumb({ workspace, currentLabel, currentPath }: BreadcrumbProps) {
  return (
    <nav className="topbar__breadcrumb" aria-label="breadcrumb">
      <span className="topbar__breadcrumb-workspace">{workspace}</span>
      <span className="topbar__breadcrumb-sep">/</span>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="topbar__breadcrumb-page topbar__breadcrumb-page--trigger"
            aria-label={`Pindah halaman dari ${currentLabel}`}
          >
            <span>{currentLabel}</span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="topbar-quickjump"
            align="start"
            sideOffset={6}
            collisionPadding={12}
          >
            {QUICK_JUMP_SECTIONS.map((section, idx) => (
              <DropdownMenu.Group key={section.label}>
                {idx > 0 ? (
                  <DropdownMenu.Separator className="topbar-quickjump__sep" />
                ) : null}
                <DropdownMenu.Label className="topbar-quickjump__label">
                  {section.label}
                </DropdownMenu.Label>
                {section.items.map((item) => {
                  const isActive = item.path === currentPath
                  return (
                    <DropdownMenu.Item
                      key={item.path}
                      asChild
                      className="topbar-quickjump__item"
                      data-active={isActive ? '' : undefined}
                    >
                      <Link href={item.path}>
                        <span className="topbar-quickjump__item-label">
                          {item.label}
                        </span>
                        {isActive ? (
                          <Check
                            size={13}
                            aria-hidden="true"
                            className="topbar-quickjump__item-check"
                          />
                        ) : null}
                      </Link>
                    </DropdownMenu.Item>
                  )
                })}
              </DropdownMenu.Group>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </nav>
  )
}
