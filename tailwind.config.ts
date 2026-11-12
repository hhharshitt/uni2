import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        signal: '#FBBF24',
        ink: '#0A0A0A',
        charcoal: '#1C1C1C',
        paper: '#F5F5F0',
        go: '#22C55E',
        halt: '#EF4444',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        brutal: '4px 4px 0px 0px #000',
        'brutal-sm': '2px 2px 0px 0px #000',
        'brutal-lg': '8px 8px 0px 0px #000',
      },
    },
  },
  plugins: [],
};

export default config;

