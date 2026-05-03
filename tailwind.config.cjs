/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#2486FF',
          'blue-dark': '#005CFF',
          'blue-light': '#48B0FF',
          navy: '#0D1B2A',
          ice: '#F8FAFD',
          slate: '#808A95',
          accent: '#D4F73F'
        },
        success: '#34C759',
        warning: '#FF9500',
        danger: '#FF3B30'
      }
    }
  },
  plugins: []
};
