import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ₹1,23,456 — Indian digit grouping, no decimals. */
export function formatINR(n: number): string {
  const rounded = Math.round(n);
  return `${rounded < 0 ? '-' : ''}₹${Math.abs(rounded).toLocaleString('en-IN')}`;
}

export function formatPercent(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Not recorded';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
