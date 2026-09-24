'use client';
import Link from 'next/link';
import type { ScoredCard } from '@/lib/recommendations/engine';
import { CardVisual } from '@/components/cards/card-visual';
import { OfficialLink } from './official-link';
import { formatINR } from '@/lib/utils';

/**
 * Cards that match something the user asked for but whose rewards cannot be
 * valued from the source data. They are shown apart from the ranked matches
 * because ranking them would mean inventing the number that is missing.
 */
export function UnvaluedMatches({ cards }: { cards: ScoredCard[] }) {
  if (cards.length === 0) return null;

  return (
    <section className="mt-10">
      <h3 className="text-lg font-semibold tracking-tight">Also worth knowing</h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        These match what you asked for, but their reward rates are not stated precisely enough in our sources to
        calculate a value — so we can&apos;t rank them against the cards above rather than guess.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {cards.map((m) => {
          const matched = m.preferenceMatches.filter((p) => p.matched);
          return (
            <div key={m.card.id} className="surface-card p-5">
              <div className="flex gap-3">
                <CardVisual
                  issuer={m.card.issuer} issuerSlug={m.card.issuerSlug} name={m.card.name}
                  network={m.card.network} variant={m.card.variant} cardType={m.card.cardType}
                  size="sm" showName={false}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{m.card.issuer}</p>
                  <h4 className="mt-0.5 font-semibold leading-tight">{m.card.name}</h4>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm text-ink-muted">
                {matched.slice(0, 3).map((p) => (
                  <li key={p.priority} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{p.label}: {p.evidence}</span>
                  </li>
                ))}
              </ul>

              <dl className="num mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-ink-muted">Annual fee</dt><dd className="font-medium">{formatINR(m.card.annualFee ?? 0)}</dd></div>
                <div><dt className="text-xs text-ink-muted">Forex markup</dt><dd className="font-medium">{m.card.forexMarkup === null ? '—' : `${m.card.forexMarkup.toFixed(2)}%`}</dd></div>
              </dl>

              <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                Why we can&apos;t value it: the earn rate is published as
                {' '}&ldquo;{m.card.baseRewardRateRaw}&rdquo;, with no absolute rate to anchor it.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={`/cards/${m.card.issuerSlug}/${m.card.slug}`} className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
                  Card details
                </Link>
                <OfficialLink url={m.officialUrl} issuer={m.card.issuer} cardName={m.card.name} variant="inline" label="Official site" />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
