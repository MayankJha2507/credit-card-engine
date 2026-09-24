import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AnalyticsView } from '@/components/analytics-view';
import { CardVisual } from '@/components/cards/card-visual';
import { OfficialLink } from '@/components/recommendations/official-link';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { effectiveRate } from '@/lib/calculations/engine';
import { getAllCards, getCardBySlug } from '@/lib/data/repository';
import { CATEGORY_LABELS, loungeVisitsLabel, type CardRule } from '@/lib/data/types';
import { formatDate, formatINR, formatPercent } from '@/lib/utils';

export const dynamicParams = true;

/** Card pages are generated from the database — nothing here is hard-coded. */
export async function generateStaticParams() {
  const entries = await getAllCards();
  return entries.map((e) => ({ issuer: e.card.issuerSlug, slug: e.card.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ issuer: string; slug: string }> }): Promise<Metadata> {
  const { issuer, slug } = await params;
  const entry = await getCardBySlug(issuer, slug);
  if (!entry) return { title: 'Card not found' };
  const { card } = entry;
  const fee = card.annualFee === 0 ? 'no annual fee' : `${formatINR(card.annualFee ?? 0)} annual fee`;
  return {
    title: `${card.name} — ${card.issuer}`,
    description: `${card.name} from ${card.issuer}: ${fee}, ${card.baseRewardRateRaw ?? 'reward structure'}, forex markup ${card.forexMarkup?.toFixed(2) ?? '—'}%. Terms last verified ${formatDate(card.lastVerifiedAt)}.`,
    alternates: { canonical: `/cards/${card.issuerSlug}/${card.slug}` },
  };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-0 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-sm sm:col-span-2">{value ?? '—'}</dd>
    </div>
  );
}

function ruleLine(r: CardRule, pointValue: number | null) {
  const rate = effectiveRate(r, pointValue);
  return (
    <li key={r.id} className="rounded-lg bg-canvas p-3 text-sm">
      <div className="font-medium">{r.raw}</div>
      <div className="mt-1 text-xs text-ink-muted">
        {r.categories.length ? `Applies to: ${r.categories.map((c) => CATEGORY_LABELS[c]).join(', ')}. ` : ''}
        {rate !== null ? `Effective rate at the stated redemption value: ${formatPercent(rate)}. ` : ''}
        {r.condition ? `Condition: ${r.condition}. ` : ''}
        {r.cap ? `Cap: ${r.cap.raw}. ` : ''}
        {r.notes ?? ''}
      </div>
    </li>
  );
}

