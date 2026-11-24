/** @type {import('tailwindcss').Config} */
// Tailwind se usa solo como utilidades auxiliares; los tokens viven en src/styles/theme.css.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#7B5EA7', dark: '#5A4080', light: '#F2EEFA' },
        accent: '#7B5EA7',
        surface: '#FFFFFF',
      },
      fontFamily: { sans: ['Segoe UI', 'system-ui', '-apple-system', 'sans-serif'] },
      borderRadius: { DEFAULT: '8px' },
    },
  },
  plugins: [],
}
