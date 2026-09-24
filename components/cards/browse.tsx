'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { BrowseRow } from './browse-rows';
import { CardVisual } from './card-visual';
import { formatDate, formatINR, formatPercent, cn } from '@/lib/utils';
import { track } from '@/lib/analytics';

type Sort = 'annual_fee' | 'base_rate' | 'recently_verified' | 'name';

const FEE_FILTERS = [
  { key: 'any', label: 'Any fee', test: () => true },
  { key: 'zero', label: '₹0', test: (r: BrowseRow) => r.annualFee === 0 },
  { key: 'under1k', label: 'Under ₹1,000', test: (r: BrowseRow) => r.annualFee < 1000 },
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

const PAGE = 24;

function Toggle({ active, children, onClick, count }: { active: boolean; children: React.ReactNode; onClick: () => void; count?: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('rounded-lg border px-3 py-1.5 text-sm transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-muted hover:bg-canvas')}>
      {children}
      {count !== undefined ? <span className={cn('num ml-1.5 text-xs', active ? 'text-white/70' : 'text-ink-muted/70')}>{count}</span> : null}
    </button>
  );
}

export function BrowseCards({ rows }: { rows: BrowseRow[] }) {
  const [query, setQuery] = useState('');
  const [issuer, setIssuer] = useState('all');
  const [tier, setTier] = useState('all');
  const [fee, setFee] = useState<(typeof FEE_FILTERS)[number]['key']>('any');
  const [features, setFeatures] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('annual_fee');
  const [layout, setLayout] = useState<'grid' | 'table'>('grid');
  const [shown, setShown] = useState(PAGE);

  // Issuer counts make the shape of a 100-card database visible at a glance.
  const issuers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.issuer, (counts.get(r.issuer) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  const tiers = useMemo(() => [...new Set(rows.map((r) => r.variant).filter(Boolean))].sort() as string[], [rows]);

  const visible = useMemo(() => {
    const feeTest = FEE_FILTERS.find((f) => f.key === fee)!.test;
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) =>
      (q === '' || r.search.includes(q)) &&
      (issuer === 'all' || r.issuer === issuer) &&
      (tier === 'all' || r.variant === tier) &&
      feeTest(r) &&
      features.every((f) => FEATURES.find((x) => x.key === f)!.test(r)));
    return out.sort((a, b) => {
      if (sort === 'annual_fee') return a.annualFee - b.annualFee || a.name.localeCompare(b.name);
      if (sort === 'base_rate') return (b.baseRate ?? -1) - (a.baseRate ?? -1) || a.name.localeCompare(b.name);
      if (sort === 'name') return a.name.localeCompare(b.name);
      return (b.lastVerifiedAt ?? '').localeCompare(a.lastVerifiedAt ?? '') || a.name.localeCompare(b.name);
    });
  }, [rows, query, issuer, tier, fee, features, sort]);

  const page = visible.slice(0, shown);
  const reset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setShown(PAGE); };

  return (
    <div>
      <div className="surface-card mt-8 space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search" value={query} onChange={(e) => reset(setQuery)(e.target.value)}
            placeholder="Search by card, issuer or reward…" aria-label="Search cards"
            className="h-10 min-w-[240px] flex-1 rounded-lg border border-line px-3 text-sm focus:border-ink focus:outline-none"
          />
          <select value={issuer} onChange={(e) => reset(setIssuer)(e.target.value)} aria-label="Filter by issuer"
            className="h-10 rounded-lg border border-line bg-surface px-3 text-sm focus:border-ink focus:outline-none">
            <option value="all">All issuers ({rows.length})</option>
            {issuers.map(([i, n]) => <option key={i} value={i}>{i} ({n})</option>)}
          </select>
          <select value={tier} onChange={(e) => reset(setTier)(e.target.value)} aria-label="Filter by card tier"
            className="h-10 rounded-lg border border-line bg-surface px-3 text-sm focus:border-ink focus:outline-none">
            <option value="all">All tiers</option>
            {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort cards"
            className="h-10 rounded-lg border border-line bg-surface px-3 text-sm focus:border-ink focus:outline-none">
            <option value="annual_fee">Sort: annual fee</option>
            <option value="base_rate">Sort: estimated base reward rate</option>
            <option value="recently_verified">Sort: recently verified</option>
            <option value="name">Sort: name</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FEE_FILTERS.map((f) => <Toggle key={f.key} active={fee === f.key} onClick={() => reset(setFee)(f.key)}>{f.label}</Toggle>)}
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          {FEATURES.map((f) => (
            <Toggle key={f.key} active={features.includes(f.key)} count={rows.filter(f.test).length}
              onClick={() => { setFeatures((s) => s.includes(f.key) ? s.filter((x) => x !== f.key) : [...s, f.key]); setShown(PAGE); }}>
              {f.label}
            </Toggle>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Showing <strong className="num font-semibold text-ink">{page.length}</strong> of {visible.length} matching
          {visible.length !== rows.length ? ` (${rows.length} in the database)` : ' cards'}
        </p>
        <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Layout">
          {(['grid', 'table'] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLayout(l)} aria-pressed={layout === l}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                layout === l ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="surface-card mt-4 p-6 text-sm text-ink-muted">
          No cards match those filters. Try clearing the search or widening the fee range.
        </p>
      ) : layout === 'grid' ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.map((r) => (
            <Link key={r.id} href={`/cards/${r.issuerSlug}/${r.slug}`} onClick={() => track('card_detail_viewed', { card: r.name, from: 'browse' })}
              className="surface-card block p-5 transition-shadow hover:shadow-lift">
              <div className="flex gap-4">
                <CardVisual issuer={r.issuer} issuerSlug={r.issuerSlug} name={r.name} network={r.network} variant={r.variant} cardType={r.cardType} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{r.issuer}</p>
                  <h3 className="mt-1 font-semibold leading-tight">{r.name}</h3>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.variant ? <Badge>{r.variant}</Badge> : null}
                {r.lounge ? <Badge>Lounge</Badge> : null}
                {r.cashback ? <Badge>Cashback</Badge> : null}
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
      ) : (
        <div className="surface-card mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className="p-3 font-medium">Card</th>
                <th scope="col" className="p-3 font-medium">Tier</th>
                <th scope="col" className="p-3 text-right font-medium">Joining</th>
                <th scope="col" className="p-3 text-right font-medium">Annual fee</th>
                <th scope="col" className="p-3 text-right font-medium">Base rate</th>
                <th scope="col" className="p-3 text-right font-medium">Forex</th>
                <th scope="col" className="p-3 font-medium">Lounge</th>
                <th scope="col" className="p-3 font-medium">Verified</th>
              </tr>
            </thead>
            <tbody>
              {page.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="p-3">
                    <Link href={`/cards/${r.issuerSlug}/${r.slug}`} onClick={() => track('card_detail_viewed', { card: r.name, from: 'browse_table' })}
                      className="font-medium hover:underline">{r.name}</Link>
                    <span className="block text-xs text-ink-muted">{r.issuer}</span>
                  </td>
                  <td className="p-3 text-xs text-ink-muted">{r.variant ?? '—'}</td>
                  <td className="num p-3 text-right">{formatINR(r.joiningFee)}</td>
                  <td className="num p-3 text-right">{formatINR(r.annualFee)}</td>
                  <td className="num p-3 text-right">{r.baseRate === null ? '—' : formatPercent(r.baseRate)}</td>
                  <td className="num p-3 text-right">{r.forexMarkup === null ? '—' : `${r.forexMarkup.toFixed(2)}%`}</td>
                  <td className="p-3 text-xs">{r.lounge ? 'Yes' : '—'}</td>
                  <td className="p-3 text-xs text-ink-muted">{formatDate(r.lastVerifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown < visible.length ? (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + PAGE)}
            className="rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-medium hover:bg-canvas">
            Show {Math.min(PAGE, visible.length - shown)} more
          </button>
        </div>
      ) : null}
    </div>
  );
}
