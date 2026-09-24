'use client';
import { FEE_BAND_LABELS, PRIORITY_LABELS, type FeeBand, type LoungeImportance, type Priority } from '@/lib/calculations/types';
import { CATEGORY_LABELS, SPEND_CATEGORIES, type SpendCategory } from '@/lib/data/types';
import { formatINR } from '@/lib/utils';

const LOUNGE_LABELS: Record<LoungeImportance, string> = {
  not_important: 'Lounge not important',
  nice_to_have: 'Lounge nice to have',
  important: 'Lounge important',
};

/**
 * What the recommendations were calculated from, shown above the results so the
 * inputs stay visible and editable rather than being buried behind a back step.
 */
export function AnswerSummary({
  spend, priorities, feeBand, internationalTravel, loungeImportance, onEditSpending, onEditPreferences, onReset,
}: {
  spend: Partial<Record<SpendCategory, number>>;
  priorities: Priority[];
  feeBand: FeeBand;
  internationalTravel: boolean;
  loungeImportance: LoungeImportance;
  onEditSpending: () => void;
  onEditPreferences: () => void;
  /** Clears every answer, not just navigation. */
  onReset: () => void;
}) {
  const monthly = SPEND_CATEGORIES.reduce((n, c) => n + (spend[c] ?? 0), 0);
  const top = SPEND_CATEGORIES
    .filter((c) => (spend[c] ?? 0) > 0)
    .sort((a, b) => (spend[b] ?? 0) - (spend[a] ?? 0))
    .slice(0, 3);

  return (
    <div className="surface-card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Your spending</p>
          <p className="num mt-1 text-sm">
            <strong className="font-semibold">{formatINR(monthly)}</strong> a month
            {top.length ? (
              <span className="text-ink-muted">
                {' · '}
                {top.map((c) => `${CATEGORY_LABELS[c]} ${formatINR(spend[c] ?? 0)}`).join(' · ')}
                {SPEND_CATEGORIES.filter((c) => (spend[c] ?? 0) > 0).length > top.length ? ' · …' : ''}
              </span>
            ) : (
              <span className="text-ink-muted"> · no categories entered</span>
            )}
          </p>
          <button type="button" onClick={onEditSpending} className="mt-1 text-xs font-medium text-brand-700 underline-offset-2 hover:underline">
            Edit spending
          </button>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">What matters to you</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs">Fee {FEE_BAND_LABELS[feeBand]}</span>
            <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs">{LOUNGE_LABELS[loungeImportance]}</span>
            {internationalTravel ? <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs">Spends internationally</span> : null}
            {priorities.map((p) => (
              <span key={p} className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs">{PRIORITY_LABELS[p]}</span>
            ))}
            {priorities.length === 0 ? <span className="text-xs text-ink-muted">No priorities selected</span> : null}
          </div>
          <button type="button" onClick={onEditPreferences} className="mt-1.5 text-xs font-medium text-brand-700 underline-offset-2 hover:underline">
            Edit preferences
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="shrink-0 self-start rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-canvas"
      >
        Start over
      </button>
    </div>
  );
}
