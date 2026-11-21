'use client';

import clsx from 'clsx';
import { BellRing, LayoutDashboard, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/painel', label: 'Painel', icon: LayoutDashboard },
  { href: '/mercado', label: 'Mercado', icon: TrendingUp },
  { href: '/carteira', label: 'Carteira', icon: Wallet },
  { href: '/alertas', label: 'Alertas', icon: BellRing }
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: coluna vertical */}
      <nav className="hidden flex-col gap-1 lg:flex" aria-label="Navegação principal">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'group flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-surface-2 font-medium text-ink'
                  : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink'
              )}
            >
              <Icon
                className={clsx('size-4 shrink-0', isActive ? 'text-up' : 'text-ink-faint')}
                aria-hidden="true"
                strokeWidth={2}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: barra horizontal rolável */}
      <nav
        className="flex gap-1 overflow-x-auto px-4 pb-3 lg:hidden"
        aria-label="Navegação principal"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'flex shrink-0 items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs transition-colors',
                isActive
                  ? 'bg-surface-2 font-medium text-ink'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              <Icon
                className={clsx('size-3.5', isActive ? 'text-up' : 'text-ink-faint')}
                aria-hidden="true"
                strokeWidth={2}
              />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
