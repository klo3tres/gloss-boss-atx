/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        background: '#000000',
        foreground: '#ffffff',
        gold: '#d4af37',
        'gold-soft': '#f1d28a',
      },
      boxShadow: {
        gold: '0 0 30px rgba(212,166,77,0.25)',
      },
    },
  },
  plugins: [],
};
