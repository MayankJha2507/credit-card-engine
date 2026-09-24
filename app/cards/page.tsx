import type { Metadata } from 'next';
import { AnalyticsView } from '@/components/analytics-view';
import { BrowseCards } from '@/components/cards/browse';
import { toBrowseRows } from '@/components/cards/browse-rows';
import { getAllCards } from '@/lib/data/repository';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Browse credit cards',
  description: 'Every card in our database, with fees, reward rates, lounge access and forex markup taken from published issuer terms.',
};

export default async function CardsPage() {
  const entries = await getAllCards();
  const rows = toBrowseRows(entries);
  const latest = entries.map((e) => e.card.lastVerifiedAt).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="container-page py-12">
      <AnalyticsView event="browse_cards" props={{ count: rows.length }} />
      <h1 className="text-3xl font-semibold tracking-tight">Cards in our database</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Currently analyzing {rows.length} verified cards. More cards are being added. Figures are taken from published
        issuer terms; the base reward rate shown is derived from each card&apos;s stated earn rate and redemption value.
        Last verification {formatDate(latest)}.
      </p>
      <BrowseCards rows={rows} />
    </div>
  );
}
