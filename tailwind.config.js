/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        astro: {
          bg: '#0f1729',
          surface: '#1a2332',
          border: '#2a3a4e',
          accent: '#4f9cf7',
          text: '#e2e8f0',
          muted: '#94a3b8',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444'
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
