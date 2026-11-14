import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        signal: '#6366F1',
        ink: '#0F172A',
        charcoal: '#090D16',
        paper: '#F8FAFC',
        go: '#10B981',
        halt: '#F43F5E',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 25px -5px rgba(99, 102, 241, 0.4)',
        'glass-lg': '0 20px 50px -12px rgba(0, 0, 0, 0.65)',
      },
    },
  },
  plugins: [],
};

export default config;
