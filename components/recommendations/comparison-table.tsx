'use client';
import Link from 'next/link';
import type { ScoredCard } from '@/lib/recommendations/engine';
import { CardVisual } from '@/components/cards/card-visual';
import { OfficialLink } from './official-link';
import { CATEGORY_LABELS, loungeVisitsLabel } from '@/lib/data/types';
import { cn, formatDate, formatINR } from '@/lib/utils';

/**
 * Side-by-side comparison of the matches.
 *
 * Rows where every card says the same thing are dimmed, so what is actually
 * different stands out. Numeric rows carry a "best" marker only where better is
 * objectively defined (more value, lower cost) — never an overall winner.
 */

type Better = 'higher' | 'lower' | null;

interface Row {
  label: string;
  group: string;
  better: Better;
  /** Comparable number for the marker; null when the row is not numeric. */
  num: (m: ScoredCard) => number | null;
  render: (m: ScoredCard) => React.ReactNode;
  /** Raw string used to decide whether the row differs at all. */
  key: (m: ScoredCard) => string;
}

function topCategories(m: ScoredCard) {
  const earning = m.valuation.categories.filter((c) => c.rewardValue > 0).sort((a, b) => b.rewardValue - a.rewardValue).slice(0, 2);
  if (earning.length === 0) return '—';
  return earning.map((c) => `${CATEGORY_LABELS[c.category]} ${formatINR(c.rewardValue)}`).join(' · ');
}

const ROWS: Row[] = [
  {
    group: 'Value for your spending', label: 'Estimated annual rewards', better: 'higher',
    num: (m) => m.valuation.annualRewardValue,
    key: (m) => String(m.valuation.annualRewardValue),
    render: (m) => (m.valuation.hasUnmonetizableRewards && m.valuation.annualRewardValue === 0 ? 'Not valued' : formatINR(m.valuation.annualRewardValue)),
  },
  {
    group: 'Value for your spending', label: 'Estimated net annual value', better: 'higher',
    num: (m) => m.valuation.netAnnualValue,
    key: (m) => String(m.valuation.netAnnualValue),
    render: (m) => <span className="font-semibold text-emerald-700">{formatINR(m.valuation.netAnnualValue)}</span>,
  },
  {
    group: 'Value for your spending', label: 'Where it earns most', better: null,
    num: () => null, key: topCategories, render: topCategories,
  },
  {
    group: 'Fees', label: 'Annual fee', better: 'lower',
    num: (m) => m.valuation.annualFee, key: (m) => String(m.valuation.annualFee),
    render: (m) => formatINR(m.valuation.annualFee),
  },
  {
    group: 'Fees', label: 'Fee you would pay', better: 'lower',
    num: (m) => m.valuation.annualFeeAfterWaiver, key: (m) => String(m.valuation.annualFeeAfterWaiver),
    render: (m) => (
      <>
        {formatINR(m.valuation.annualFeeAfterWaiver)}
        {m.valuation.feeWaived && m.valuation.annualFee > 0 ? <span className="block text-xs text-emerald-700">waived at your spend</span> : null}
      </>
    ),
  },
  {
    group: 'Fees', label: 'Joining fee (year one)', better: 'lower',
    num: (m) => m.valuation.joiningFee, key: (m) => String(m.valuation.joiningFee),
    render: (m) => formatINR(m.valuation.joiningFee),
  },
  {
    group: 'Fees', label: 'Fee waiver condition', better: null,
    num: () => null, key: (m) => m.card.annualFeeWaiverCondition ?? '—',
    render: (m) => <span className="text-xs">{m.card.annualFeeWaiverCondition ?? '—'}</span>,
  },
  {
    group: 'International', label: 'Forex markup', better: 'lower',
    num: (m) => m.card.forexMarkup ?? null, key: (m) => String(m.card.forexMarkup),
    render: (m) => (m.card.forexMarkup === null ? 'Not recorded' : `${m.card.forexMarkup.toFixed(2)}%`),
  },
  {
    group: 'International', label: 'Forex cost on your spending', better: 'lower',
    num: (m) => m.valuation.forexCost, key: (m) => String(m.valuation.forexCost),
    render: (m) => (m.valuation.forexCost === 0 ? '₹0' : `−${formatINR(m.valuation.forexCost)}`),
  },
  {
    group: 'Lounge', label: 'Domestic lounge', better: null,
    num: () => null, key: (m) => m.card.domesticLounge ?? '—',
    render: (m) => <span className="text-xs">{loungeVisitsLabel(m.card.domesticLoungeVisits) ?? m.card.domesticLounge ?? 'Not recorded'}</span>,
  },
  {
    group: 'Lounge', label: 'International lounge', better: null,
    num: () => null, key: (m) => m.card.internationalLounge ?? '—',
    render: (m) => <span className="text-xs">{loungeVisitsLabel(m.card.internationalLoungeVisits) ?? m.card.internationalLounge ?? 'Not recorded'}</span>,
  },
  {
    group: 'Lounge', label: 'Lounge condition', better: null,
    num: () => null, key: (m) => m.card.loungeSpendCondition ?? '—',
    render: (m) => <span className="text-xs">{m.card.loungeSpendCondition ?? '—'}</span>,
  },
  {
    group: 'Restrictions', label: 'Excluded from rewards', better: null,
    num: () => null, key: (m) => m.card.rewardExclusionsRaw ?? '—',
    render: (m) => <span className="text-xs">{m.card.rewardExclusionsRaw ?? 'None recorded'}</span>,
  },
  {
    group: 'Restrictions', label: 'Reward caps', better: null,
    num: () => null, key: (m) => m.card.rewardCapsRaw ?? '—',
    render: (m) => <span className="text-xs">{m.card.rewardCapsRaw ?? 'None recorded'}</span>,
  },
  {
    group: 'Restrictions', label: 'Eligibility', better: null,
    num: () => null, key: (m) => `${m.card.minimumIncome}${m.card.relationshipRequirement}`,
    render: (m) => (
      <span className="text-xs">
        {m.card.minimumIncome ? `${formatINR(m.card.minimumIncome)}/month income` : 'Income not recorded'}
        {m.card.relationshipRequirement ? ` · ${m.card.relationshipRequirement}` : ''}
      </span>
    ),
  },
  {
    group: 'Data', label: 'Last verified', better: null,
    num: () => null, key: (m) => m.card.lastVerifiedAt ?? '—',
    render: (m) => <span className="text-xs">{formatDate(m.card.lastVerifiedAt)}</span>,
  },
];

