import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'positive' | 'warning'; className?: string }) {
  const tones = {
    neutral: 'border-line bg-canvas text-ink-muted',
    brand: 'border-brand-200 bg-brand-50 text-brand-700',
    positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}
