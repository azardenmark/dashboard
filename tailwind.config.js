/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F6F3FF',
          100: '#ECE6FF',
          200: '#D8CEFF',
          300: '#B9A9FF',
          400: '#9B85FF',
          500: '#7D61F7',
          600: '#634CD4',
          700: '#4F3EB0',
          800: '#3B2F8C',
          900: '#281F69',
        },
        candy: { 500: '#FF7FBF', 600: '#FF5FAA' },
      },
      fontFamily: {
        display: ['"Cairo"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '2xl': '1.25rem' },
    },
  },
  plugins: [],
}
