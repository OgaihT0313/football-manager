/** @type {import('tailwindcss').Config} */
// Tokens da identidade "Mesa de Comando" (components/theme.ts): as cores vêm de variáveis
// definidas por tema na raiz do app; as fontes são uma família por peso (Android não escolhe
// peso de fonte carregada).
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  // 'class' permite trocar claro/escuro pelo app (no celular e no web).
  darkMode: 'class',
  content: ['./App.tsx', './screens/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        s1: token('s1'),
        s2: token('s2'),
        line: token('line'),
        ink: token('ink'),
        mute: token('mute'),
        acc: token('acc'),
        acct: token('acct'),
        onacc: token('onacc'),
        pos: token('pos'),
        neg: token('neg'),
        pitch: token('pitch'),
        cartao: '#E8C547',
      },
      fontFamily: {
        sans: ['Archivo_400Regular'],
        sansm: ['Archivo_500Medium'],
        sanss: ['Archivo_600SemiBold'],
        sansb: ['Archivo_700Bold'],
        disp7: ['BigShouldersDisplay_700Bold'],
        disp: ['BigShouldersDisplay_800ExtraBold'],
        disp9: ['BigShouldersDisplay_900Black'],
        mono: ['JetBrainsMono_400Regular'],
        monom: ['JetBrainsMono_500Medium'],
        monob: ['JetBrainsMono_700Bold'],
      },
    },
  },
  plugins: [],
};
