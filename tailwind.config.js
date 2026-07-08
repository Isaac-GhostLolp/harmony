/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        raised: 'var(--bg-raised)',
        ink: 'var(--text-primary)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)'
      },
      borderRadius: { xl2: '1.25rem' },
      backdropBlur: { xs: '2px' }
    }
  },
  plugins: []
}
