/**
 * A generated card face.
 *
 * We do not hold licensed artwork for any issuer, so this deliberately renders
 * an abstract representation built from facts we do have — issuer, card name,
 * network and tier — rather than an imitation of the physical product. No
 * issuer logo, no card number, no expiry, nothing that could be mistaken for a
 * real card or for official imagery.
 *
 * Colour is derived deterministically from the issuer slug, so every card from
 * one issuer looks consistent and a newly imported issuer gets its own tone with
 * no code change. Tier controls how dark and metallic the treatment is.
 */
import { cn } from '@/lib/utils';

/** Stable, non-cryptographic hash → hue. Same issuer always yields the same colour. */
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

type Tier = 'super' | 'premium' | 'core';

function tierOf(variant: string | null, cardType: string | null): Tier {
  const s = `${variant ?? ''} ${cardType ?? ''}`.toLowerCase();
  if (/super[- ]?premium/.test(s)) return 'super';
  if (/premium|travel/.test(s)) return 'premium';
  return 'core';
}

const SIZES = {
  sm: { box: 'w-[104px]', name: 'text-[10px]', issuer: 'text-[8px]', foot: 'text-[8px]' },
  md: { box: 'w-[168px]', name: 'text-xs', issuer: 'text-[9px]', foot: 'text-[9px]' },
  lg: { box: 'w-[260px]', name: 'text-sm', issuer: 'text-[10px]', foot: 'text-[10px]' },
} as const;

export function CardVisual({
  issuer, issuerSlug, name, network, variant, cardType, size = 'md', className, showName = true,
}: {
  issuer: string;
  issuerSlug: string;
  name: string;
  network: string | null;
  variant: string | null;
  cardType: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  /** Off where the card's name is already displayed beside the visual. */
  showName?: boolean;
}) {
  const hue = hueFor(issuerSlug);
  const tier = tierOf(variant, cardType);
  const s = SIZES[size];

  // Lightness/saturation by tier: super-premium reads as dark metal, core as colour.
  const [l1, l2, sat] = tier === 'super' ? [16, 26, 22] : tier === 'premium' ? [26, 40, 46] : [38, 54, 62];
  const background = `linear-gradient(135deg, hsl(${hue} ${sat}% ${l1}%) 0%, hsl(${(hue + 26) % 360} ${sat}% ${l2}%) 62%, hsl(${(hue + 44) % 360} ${Math.min(sat + 10, 80)}% ${l2 + 8}%) 100%)`;

  // The first network named, e.g. "Visa / Mastercard" → "Visa".
  const networkLabel = network?.split(/[/,]/)[0]?.trim() ?? null;

  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-xl text-white shadow-card ring-1 ring-black/10', s.box, className)}
      style={{ aspectRatio: '1.586 / 1', background }}
      aria-hidden
    >
      {/* Light sweep, purely decorative */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0" />
      {tier === 'super' ? <div className="absolute inset-0 opacity-[0.18] [background-image:repeating-linear-gradient(115deg,transparent_0_6px,rgba(255,255,255,0.7)_6px_7px)]" /> : null}

      <div className="relative flex h-full flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('font-semibold uppercase tracking-wider text-white/75', s.issuer)}>{issuer}</span>
          <span className={cn('rounded bg-white/15 px-1.5 py-0.5 font-medium text-white/90', s.foot)}>{networkLabel}</span>
        </div>

        {/* Chip motif — geometry only, not a reproduction of any card element */}
        <div className="h-4 w-6 rounded-[3px] bg-gradient-to-br from-amber-100/90 to-amber-300/70 sm:h-5 sm:w-7" />

        <div>
          {showName ? <p className={cn('line-clamp-2 font-semibold leading-tight', s.name)}>{name}</p> : null}
          {variant ? <p className={cn('text-white/65', s.foot, showName && 'mt-0.5')}>{variant}</p> : null}
        </div>
      </div>
    </div>
  );
}
