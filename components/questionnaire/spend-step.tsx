'use client';
import { CATEGORY_LABELS, SPEND_CATEGORIES, type SpendCategory } from '@/lib/data/types';
import { formatINR } from '@/lib/utils';
import { cn } from '@/lib/utils';

const PRESETS = [0, 5000, 10000, 25000, 50000];

const HINTS: Partial<Record<SpendCategory, string>> = {
  online: 'Amazon, Flipkart, Myntra, food delivery apps',
  flights: 'Air tickets and travel bookings',
  international: 'Spending in foreign currency, here or abroad',
  other: 'Anything not covered above',
};

export function SpendStep({ spend, onChange }: { spend: Partial<Record<SpendCategory, number>>; onChange: (s: Partial<Record<SpendCategory, number>>) => void }) {
  const total = SPEND_CATEGORIES.reduce((n, c) => n + (spend[c] ?? 0), 0);

  const set = (cat: SpendCategory, value: number) => onChange({ ...spend, [cat]: Math.max(0, Math.round(value)) });

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Where does your money go each month?</h2>
      <p className="mt-2 text-sm text-ink-muted">Approximate monthly spend is enough. Skip anything that doesn&apos;t apply.</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {SPEND_CATEGORIES.map((cat) => {
          const value = spend[cat] ?? 0;
          return (
            <div key={cat} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{CATEGORY_LABELS[cat]}</div>
                  {HINTS[cat] ? <div className="mt-0.5 text-xs text-ink-muted">{HINTS[cat]}</div> : null}
                </div>
                <div className="num text-sm font-semibold">{formatINR(value)}</div>
              </div>

              <input
                type="range" min={0} max={200000} step={1000} value={Math.min(value, 200000)}
                onChange={(e) => set(cat, Number(e.target.value))}
                aria-label={`${CATEGORY_LABELS[cat]} monthly spend`}
                className="mt-3 w-full accent-ink"
              />

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p} type="button" onClick={() => set(cat, p)}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-xs transition-colors',
                      value === p ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-canvas',
                    )}
                  >
                    {p === 0 ? 'None' : formatINR(p)}
                  </button>
                ))}
                <input
                  type="number" min={0} value={value || ''} placeholder="Custom"
                  onChange={(e) => set(cat, Number(e.target.value || 0))}
                  aria-label={`${CATEGORY_LABELS[cat]} custom amount`}
                  className="num ml-auto w-24 rounded-lg border border-line px-2 py-1 text-right text-xs focus:border-ink focus:outline-none"
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-ink-muted">
        Estimated total: <strong className="num font-semibold text-ink">{formatINR(total)}</strong> per month
        {total > 0 ? <> · <span className="num">{formatINR(total * 12)}</span> per year</> : null}
      </p>
    </div>
  );
}
