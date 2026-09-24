import { ButtonLink } from '@/components/ui/button';
import { AnalyticsView } from '@/components/analytics-view';
import { getDataFreshness } from '@/lib/data/repository';
import { formatDate } from '@/lib/utils';

export default async function LandingPage() {
  const { researchedCount, latestVerified } = await getDataFreshness();

  return (
    <>
      <AnalyticsView event="landing_page_view" />

      <section className="container-page pt-16 sm:pt-24">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-600">India · credit cards</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Find the credit card that fits how you spend.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-muted">
            Tell us roughly where your money goes. We&apos;ll compare cards based on rewards, fees,
            travel benefits, lounge access and forex.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/recommend" size="lg">Find my card</ButtonLink>
            <ButtonLink href="/cards" variant="secondary" size="lg">Browse cards</ButtonLink>
          </div>
          <p className="mt-6 text-sm text-ink-muted">
            No account, no bank connection, no statement upload. Just approximate monthly spending.
          </p>
        </div>
      </section>

      <section className="container-page mt-16 grid gap-4 sm:grid-cols-3">
        {[
          { t: 'Calculated, not guessed', d: 'Every figure comes from published card terms — earn rates, caps, exclusions and fee waivers — applied to your numbers.' },
          { t: 'You can check the maths', d: 'Each recommendation opens up into the full calculation: spend by category, the rate applied, caps deducted, fees and waivers.' },
          { t: 'Nothing invented', d: 'Lounge access and lifestyle perks are shown as benefits, never converted into a rupee figure to flatter a card.' },
        ].map((f) => (
          <div key={f.t} className="surface-card p-6">
            <h2 className="font-semibold">{f.t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.d}</p>
          </div>
        ))}
      </section>

      <section className="container-page mt-16">
        <div className="surface-card flex flex-col gap-2 p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            Currently analyzing <strong className="font-semibold text-ink">{researchedCount} verified cards</strong>. More cards are being added.
          </p>
          <p className="text-sm text-ink-muted">Card data last verified {formatDate(latestVerified)}</p>
        </div>
      </section>

      <section className="container-page mt-16">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4">
          {['Tell us how you spend', 'Choose what matters', 'We calculate', 'See your strongest matches'].map((s, i) => (
            <li key={s} className="surface-card p-5">
              <span className="num text-xs font-semibold text-brand-600">Step {i + 1}</span>
              <p className="mt-1 text-sm font-medium">{s}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
