'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, Wallet, Receipt, ArrowLeftRight, Baby, Link2 } from 'lucide-react'
import type { ComponentType } from 'react'

type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  isActive: (pathname: string) => boolean
}

const RELATIONSHIP_ID_PATTERN = /^\/dashboard\/relationships\/([^/]+)(?:\/(.*))?$/

function getRelationshipId(pathname: string): string | null {
  const match = pathname.match(RELATIONSHIP_ID_PATTERN)
  if (!match) return null
  const [, id] = match
  if (id === 'invite') return null
  return id
}

export function BottomNav() {
  const pathname = usePathname()
  const relationshipId = getRelationshipId(pathname)

  const items: NavItem[] = relationshipId
    ? [
        {
          href: `/dashboard/relationships/${relationshipId}/money`,
          label: 'מרכז הכספים',
          icon: Wallet,
          isActive: (p) => p === `/dashboard/relationships/${relationshipId}/money`,
        },
        {
          href: `/dashboard/relationships/${relationshipId}/expenses`,
          label: 'הוצאות',
          icon: Receipt,
          isActive: (p) => p.startsWith(`/dashboard/relationships/${relationshipId}/expenses`),
        },
        {
          href: `/dashboard/relationships/${relationshipId}/payments`,
          label: 'תשלומים',
          icon: ArrowLeftRight,
          isActive: (p) => p.startsWith(`/dashboard/relationships/${relationshipId}/payments`),
        },
        {
          href: `/dashboard/relationships/${relationshipId}/children`,
          label: 'ילדים',
          icon: Baby,
          isActive: (p) => p.startsWith(`/dashboard/relationships/${relationshipId}/children`),
        },
        {
          href: `/dashboard/relationships/${relationshipId}`,
          label: 'הקשר',
          icon: Link2,
          isActive: (p) => p === `/dashboard/relationships/${relationshipId}`,
        },
      ]
    : [
        {
          href: '/dashboard',
          label: 'בית',
          icon: Home,
          isActive: (p) => p === '/dashboard',
        },
        {
          href: '/dashboard/relationships',
          label: 'קשרים',
          icon: Users,
          isActive: (p) => p.startsWith('/dashboard/relationships'),
        },
      ]

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((item) => {
          const active = item.isActive(pathname)
          const Icon = item.icon
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-1 px-2 py-2.5 text-xs ${
                  active ? 'text-primary' : 'text-muted'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
