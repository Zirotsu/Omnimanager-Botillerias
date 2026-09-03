/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: { omni: '0 24px 60px rgba(15, 23, 42, .10)' }
    }
  },
  plugins: []
};
