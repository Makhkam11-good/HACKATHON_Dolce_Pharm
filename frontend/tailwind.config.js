/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f4', 100: '#d5ece5', 200: '#acd8cb', 300: '#7bbfab', 400: '#4aa38b',
          500: '#2b8a71', 600: '#1f6f5c', 700: '#1a594b', 800: '#16473d', 900: '#123a32',
        },
      },
      minHeight: { tap: '48px' },
      minWidth: { tap: '48px' },
    },
  },
  plugins: [],
};