export default async function CardDetailPage({ params }: { params: Promise<{ issuer: string; slug: string }> }) {
  const { issuer, slug } = await params;
  const entry = await getCardBySlug(issuer, slug);
  if (!entry) notFound();

  const { card, rules, sources } = entry;
  const pointValue = rules.find((r) => r.ruleType === 'redemption')?.value ?? null;
  const base = rules.filter((r) => r.ruleType === 'base_reward');
  const accel = rules.filter((r) => r.ruleType === 'accelerated_reward');
  const caps = rules.filter((r) => r.ruleType === 'reward_cap');

  return (
    <div className="container-page py-12">
      <AnalyticsView event="card_detail_viewed" props={{ card: card.name }} />

      <nav className="text-sm text-ink-muted">
        <Link href="/cards" className="hover:text-ink">Cards</Link> <span aria-hidden>/</span> {card.issuer}
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-start gap-5">
          <CardVisual
            issuer={card.issuer} issuerSlug={card.issuerSlug} name={card.name}
            network={card.network} variant={card.variant} cardType={card.cardType} size="lg"
          />
          <div>
          <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">{card.issuer}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{card.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {card.network ? <Badge>{card.network}</Badge> : null}
            {card.variant ? <Badge>{card.variant}</Badge> : null}
            {card.cardType ? <Badge>{card.cardType}</Badge> : null}
            <Badge tone={card.applicationAvailable ? 'positive' : 'warning'}>
              {card.applicationAvailable ? 'Open for applications' : 'Not open for applications'}
            </Badge>
          </div>
          <p className="mt-3 max-w-md text-xs text-ink-muted">
            Card artwork shown is a generated representation, not the issuer&apos;s own image.
          </p>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <OfficialLink
            url={sources.find((s) => s.sourceType === 'issuer_official')?.sourceUrl ?? sources[0]?.sourceUrl ?? null}
            issuer={card.issuer}
            cardName={card.name}
            label={`Go to ${card.issuer}`}
          />
          <ButtonLink href="/recommend" variant="secondary">See if it fits your spending</ButtonLink>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="surface-card p-6">
            <h2 className="font-semibold">Fees</h2>
            <dl className="mt-3">
              <Row label="Joining fee" value={formatINR(card.joiningFee ?? 0)} />
              <Row label="Annual fee" value={formatINR(card.annualFee ?? 0)} />
              <Row label="Fee waiver" value={card.annualFeeWaiverCondition ?? 'No waiver condition recorded'} />
              <Row label="Forex markup" value={card.forexMarkup === null ? 'Not recorded' : `${card.forexMarkup.toFixed(2)}%`} />
              <Row label="Dynamic currency conversion" value={card.dccMarkup} />
            </dl>
          </section>

          <section className="surface-card p-6">
            <h2 className="font-semibold">Reward structure</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Raw terms as published. Effective rates are derived from them and the card&apos;s stated redemption value
              {pointValue !== null ? ` (${card.redemptionRatioRaw})` : ' — which this card does not state in rupees, so no rate can be derived'}.
            </p>
            <h3 className="mt-4 text-sm font-semibold">Base earn rate</h3>
            <ul className="mt-2 space-y-2">{base.map((r) => ruleLine(r, pointValue))}</ul>
            {accel.length ? (
              <>
                <h3 className="mt-5 text-sm font-semibold">Accelerated rewards</h3>
                <ul className="mt-2 space-y-2">{accel.map((r) => ruleLine(r, pointValue))}</ul>
              </>
            ) : null}
            {caps.length ? (
              <>
                <h3 className="mt-5 text-sm font-semibold">Caps</h3>
                <ul className="mt-2 space-y-1 text-sm text-ink-muted">{caps.map((r) => <li key={r.id}>· {r.raw}</li>)}</ul>
              </>
            ) : null}
            {caps.some((r) => r.value === null) ? (
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                This card states a cap without an amount we can apply, so any reward estimate for it is an upper bound.
              </p>
            ) : null}
            <h3 className="mt-5 text-sm font-semibold">Exclusions</h3>
            <p className="mt-1 text-sm text-ink-muted">{card.rewardExclusionsRaw ?? 'None recorded'}</p>
            <h3 className="mt-5 text-sm font-semibold">Redemption</h3>
            <p className="mt-1 text-sm text-ink-muted">{card.redemptionRatioRaw ?? 'Not recorded'}{card.redemptionOptions ? ` · ${card.redemptionOptions}` : ''}</p>
          </section>

          <section className="surface-card p-6">
            <h2 className="font-semibold">Lounge access</h2>
            <dl className="mt-3">
              <Row label="Domestic" value={<>{card.domesticLounge ?? 'Not recorded'}{loungeVisitsLabel(card.domesticLoungeVisits) ? <span className="text-ink-muted"> · {loungeVisitsLabel(card.domesticLoungeVisits)}</span> : null}</>} />
              <Row label="International" value={<>{card.internationalLounge ?? 'Not recorded'}{loungeVisitsLabel(card.internationalLoungeVisits) ? <span className="text-ink-muted"> · {loungeVisitsLabel(card.internationalLoungeVisits)}</span> : null}</>} />
              <Row label="Programme" value={card.loungeProgram} />
              <Row label="Spend condition" value={card.loungeSpendCondition} />
            </dl>
            <p className="mt-3 text-xs text-ink-muted">We show lounge access as a benefit and never convert it into a rupee value.</p>
          </section>

          <section className="surface-card p-6">
            <h2 className="font-semibold">Benefits</h2>
            <dl className="mt-3">
              <Row label="Welcome" value={card.welcomeBenefit} />
              <Row label="Milestones" value={card.milestoneBenefits} />
              <Row label="Travel" value={card.travelBenefits} />
              <Row label="Dining" value={card.diningBenefits} />
              <Row label="Other" value={card.otherBenefits} />
            </dl>
          </section>

          <section className="surface-card p-6">
            <h2 className="font-semibold">Eligibility</h2>
            <dl className="mt-3">
              <Row label="Minimum income" value={card.minimumIncome ? `${formatINR(card.minimumIncome)} per month` : 'Not recorded'} />
              <Row label="Age" value={card.ageLimit} />
              <Row label="Employment / location" value={card.eligibility} />
              <Row label="Existing relationship" value={card.relationshipRequirement} />
              <Row label="Credit score" value={card.creditScoreRequirement} />
            </dl>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="surface-card p-6">
            <h2 className="font-semibold">Data freshness</h2>
            <dl className="mt-3">
              <Row label="Last verified" value={formatDate(card.lastVerifiedAt)} />
              <Row label="Confidence" value={card.dataConfidence} />
              <Row label="Research status" value={card.researchStatus} />
              <Row label="Active" value={card.activeStatus ? 'Yes' : 'No'} />
            </dl>
            {card.notes ? <p className="mt-3 text-xs text-ink-muted">{card.notes}</p> : null}
          </section>

          <section className="surface-card p-6">
            <h2 className="font-semibold">Sources</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {sources.length === 0 ? <li className="text-ink-muted">No source recorded.</li> : null}
              {sources.map((s) => (
                <li key={s.id}>
                  <a href={s.sourceUrl} target="_blank" rel="noreferrer nofollow" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                    {s.sourceTitle}
                  </a>
                  <p className="mt-1 text-xs text-ink-muted">
                    {s.reliabilityTier} · accessed {formatDate(s.accessedAt)} · covers {s.fieldsCovered.join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
