/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' permite trocar claro/escuro pelo app (no celular e no web).
  darkMode: 'class',
  content: ['./App.tsx', './screens/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        grama: { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
      },
    },
  },
  plugins: [],
};
