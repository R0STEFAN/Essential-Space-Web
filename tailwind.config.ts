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
          gray: '#86868B',
          muted: '#86868B',
          light: '#E6E6E6',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        ndot: ['ui-monospace', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
