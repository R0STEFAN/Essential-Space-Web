import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        nothing: {
          black: '#000000',
          dark: '#0B0B0C',
          card: '#141416',
          hover: '#1D1D20',
          border: '#26262A',
          red: '#D71921',
          'red-hover': '#B8141B',
          gray: '#A1A1A6',
          'gray-dim': '#707075',
          muted: '#8E8E93',
          light: '#F2F2F2',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        dot: ['var(--font-ndot57)', 'var(--font-ndot55)', 'var(--font-ndot-orig)', 'NDot57', 'NDot55', 'NDotOriginal', 'ui-monospace', 'Courier New', 'monospace'],
        ndot: ['var(--font-ndot57)', 'var(--font-ndot55)', 'var(--font-ndot-orig)', 'NDot57', 'NDot55', 'NDotOriginal', 'ui-monospace', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
