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
import { PreferencesStep } from './preferences-step';
import { SpendStep } from './spend-step';

type Step = 0 | 1 | 2;

interface ApiResult {
  matches: ScoredCard[];
  considered: number;
  poolSize: number;
  databaseSize: number;
}

const STEP_LABELS = ['Your spending', 'What matters', 'Your matches'];

export function Questionnaire({ researchedCount }: { researchedCount: number }) {
  const [step, setStep] = useState<Step>(0);
  const [started, setStarted] = useState(false);
  const [spend, setSpend] = useState<Partial<Record<SpendCategory, number>>>({});
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [feeBand, setFeeBand] = useState<FeeBand>('1k_5k');
  const [internationalTravel, setInternationalTravel] = useState(false);
  const [loungeImportance, setLoungeImportance] = useState<LoungeImportance>('nice_to_have');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'cards' | 'compare'>('cards');
  const [error, setError] = useState<string | null>(null);

  const markStarted = () => {
    if (!started) { setStarted(true); track('questionnaire_started'); }
  };

  async function calculate() {
    setLoading(true);
    setError(null);
    const profile: UserProfile = { spend, priorities, feeBand, internationalTravel, loungeImportance };
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
      <ol className="flex items-center gap-2 text-sm">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span className={cn('num grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
              i <= step ? 'bg-ink text-white' : 'bg-line text-ink-muted')}>{i + 1}</span>
            <span className={cn(i === step ? 'font-medium text-ink' : 'text-ink-muted')}>{label}</span>
            {i < STEP_LABELS.length - 1 ? <span aria-hidden className="mx-2 h-px w-6 bg-line sm:w-10" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-10">
        {step === 0 ? (
          <div onFocusCapture={markStarted} onPointerDown={markStarted}>
            <SpendStep spend={spend} onChange={setSpend} />
            <div className="mt-10 flex items-center gap-3">
              <Button size="lg" onClick={() => setStep(1)}>Continue</Button>
              <ButtonLink href="/cards" variant="ghost" size="lg">Browse all cards instead</ButtonLink>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <PreferencesStep
              priorities={priorities} feeBand={feeBand} internationalTravel={internationalTravel} loungeImportance={loungeImportance}
              onChange={(patch) => {
                if (patch.priorities) setPriorities(patch.priorities);
                if (patch.feeBand) setFeeBand(patch.feeBand);
                if (patch.internationalTravel !== undefined) setInternationalTravel(patch.internationalTravel);
                if (patch.loungeImportance) setLoungeImportance(patch.loungeImportance);
              }}
            />
            {error ? <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <div className="mt-10 flex items-center gap-3">
              <Button size="lg" onClick={calculate} disabled={loading}>{loading ? 'Calculating…' : 'Calculate'}</Button>
              <Button size="lg" variant="secondary" onClick={() => setStep(0)}>Back</Button>
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

            {result.matches.length === 0 ? (
              <p className="mt-8 surface-card p-6 text-sm text-ink-muted">
                No card in our database fits those constraints. Try widening the annual fee preference.
              </p>
            ) : view === 'compare' ? (
              <ComparisonTable matches={result.matches} />
            ) : (
              <div className="mt-8 space-y-6">
                {result.matches.map((m, i) => <ResultCard key={m.card.id} match={m} rank={i + 1} />)}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setStep(0)}>Change my answers</Button>
              <ButtonLink href="/cards" variant="ghost">Browse all {researchedCount} cards</ButtonLink>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
