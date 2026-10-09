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
      backdropBlur: { xs: '2px' }
    },
    // corner rounding follows the appearance studio (--rk: 0 = square,
    // 1 = default, 2 = very round)
    borderRadius: {
      none: '0px',
      sm: 'calc(0.125rem * var(--rk, 1))',
      DEFAULT: 'calc(0.25rem * var(--rk, 1))',
      md: 'calc(0.375rem * var(--rk, 1))',
      lg: 'calc(0.5rem * var(--rk, 1))',
      xl: 'calc(0.75rem * var(--rk, 1))',
      xl2: 'calc(1.25rem * var(--rk, 1))',
      '2xl': 'calc(1rem * var(--rk, 1))',
      '3xl': 'calc(1.5rem * var(--rk, 1))',
      full: 'calc(9999px * var(--rk, 1))'
    }
  },
  plugins: []
}
