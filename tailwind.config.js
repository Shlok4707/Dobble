/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          900: '#070B16',
          800: '#0B1020',
          700: '#111a33',
          600: '#1a2547',
          500: '#243361',
        },
        crew: {
          red: '#C51111',
          redDark: '#7A0838',
          cyan: '#38FEDC',
          visor: '#9AD9F5',
          visorDark: '#5D9FC0',
          yellow: '#F6F657',
          green: '#13802D',
          lime: '#50EF39',
          orange: '#F07D0D',
          pink: '#EE54BB',
          purple: '#6B2FBC',
          blue: '#132ED2',
        },
      },
      fontFamily: {
        display: ['"Trebuchet MS"', '"Segoe UI"', 'Verdana', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        chunky: '0 6px 0 0 rgba(0,0,0,0.45)',
        chunkySm: '0 4px 0 0 rgba(0,0,0,0.45)',
        glow: '0 0 30px 6px rgba(56,254,220,0.55)',
      },
      keyframes: {
        twinkle: {
          '0%,100%': { opacity: '0.25' },
          '50%': { opacity: '1' },
        },
        floatUp: {
          '0%': { transform: 'translate(-50%, 0) scale(0.6)', opacity: '0' },
          '20%': { transform: 'translate(-50%, -10px) scale(1.15)', opacity: '1' },
          '100%': { transform: 'translate(-50%, -55px) scale(1)', opacity: '0' },
        },
        shake: {
          '0%,100%': { transform: 'translate(-50%,-50%) rotate(var(--rot)) translateX(0)' },
          '20%': { transform: 'translate(-50%,-50%) rotate(var(--rot)) translateX(-6px)' },
          '40%': { transform: 'translate(-50%,-50%) rotate(var(--rot)) translateX(6px)' },
          '60%': { transform: 'translate(-50%,-50%) rotate(var(--rot)) translateX(-4px)' },
          '80%': { transform: 'translate(-50%,-50%) rotate(var(--rot)) translateX(4px)' },
        },
        popIn: {
          '0%': { transform: 'scale(0.4)', opacity: '0' },
          '70%': { transform: 'scale(1.06)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        cardIn: {
          '0%': { transform: 'scale(0.75) translateY(20px)', opacity: '0' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        cardOut: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.8) rotate(8deg)', opacity: '0' },
        },
        matchGlow: {
          '0%,100%': { filter: 'drop-shadow(0 0 0px #38FEDC)' },
          '50%': { filter: 'drop-shadow(0 0 14px #38FEDC) drop-shadow(0 0 28px #38FEDC)' },
        },
        drift: {
          '0%': { transform: 'translateX(-12vw) rotate(0deg)' },
          '100%': { transform: 'translateX(112vw) rotate(360deg)' },
        },
        countPop: {
          '0%': { transform: 'scale(2.2)', opacity: '0' },
          '30%': { transform: 'scale(1)', opacity: '1' },
          '80%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.7)', opacity: '0' },
        },
      },
      animation: {
        twinkle: 'twinkle 3s ease-in-out infinite',
        floatUp: 'floatUp 1.1s ease-out forwards',
        shake: 'shake 0.4s ease-in-out',
        popIn: 'popIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        cardIn: 'cardIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both',
        cardOut: 'cardOut 0.35s ease-in forwards',
        matchGlow: 'matchGlow 0.7s ease-in-out 3',
        drift: 'drift 26s linear infinite',
        countPop: 'countPop 1s ease-out both',
      },
    },
  },
  plugins: [],
}
