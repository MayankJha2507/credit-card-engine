'use client';
import { useState } from 'react';
import type { CardValuation } from '@/lib/calculations/types';
import { CATEGORY_LABELS } from '@/lib/data/types';
import { formatINR, formatPercent } from '@/lib/utils';
import { track } from '@/lib/analytics';

export function CalculationBreakdown({ valuation, cardName }: { valuation: CardValuation; cardName: string }) {
  const [open, setOpen] = useState(false);
  const rows = valuation.categories;

  return (
    <div className="mt-6 border-t border-line pt-4">
      <button
        type="button"
        onClick={() => { setOpen((o) => { if (!o) track('calculation_opened', { card: cardName }); return !o; }); }}
        aria-expanded={open}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        {open ? 'Hide calculation' : 'How we calculated this'}
      </button>

      {open ? (
        <div className="mt-5 space-y-6 text-sm">
          <div>
            <h4 className="font-semibold">Your estimated annual spend</h4>
            <ul className="mt-2 space-y-1 text-ink-muted">
              {rows.map((r) => (
                <li key={r.category} className="flex justify-between gap-4">
                  <span>{CATEGORY_LABELS[r.category]}</span>
                  <span className="num">{formatINR(r.annualSpend)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-4 border-t border-line pt-1 font-medium text-ink">
                <span>Total</span><span className="num">{formatINR(valuation.totalAnnualSpend)}</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold">Reward calculation</h4>
            <ul className="mt-2 space-y-3">
              {rows.map((r) => (
                <li key={r.category} className="rounded-lg bg-canvas p-3">
                  <div className="flex justify-between gap-4 font-medium">
                    <span>{CATEGORY_LABELS[r.category]}</span>
                    <span className="num">{r.monetizable ? formatINR(r.rewardValue) : 'Not valued'}</span>
                  </div>
                  {r.excluded ? (
                    <p className="mt-1 text-xs text-ink-muted">Excluded by the card terms — {r.exclusionReason}</p>
                  ) : r.effectiveRate !== null ? (
                    <p className="num mt-1 text-xs text-ink-muted">
                      {formatINR(r.annualSpend)} × {formatPercent(r.effectiveRate)} = {formatINR(r.annualSpend * r.effectiveRate)}
                      {r.capReductionValue > 0 ? ` · capped to ${formatINR(r.rewardValue)}` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-muted">{r.note}</p>
                  )}
                  {r.ruleRaw ? <p className="mt-1 text-xs text-ink-muted">Rule applied: &ldquo;{r.ruleRaw}&rdquo;{r.ruleCondition ? ` (${r.ruleCondition})` : ''}</p> : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold">Adjustments</h4>
            <ul className="mt-2 space-y-1 text-ink-muted">
              {rows.filter((r) => r.capReductionValue > 0).map((r) => (
                <li key={r.category} className="flex justify-between gap-4">
                  <span>Reward cap — {r.capRaw}</span>
                  <span className="num">−{formatINR(r.capReductionValue)}</span>
                </li>
              ))}
              {rows.filter((r) => r.excluded).map((r) => (
                <li key={r.category} className="flex justify-between gap-4">
                  <span>Excluded category — {CATEGORY_LABELS[r.category]}</span><span className="num">{formatINR(0)}</span>
                </li>
              ))}
              {valuation.forexCost > 0 ? (
                <li className="flex justify-between gap-4">
                  <span>Forex markup at {valuation.forexMarkup?.toFixed(2)}% on international spend</span>
                  <span className="num">−{formatINR(valuation.forexCost)}</span>
                </li>
              ) : null}
              {rows.every((r) => r.capReductionValue === 0 && !r.excluded) && valuation.forexCost === 0 ? (
                <li>No caps, exclusions or forex costs apply to your profile on this card.</li>
              ) : null}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold">Fees</h4>
            <ul className="mt-2 space-y-1 text-ink-muted">
              <li className="flex justify-between gap-4"><span>Annual fee</span><span className="num">{formatINR(valuation.annualFee)}</span></li>
              <li className="flex justify-between gap-4"><span>Fee waiver</span><span>{valuation.feeWaived ? 'Yes' : 'No'}</span></li>
              <li className="text-xs">{valuation.feeWaiverReason}</li>
              {valuation.joiningFee > 0 ? <li className="flex justify-between gap-4"><span>One-time joining fee (year one)</span><span className="num">{formatINR(valuation.joiningFee)}</span></li> : null}
            </ul>
          </div>

          <div className="rounded-lg border border-line p-3">
            <div className="flex justify-between gap-4 font-semibold">
              <span>Estimated annual value</span>
              <span className="num">{formatINR(valuation.netAnnualValue)}</span>
            </div>
            <p className="num mt-1 text-xs text-ink-muted">
              {formatINR(valuation.annualRewardValue)} rewards − {formatINR(valuation.annualFeeAfterWaiver)} fee − {formatINR(valuation.forexCost)} forex
            </p>
            {valuation.joiningFee > 0 ? (
              <p className="num mt-1 text-xs text-ink-muted">
                Year one also carries the {formatINR(valuation.joiningFee)} joining fee → {formatINR(valuation.firstYearValue)}
              </p>
            ) : null}
            {valuation.hasUnmonetizableRewards ? (
              <p className="mt-2 text-xs text-amber-700">
                Some rewards on this card could not be converted to rupees from verified sources, so they are not included above.
              </p>
            ) : null}
            {valuation.dataCaveats.length > 0 ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-xs font-semibold text-amber-800">How far to trust this estimate</p>
                <ul className="mt-1 space-y-1 text-xs text-amber-700">
                  {valuation.dataCaveats.map((c) => <li key={c}>· {c}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
