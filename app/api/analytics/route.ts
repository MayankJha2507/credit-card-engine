import { NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * Analytics sink. Defaults to a structured server log, which is enough for the
 * MVP and keeps the deployment dependency-free; point ANALYTICS_SINK at a real
 * provider later without touching the call sites.
 */
export async function POST(request: Request) {
  if (process.env.ANALYTICS_SINK === 'none') return NextResponse.json({ ok: true });
  try {
    const body = (await request.json()) as { event?: string; props?: Record<string, unknown> };
    if (!body.event || !(ANALYTICS_EVENTS as readonly string[]).includes(body.event)) {
      return NextResponse.json({ ok: false, error: 'unknown event' }, { status: 400 });
    }
    console.log(JSON.stringify({ type: 'analytics', event: body.event, props: body.props ?? {}, at: new Date().toISOString() }));
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
