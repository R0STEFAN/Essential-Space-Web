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
          black: 'rgb(var(--nothing-black) / <alpha-value>)',
          dark: 'rgb(var(--nothing-dark) / <alpha-value>)',
          card: 'rgb(var(--nothing-card) / <alpha-value>)',
          'card-hover': 'rgb(var(--nothing-card-hover) / <alpha-value>)',
          subtle: 'rgb(var(--nothing-subtle) / <alpha-value>)',
          well: 'rgb(var(--nothing-well) / <alpha-value>)',
          input: 'rgb(var(--nothing-input) / <alpha-value>)',
          hover: 'rgb(var(--nothing-hover) / <alpha-value>)',
          border: 'rgb(var(--nothing-border) / <alpha-value>)',
          'border-hover': 'rgb(var(--nothing-border-hover) / <alpha-value>)',
          red: 'rgb(var(--nothing-red) / <alpha-value>)',
          'red-hover': 'rgb(var(--nothing-red-hover) / <alpha-value>)',
          gray: 'rgb(var(--nothing-gray) / <alpha-value>)',
          'gray-dim': 'rgb(var(--nothing-gray-dim) / <alpha-value>)',
          muted: 'rgb(var(--nothing-muted) / <alpha-value>)',
          light: 'rgb(var(--nothing-light) / <alpha-value>)',
          ink: 'rgb(var(--nothing-ink) / <alpha-value>)',
          'on-ink': 'rgb(var(--nothing-on-ink) / <alpha-value>)',
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
