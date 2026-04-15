/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#e8f0fe',
          100: '#c5d9fc',
          200: '#9ebff9',
          300: '#76a5f5',
          400: '#4a90d9',
          500: '#3a7bd5',
          600: '#2d62b3',
          700: '#1f4a91',
          800: '#13326f',
          900: '#0a1c4d',
        },
        surface: {
          DEFAULT: '#16213e',
          dark: '#0d1b2a',
          light: '#1a2744',
          card: '#1e2d4a',
        },
      },
    },
  },
  plugins: [],
};
