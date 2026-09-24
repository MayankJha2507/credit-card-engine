import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'CardFit — find the credit card that fits how you spend', template: '%s · CardFit' },
  description:
    'Compare Indian credit cards on rewards, fees, lounge access and forex using your own approximate monthly spending. Every number is calculated from published card terms.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: { type: 'website', title: 'CardFit', description: 'Find the credit card that fits how you spend.' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-line bg-surface">
          <div className="container-page flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-xs font-bold text-white">CF</span>
              CardFit
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/cards" className="rounded-lg px-3 py-2 text-ink-muted hover:bg-canvas hover:text-ink">Browse cards</Link>
              <Link href="/recommend" className="rounded-lg bg-ink px-4 py-2 font-medium text-white hover:bg-ink/90">Find my card</Link>
            </nav>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem-8rem)]">{children}</main>
        <footer className="mt-20 border-t border-line bg-surface">
          <div className="container-page flex flex-col gap-3 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
            <p>Recommendations are based on cards currently in our database, not the whole Indian card market.</p>
            <p>Card terms change. Always confirm on the issuer&apos;s website before applying.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
