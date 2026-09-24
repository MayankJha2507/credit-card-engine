import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('surface-card p-6 sm:p-7', className)}>{children}</section>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'positive' | 'muted' }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={cn('num mt-1 text-xl font-semibold', tone === 'positive' && 'text-emerald-700', tone === 'muted' && 'text-ink-muted')}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-ink-muted">{sub}</div> : null}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint ? <span className="ml-2 text-xs text-ink-muted">{hint}</span> : null}
      <div className="mt-2">{children}</div>
    </label>
  );
}
