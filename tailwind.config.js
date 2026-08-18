/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        deep: '#060a14', // 页面底色(深蓝黑)
        panel: '#0d1526', // 面板底色
        'panel-2': '#111a30',
        line: 'rgba(56, 189, 248, 0.16)', // 面板描边
        glow: '#22d3ee', // 荧光青主高亮
        'glow-dim': '#38bdf8'
      },
      boxShadow: {
        glow: '0 0 24px rgba(34, 211, 238, 0.25)',
        panel: '0 8px 32px rgba(2, 6, 16, 0.6)'
      }
    }
  },
  plugins: []
}
