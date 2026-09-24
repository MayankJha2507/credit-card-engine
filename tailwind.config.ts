import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0d1117', muted: '#5b6472' },
        brand: {
          50: '#eef6ff', 100: '#d9ebff', 200: '#b9daff', 300: '#88c0ff',
          400: '#4f9dff', 500: '#1f7aee', 600: '#0f5ecb', 700: '#0d4ba3',
          800: '#113f83', 900: '#13376c',
        },
        surface: '#ffffff',
        canvas: '#f7f8fa',
        line: '#e6e8ec',
      },
      fontFamily: { sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(13,17,23,0.04), 0 8px 24px -12px rgba(13,17,23,0.12)',
        lift: '0 2px 4px rgba(13,17,23,0.05), 0 18px 40px -18px rgba(13,17,23,0.22)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
    },
  },
  plugins: [],
};
export default config;