export function ComparisonTable({ matches }: { matches: ScoredCard[] }) {
  const groups = [...new Set(ROWS.map((r) => r.group))];

  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Side-by-side comparison of your strongest matches</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-44 bg-canvas p-3 text-left align-bottom text-xs font-medium uppercase tracking-wide text-ink-muted">
              Compared on your spending
            </th>
            {matches.map((m, i) => (
              <th key={m.card.id} scope="col" className="surface-card p-4 text-left align-bottom" style={{ width: `${70 / matches.length}%` }}>
                <CardVisual
                  issuer={m.card.issuer} issuerSlug={m.card.issuerSlug} name={m.card.name}
                  network={m.card.network} variant={m.card.variant} cardType={m.card.cardType} size="sm"
                />
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Match {i + 1} · {m.card.issuer}</p>
                <p className="mt-0.5 font-semibold leading-tight">{m.card.name}</p>
                <div className="mt-3 flex flex-col gap-1.5">
                  <OfficialLink url={m.officialUrl} issuer={m.card.issuer} cardName={m.card.name} variant="inline" label="Official site" />
                  <Link href={`/cards/${m.card.issuerSlug}/${m.card.slug}`} className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                    Full card details
                  </Link>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {groups.map((group) => (
          <tbody key={group}>
            <tr>
              <th scope="colgroup" colSpan={matches.length + 1} className="pb-1 pt-6 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {group}
              </th>
            </tr>
            {ROWS.filter((r) => r.group === group).map((row) => {
              const keys = matches.map(row.key);
              const identical = new Set(keys).size === 1;
              const nums = matches.map(row.num);
              const comparable = nums.filter((n): n is number => n !== null);
              const best = row.better && comparable.length === matches.length && new Set(comparable).size > 1
                ? (row.better === 'higher' ? Math.max(...comparable) : Math.min(...comparable))
                : null;

              return (
                <tr key={row.label} className={cn(identical && 'opacity-55')}>
                  <th scope="row" className="sticky left-0 z-10 bg-canvas p-3 text-left align-top font-normal text-ink-muted">
                    {row.label}
                    {identical ? <span className="block text-[10px] uppercase tracking-wide text-ink-muted/70">same on all</span> : null}
                  </th>
                  {matches.map((m, i) => {
                    const isBest = best !== null && nums[i] === best;
                    return (
                      <td key={m.card.id} className={cn('num border-b border-line p-3 align-top', isBest && 'bg-emerald-50/70')}>
                        {row.render(m)}
                        {isBest ? (
                          <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                            {row.better === 'higher' ? 'Highest here' : 'Lowest here'}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>

      <p className="mt-4 text-xs text-ink-muted">
        Markers point out the highest or lowest figure in a single row — they are not an overall ranking.
        Rows where all three cards are identical are dimmed. Lounge access and other benefits are never given a rupee value.
      </p>
    </div>
  );
}
