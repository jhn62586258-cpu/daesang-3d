/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { orange: '#FD9F28', gray: '#787878', white: '#FFFFFF' },
      },
      fontFamily: { sans: ['"Noto Sans KR"', 'system-ui', 'sans-serif'] },
    },
  },
  // 기존 시뮬레이터 디자인(src/index.css)을 1:1로 유지하기 위해 Tailwind 기본 리셋(preflight)은 끕니다.
  corePlugins: { preflight: false },
  plugins: [],
};
