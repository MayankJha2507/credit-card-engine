'use client';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

/**
 * Sends the user to the issuer's own product page — the same source the card's
 * data was verified against. It is not an affiliate or application link: it
 * opens the issuer site in a new tab and we take no part in what happens there.
 */
export function OfficialLink({
  url, issuer, cardName, variant = 'button', className, label,
}: {
  url: string | null;
  issuer: string;
  cardName: string;
  variant?: 'button' | 'inline';
  className?: string;
  label?: string;
}) {
  if (!url) {
    return <span className={cn('text-xs text-ink-muted', className)}>No official page recorded</span>;
  }
  const text = label ?? `Go to ${issuer}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer nofollow"
      onClick={() => track('official_site_clicked', { card: cardName, issuer })}
      className={cn(
        variant === 'button'
          ? 'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink/90'
          : 'inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline-offset-2 hover:underline',
        className,
      )}
    >
      {text}
      <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 3h7v7M13 3 4 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">(opens the issuer&apos;s official site in a new tab)</span>
    </a>
  );
}
