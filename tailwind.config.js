/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        // Theme tokens (specs/041-look-and-feel): each is a CSS variable the theme sets, as "r g b".
        astro: {
          'bg': 'rgb(var(--astro-bg) / <alpha-value>)',
          'surface': 'rgb(var(--astro-surface) / <alpha-value>)',
          'raised': 'rgb(var(--astro-raised) / <alpha-value>)',
          'border': 'rgb(var(--astro-border) / <alpha-value>)',
          'text': 'rgb(var(--astro-text) / <alpha-value>)',
          'muted': 'rgb(var(--astro-muted) / <alpha-value>)',
          'accent': 'rgb(var(--astro-accent) / <alpha-value>)',
          'on-accent': 'rgb(var(--astro-on-accent) / <alpha-value>)',
          'success': 'rgb(var(--astro-success) / <alpha-value>)',
          'warning': 'rgb(var(--astro-warning) / <alpha-value>)',
          'danger': 'rgb(var(--astro-danger) / <alpha-value>)',
          'info': 'rgb(var(--astro-info) / <alpha-value>)',
          'scrim': 'rgb(var(--astro-scrim) / <alpha-value>)',
          'on-scrim': 'rgb(var(--astro-on-scrim) / <alpha-value>)',
          'cat-1': 'rgb(var(--astro-cat-1) / <alpha-value>)',
          'cat-2': 'rgb(var(--astro-cat-2) / <alpha-value>)',
          'cat-3': 'rgb(var(--astro-cat-3) / <alpha-value>)',
          'cat-4': 'rgb(var(--astro-cat-4) / <alpha-value>)',
          'cat-5': 'rgb(var(--astro-cat-5) / <alpha-value>)',
          'cat-6': 'rgb(var(--astro-cat-6) / <alpha-value>)',
          'cat-7': 'rgb(var(--astro-cat-7) / <alpha-value>)',
          'cat-8': 'rgb(var(--astro-cat-8) / <alpha-value>)'
        }
      },
      keyframes: {
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(1rem)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        }
      },
      animation: {
        'slide-in': 'slide-in 0.2s ease-out'
      }
    }
  },
  plugins: []
}
