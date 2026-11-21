import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';

import { signOutAction } from '@/app/actions/auth';
import { BrandLockup, BrandMark } from '@/components/brand/logo';

import { SidebarNav } from './sidebar-nav';

interface AppShellProps {
  children: ReactNode;
  userEmail: string;
  userName: string | null;
}

export function AppShell({ children, userEmail, userName }: AppShellProps) {
  const displayName = userName?.trim() || userEmail.split('@')[0] || 'Investidor';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[244px_1fr]">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="hidden border-r border-line bg-surface lg:flex lg:h-dvh lg:flex-col lg:sticky lg:top-0">
        <div className="px-5 py-5">
          <BrandLockup />
        </div>

        <div className="flex-1 px-3">
          <SidebarNav />
        </div>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-[8px] px-2 py-2">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-ink"
            >
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink">{displayName}</p>
              <p className="truncate text-[11px] text-ink-faint">{userEmail}</p>
            </div>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="mt-1 flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <LogOut className="size-3.5" aria-hidden="true" strokeWidth={2} />
              Sair
            </button>
          </form>
        </div>
      </aside>

      {/* ---------- Conteúdo ---------- */}
      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Header (mobile) */}
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <BrandMark />
              <span className="text-sm font-semibold tracking-tight text-ink">Bolsa Monitor</span>
            </div>

            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sair da conta"
                className="flex size-8 items-center justify-center rounded-[8px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <LogOut className="size-4" aria-hidden="true" strokeWidth={2} />
              </button>
            </form>
          </div>

          <SidebarNav />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1180px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
