/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d6fe',
          300: '#a4b8fc',
          400: '#818cf8',
          500: '#667eea',
          600: '#5468d4',
          700: '#4555b0',
          800: '#3a478f',
          900: '#343e73',
        },
        secondary: {
          500: '#764ba2',
          600: '#633d8a',
        }
      }
    },
  },
  plugins: [],
}
