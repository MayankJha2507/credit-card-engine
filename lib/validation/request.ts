import { z } from 'zod';
import { FEE_BANDS, PRIORITIES } from '@/lib/calculations/types';
import { SPEND_CATEGORIES } from '@/lib/data/types';

/** A month's spend in one category. Kept deliberately coarse and bounded. */
const amount = z.number().finite().min(0).max(100_000_000);

export const userProfileSchema = z.object({
  spend: z.object(Object.fromEntries(SPEND_CATEGORIES.map((c) => [c, amount.optional()])) as Record<
    (typeof SPEND_CATEGORIES)[number],
    z.ZodOptional<typeof amount>
  >),
  priorities: z.array(z.enum(PRIORITIES)).max(PRIORITIES.length).default([]),
  feeBand: z.enum(FEE_BANDS).default('any'),
  internationalTravel: z.boolean().default(false),
  loungeImportance: z.enum(['not_important', 'nice_to_have', 'important']).default('not_important'),
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;
