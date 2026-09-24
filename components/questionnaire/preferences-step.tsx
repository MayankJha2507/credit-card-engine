'use client';
import { PRIORITIES, PRIORITY_LABELS, type LoungeImportance, type Priority } from '@/lib/calculations/types';
import { cn } from '@/lib/utils';

const LOUNGE_OPTIONS: Array<{ value: LoungeImportance; label: string }> = [
  { value: 'not_important', label: 'Not important' },
  { value: 'nice_to_have', label: 'Nice to have' },
  { value: 'important', label: 'Important' },
];

function Chip({ selected, children, onClick }: { selected: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      className={cn(
        'rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
        selected ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-canvas',
      )}
    >
      {children}
    </button>
  );
}

export function PreferencesStep({
  priorities, internationalTravel, loungeImportance, onChange,
}: {
  priorities: Priority[];
  internationalTravel: boolean;
  loungeImportance: LoungeImportance;
  onChange: (patch: Partial<{ priorities: Priority[]; internationalTravel: boolean; loungeImportance: LoungeImportance }>) => void;
}) {
  const toggle = (p: Priority) =>
    onChange({ priorities: priorities.includes(p) ? priorities.filter((x) => x !== p) : [...priorities, p] });

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">What matters most to you?</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Pick as many as apply. These only break ties between cards of similar value — including
          &ldquo;Low annual fee&rdquo;, which favours fee-free cards without hiding a card that earns back its fee.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <Chip key={p} selected={priorities.includes(p)} onClick={() => toggle(p)}>{PRIORITY_LABELS[p]}</Chip>
          ))}
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <h3 className="text-lg font-semibold">Do you spend internationally?</h3>
          <p className="mt-1 text-xs text-ink-muted">Optional</p>
          <div className="mt-4 flex gap-2">
            <Chip selected={internationalTravel} onClick={() => onChange({ internationalTravel: true })}>Yes</Chip>
            <Chip selected={!internationalTravel} onClick={() => onChange({ internationalTravel: false })}>No</Chip>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold">How important is lounge access?</h3>
          <p className="mt-1 text-xs text-ink-muted">Optional</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {LOUNGE_OPTIONS.map((o) => (
              <Chip key={o.value} selected={loungeImportance === o.value} onClick={() => onChange({ loungeImportance: o.value })}>{o.label}</Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
