'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { BrowseRow } from './browse-rows';
import { CardVisual } from './card-visual';
import { formatDate, formatINR, formatPercent, cn } from '@/lib/utils';
import { track } from '@/lib/analytics';

type Sort = 'annual_fee' | 'base_rate' | 'recently_verified';

const FEE_FILTERS = [
  { key: 'any', label: 'Any fee', test: () => true },
  { key: 'zero', label: '₹0', test: (r: BrowseRow) => r.annualFee === 0 },
  { key: 'under5k', label: 'Under ₹5,000', test: (r: BrowseRow) => r.annualFee < 5000 },
  { key: 'over5k', label: '₹5,000+', test: (r: BrowseRow) => r.annualFee >= 5000 },
] as const;

const FEATURES = [
  { key: 'cashback', label: 'Cashback', test: (r: BrowseRow) => r.cashback },
  { key: 'rewards', label: 'Rewards', test: (r: BrowseRow) => r.rewards },
  { key: 'travel', label: 'Travel', test: (r: BrowseRow) => r.travel },
  { key: 'lounge', label: 'Lounge', test: (r: BrowseRow) => r.lounge },
  { key: 'forex', label: 'Low forex (≤2%)', test: (r: BrowseRow) => r.forexMarkup !== null && r.forexMarkup <= 2 },
] as const;

function Toggle({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('rounded-lg border px-3 py-1.5 text-sm transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-muted hover:bg-canvas')}>
      {children}
    </button>
  );
}

export function BrowseCards({ rows }: { rows: BrowseRow[] }) {
  const [issuer, setIssuer] = useState('all');
  const [tier, setTier] = useState('all');
  const [fee, setFee] = useState<(typeof FEE_FILTERS)[number]['key']>('any');
  const [features, setFeatures] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('annual_fee');

  const issuers = useMemo(() => [...new Set(rows.map((r) => r.issuer))].sort(), [rows]);
  const tiers = useMemo(() => [...new Set(rows.map((r) => r.variant).filter(Boolean))].sort() as string[], [rows]);

  const visible = useMemo(() => {
    const feeTest = FEE_FILTERS.find((f) => f.key === fee)!.test;
    const out = rows.filter((r) =>
      (issuer === 'all' || r.issuer === issuer) &&
      (tier === 'all' || r.variant === tier) &&
      feeTest(r) &&
      features.every((f) => FEATURES.find((x) => x.key === f)!.test(r)));
    return out.sort((a, b) => {
      if (sort === 'annual_fee') return a.annualFee - b.annualFee || a.name.localeCompare(b.name);
      if (sort === 'base_rate') return (b.baseRate ?? -1) - (a.baseRate ?? -1) || a.name.localeCompare(b.name);
      return (b.lastVerifiedAt ?? '').localeCompare(a.lastVerifiedAt ?? '') || a.name.localeCompare(b.name);
    });
  }, [rows, issuer, tier, fee, features, sort]);

  return (
    <div>
      <div className="surface-card mt-8 space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <select value={issuer} onChange={(e) => setIssuer(e.target.value)} aria-label="Filter by issuer"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none">
            <option value="all">All issuers</option>
            {issuers.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by card tier"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none">
            <option value="all">All tiers</option>
            {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort cards"
            className="ml-auto rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none">
            <option value="annual_fee">Sort: annual fee</option>
            <option value="base_rate">Sort: estimated base reward rate</option>
            <option value="recently_verified">Sort: recently verified</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {FEE_FILTERS.map((f) => <Toggle key={f.key} active={fee === f.key} onClick={() => setFee(f.key)}>{f.label}</Toggle>)}
          <span aria-hidden className="mx-1 w-px bg-line" />
          {FEATURES.map((f) => (
            <Toggle key={f.key} active={features.includes(f.key)}
              onClick={() => setFeatures((s) => s.includes(f.key) ? s.filter((x) => x !== f.key) : [...s, f.key])}>
              {f.label}
            </Toggle>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-muted">{visible.length} of {rows.length} cards</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {visible.map((r) => (
          <Link key={r.id} href={`/cards/${r.issuerSlug}/${r.slug}`} onClick={() => track('card_detail_viewed', { card: r.name, from: 'browse' })}
            className="surface-card block p-5 transition-shadow hover:shadow-lift">
            <div className="flex gap-4">
              <CardVisual
                issuer={r.issuer} issuerSlug={r.issuerSlug} name={r.name}
                network={r.network} variant={r.variant} cardType={r.cardType} size="sm"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{r.issuer}</p>
                <h3 className="mt-1 font-semibold">{r.name}</h3>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.variant ? <Badge>{r.variant}</Badge> : null}
              {r.lounge ? <Badge>Lounge</Badge> : null}
              {r.cashback ? <Badge>Cashback</Badge> : null}
              {r.rewards ? <Badge>Reward points</Badge> : null}
              {r.forexMarkup !== null && r.forexMarkup <= 2 ? <Badge tone="brand">{r.forexMarkup.toFixed(2)}% forex</Badge> : null}
            </div>
            <dl className="num mt-4 grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs text-ink-muted">Annual fee</dt><dd className="font-medium">{formatINR(r.annualFee)}</dd></div>
              <div><dt className="text-xs text-ink-muted">Base rate</dt><dd className="font-medium">{r.baseRate === null ? '—' : formatPercent(r.baseRate)}</dd></div>
              <div><dt className="text-xs text-ink-muted">Verified</dt><dd className="font-medium">{formatDate(r.lastVerifiedAt)}</dd></div>
            </dl>
          </Link>
        ))}
      </div>
    </div>
  );
}
