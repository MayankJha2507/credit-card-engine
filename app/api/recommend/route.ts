import { NextResponse } from 'next/server';
import { recommend } from '@/lib/recommendations/engine';
import { getAllCards } from '@/lib/data/repository';
import { userProfileSchema } from '@/lib/validation/request';

/** Deterministic: no model call, no randomness. Same body in, same body out. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = userProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid profile', details: parsed.error.flatten() }, { status: 400 });
  }

  const cards = await getAllCards();
  const result = recommend(cards, parsed.data);

  return NextResponse.json({
    matches: result.matches,
    considered: result.considered,
    poolSize: result.poolSize,
    loungeFilterApplied: result.loungeFilterApplied,
    databaseSize: cards.length,
  });
}
