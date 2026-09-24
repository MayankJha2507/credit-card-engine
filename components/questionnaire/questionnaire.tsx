'use client';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ResultCard } from '@/components/recommendations/result-card';
import type { FeeBand, LoungeImportance, Priority, UserProfile } from '@/lib/calculations/types';
import type { ScoredCard } from '@/lib/recommendations/engine';
import type { SpendCategory } from '@/lib/data/types';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { ComparisonTable } from '@/components/recommendations/comparison-table';
import { AnswerSummary } from './answer-summary';
import { PreferencesStep } from './preferences-step';
import { SpendStep } from './spend-step';

type Step = 0 | 1 | 2;

interface ApiResult {
  matches: ScoredCard[];
  considered: number;
  poolSize: number;
  databaseSize: number;
  loungeFilterApplied: boolean;
}

const STEP_LABELS = ['Your spending', 'What matters', 'Your matches'];

export function Questionnaire({ researchedCount }: { researchedCount: number }) {
  const [step, setStep] = useState<Step>(0);
  const [started, setStarted] = useState(false);
  const [spend, setSpend] = useState<Partial<Record<SpendCategory, number>>>({});
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [feeBand, setFeeBand] = useState<FeeBand>('any');
  const [internationalTravel, setInternationalTravel] = useState(false);
  const [loungeImportance, setLoungeImportance] = useState<LoungeImportance>('nice_to_have');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'cards' | 'compare'>('cards');
  const [error, setError] = useState<string | null>(null);

  /** Clears every answer and the results, back to an empty first step. */
  function reset() {
    setSpend({});
    setPriorities([]);
    setFeeBand('any');
    setInternationalTravel(false);
    setLoungeImportance('nice_to_have');
    setResult(null);
    setError(null);
    setView('cards');
    setStep(0);
  }

  const markStarted = () => {
    if (!started) { setStarted(true); track('questionnaire_started'); }
  };

  async function calculate(overrides: Partial<UserProfile> = {}) {
    setLoading(true);
    setError(null);
    const profile: UserProfile = { spend, priorities, feeBand, internationalTravel, loungeImportance, ...overrides };
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error('We could not calculate recommendations. Please try again.');
      const data = (await res.json()) as ApiResult;
      setResult(data);
      setView('cards');
      setStep(2);
      track('questionnaire_completed', { priorities: priorities.length, feeBand, internationalTravel });
      track('recommendation_viewed', { matches: data.matches.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page py-12">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEP_LABELS.map((label, i) => {
          // A step is reachable once it has been reached; the results step stays
          // reachable after a calculation, so editing an answer never loses them.
          const reachable = i < step || (i === 2 && result !== null) || i === step;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => reachable && setStep(i as Step)}
                disabled={!reachable}
                aria-current={i === step ? 'step' : undefined}
                className={cn('flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors',
                  reachable && i !== step && 'hover:bg-canvas', !reachable && 'cursor-default')}
              >
                <span className={cn('num grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
                  i <= step || (i === 2 && result) ? 'bg-ink text-white' : 'bg-line text-ink-muted')}>{i + 1}</span>
                <span className={cn(i === step ? 'font-medium text-ink' : 'text-ink-muted')}>{label}</span>
              </button>
              {i < STEP_LABELS.length - 1 ? <span aria-hidden className="mx-1 h-px w-6 bg-line sm:w-10" /> : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-10">
        {step === 0 ? (
          <div onFocusCapture={markStarted} onPointerDown={markStarted}>
            <SpendStep spend={spend} onChange={setSpend} />
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => setStep(1)}>Continue</Button>
              {result ? (
                <>
                  <Button size="lg" variant="secondary" onClick={() => calculate()} disabled={loading}>
                    {loading ? 'Recalculating…' : 'Recalculate now'}
                  </Button>
                  <Button size="lg" variant="ghost" onClick={() => setStep(2)}>Back to my matches</Button>
                </>
              ) : (
                <ButtonLink href="/cards" variant="ghost" size="lg">Browse all cards instead</ButtonLink>
              )}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <PreferencesStep
              priorities={priorities} internationalTravel={internationalTravel} loungeImportance={loungeImportance}
              onChange={(patch) => {
                if (patch.priorities) setPriorities(patch.priorities);
                if (patch.internationalTravel !== undefined) setInternationalTravel(patch.internationalTravel);
                if (patch.loungeImportance) setLoungeImportance(patch.loungeImportance);
              }}
            />
            {error ? <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => calculate()} disabled={loading}>
                {loading ? 'Calculating…' : result ? 'Recalculate' : 'Calculate'}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setStep(0)}>Back to spending</Button>
              {result ? <Button size="lg" variant="ghost" onClick={() => setStep(2)}>Back to my matches</Button> : null}
            </div>
          </div>
        ) : null}

        {step === 2 && result ? (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Your strongest matches</h2>
                <p className="mt-2 max-w-xl text-sm text-ink-muted">
                  Based on your inputs and the {result.poolSize} verified cards we compared. Recommendations are based on
                  cards currently available in our database, not the whole Indian card market.
                </p>
                <ul className="mt-2 max-w-xl space-y-1 text-xs text-ink-muted">
                  {result.loungeFilterApplied ? (
                    <li>You said lounge access is important, so cards without it were left out.</li>
                  ) : null}
                  {result.matches.some((m) => m.valuation.isUpperBound) ? (
                    <li>
                      Figures marked &ldquo;up to&rdquo; come from cards that state a reward cap without an amount — those are
                      upper bounds, not estimates. Open the calculation on a card to see what limits it.
                    </li>
                  ) : null}
                </ul>
              </div>

              {result.matches.length > 1 ? (
                <div className="flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Result view">
                  <button
                    type="button"
                    onClick={() => setView('cards')}
                    aria-pressed={view === 'cards'}
                    className={cn('rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      view === 'cards' ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink')}
                  >
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setView('compare');
                      track('comparison_started', { cards: result.matches.length });
                    }}
                    aria-pressed={view === 'compare'}
                    className={cn('rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      view === 'compare' ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink')}
                  >
                    Compare all {result.matches.length}
                  </button>
                </div>
              ) : null}
            </div>

            <AnswerSummary
              spend={spend} priorities={priorities} feeBand={feeBand}
              internationalTravel={internationalTravel} loungeImportance={loungeImportance}
              onEditSpending={() => setStep(0)} onEditPreferences={() => setStep(1)}
              onReset={reset}
              onFeeBandChange={(b) => { setFeeBand(b); void calculate({ feeBand: b }); }}
              refining={loading}
            />

            {result.matches.length === 0 ? (
              <p className="mt-8 surface-card p-6 text-sm text-ink-muted">
                No card in our database fits those constraints. Try raising the annual fee ceiling, or
                relaxing how important lounge access is.
              </p>
            ) : view === 'compare' ? (
              <ComparisonTable matches={result.matches} />
            ) : (
              <div className="mt-8 space-y-6">
                {result.matches.map((m, i) => <ResultCard key={m.card.id} match={m} rank={i + 1} />)}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setStep(0)}>Edit my spending</Button>
              <Button variant="secondary" onClick={() => setStep(1)}>Edit my preferences</Button>
              <ButtonLink href="/cards" variant="ghost">Browse all {researchedCount} cards</ButtonLink>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
