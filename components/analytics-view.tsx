'use client';
import { useEffect } from 'react';
import { track, type AnalyticsEvent, type AnalyticsProps } from '@/lib/analytics';

/** Fires one page-level analytics event on mount. */
export function AnalyticsView({ event, props }: { event: AnalyticsEvent; props?: AnalyticsProps }) {
  useEffect(() => {
    track(event, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}
