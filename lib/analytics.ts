/**
 * Lightweight, privacy-preserving product analytics.
 *
 * Only product events are recorded. Spend inputs, amounts and any other
 * financial detail are never sent — event properties are limited to coarse,
 * non-identifying fields.
 */
export const ANALYTICS_EVENTS = [
  'landing_page_view',
  'questionnaire_started',
  'questionnaire_completed',
  'recommendation_viewed',
  'recommendation_clicked',
  'calculation_opened',
  'card_detail_viewed',
  'browse_cards',
  'comparison_started',
  'official_site_clicked',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** Coarse, non-financial properties only. */
export type AnalyticsProps = Record<string, string | number | boolean>;

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({ event, props, at: new Date().toISOString() });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/analytics', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true });
    }
  } catch {
    // Analytics must never break the product.
  }
}
