/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        qn: {
          bg: '#f5f5f5',
          white: '#ffffff',
          black: '#0d0d0d',
          gray: {
            100: '#f5f5f5',
            200: '#e5e5e5',
            300: '#d9d9d9',
            400: '#a3a3a3',
            500: '#737373',
            600: '#525252',
            700: '#404040',
            800: '#262626',
            900: '#171717',
          },
        },
        accent: {
          green: '#1cca5b',
          red: '#ef4343',
          blue: '#2563eb',
          purple: '#7c3aed',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'brutal': '4px 4px 0px 0px rgb(13, 13, 13)',
        'brutal-sm': '2px 2px 0px 0px rgb(13, 13, 13)',
        'brutal-lg': '6px 6px 0px 0px rgb(13, 13, 13)',
      },
    },
  },
  plugins: [],
}
