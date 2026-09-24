'use client';
import Link from 'next/link';
import type { ScoredCard } from '@/lib/recommendations/engine';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatINR } from '@/lib/utils';
import { track } from '@/lib/analytics';
import { CalculationBreakdown } from './calculation-breakdown';
import { loungeVisitsLabel } from '@/lib/data/types';
import { CardVisual } from '@/components/cards/card-visual';
import { OfficialLink } from './official-link';

export function ResultCard({ match, rank }: { match: ScoredCard; rank: number }) {
  const { card, valuation } = match;
  const href = `/cards/${card.issuerSlug}/${card.slug}`;
  const preferenceLed = valuation.netAnnualValue < 0 || match.valueRank > rank;

  return (
    <article className="surface-card p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-4">
          <CardVisual
            issuer={card.issuer} issuerSlug={card.issuerSlug} name={card.name}
            network={card.network} variant={card.variant} cardType={card.cardType}
            size="md" className="hidden sm:block"
          />
          <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{card.issuer}</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{card.name}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {card.variant ? <Badge>{card.variant}</Badge> : null}
            {card.network ? <Badge>{card.network}</Badge> : null}
            {valuation.feeWaived && valuation.annualFee > 0 ? <Badge tone="positive">Fee waived at your spend</Badge> : null}
            {card.annualFee === 0 ? <Badge tone="positive">No annual fee</Badge> : null}
          </div>
          </div>
        </div>
        <Badge tone="brand">Match {rank}</Badge>
      </div>

      <p className="mt-4 text-sm text-ink-muted">
        Apply or read the full terms on the issuer&apos;s own site —{' '}
        <OfficialLink url={match.officialUrl} issuer={card.issuer} cardName={card.name} variant="inline" label={`${card.issuer} official page`} />
      </p>

      {preferenceLed ? (
        <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
          Ranked here because it matches the priorities you selected, not because it returns the most money.
          It ranks #{match.valueRank} on estimated value among the cards we compared.
        </p>
      ) : null}

      <div className="mt-5">
        <h4 className="text-sm font-semibold">Why it fits</h4>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
          {match.reasons.map((r) => (
            <li key={r} className="flex gap-2"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{r}</li>
          ))}
        </ul>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-canvas p-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Est. annual rewards</dt>
          <dd className="num mt-1 text-lg font-semibold">
            {valuation.hasUnmonetizableRewards && valuation.annualRewardValue === 0
              ? 'Not valued'
              : `${valuation.isUpperBound ? 'Up to ' : ''}${formatINR(valuation.annualRewardValue)}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Annual fee</dt>
          <dd className="num mt-1 text-lg font-semibold">{formatINR(valuation.annualFee)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Fee after waiver</dt>
          <dd className="num mt-1 text-lg font-semibold">{formatINR(valuation.annualFeeAfterWaiver)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Est. net annual value</dt>
          <dd className="num mt-1 text-lg font-semibold text-emerald-700">
            {valuation.isUpperBound ? 'Up to ' : ''}{formatINR(valuation.netAnnualValue)}
          </dd>
          {valuation.joiningFee > 0 ? (
            <dd className="num mt-0.5 text-xs text-ink-muted">
              {formatINR(valuation.firstYearValue)} in year one, after the joining fee
            </dd>
          ) : null}
        </div>
      </dl>

      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold">Lounge access</h4>
          <p className="mt-1 text-ink-muted">
            {card.domesticLounge ?? 'Not recorded'}
            {loungeVisitsLabel(card.domesticLoungeVisits) ? ` · ${loungeVisitsLabel(card.domesticLoungeVisits)} domestic` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Shown as a benefit — we do not assign it a rupee value.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Important</h4>
          <ul className="mt-1 space-y-1 text-ink-muted">
            {match.cautions.map((c) => <li key={c}>· {c}</li>)}
          </ul>
        </div>
      </div>

      <CalculationBreakdown valuation={valuation} cardName={card.name} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-ink-muted">Last verified: {formatDate(card.lastVerifiedAt)} · {card.dataConfidence}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href}
            onClick={() => track('recommendation_clicked', { card: card.name, rank })}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-canvas"
          >
            View card details
          </Link>
          <OfficialLink url={match.officialUrl} issuer={card.issuer} cardName={card.name} className="h-10 px-4" label={`Go to ${card.issuer}`} />
        </div>
      </div>
    </article>
  );
}
