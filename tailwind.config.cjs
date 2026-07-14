/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'selector',
  // PuppyOne owns the renderer reset and component typography through its
  // explicit cascade layers. Tailwind's Preflight is an unscoped document
  // reset; enabling it here would override layered Sidebar primitives such
  // as button row typography across the whole Electron renderer.
  corePlugins: {
    preflight: false,
  },
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--po-font-sans)'],
        mono: ['var(--po-font-mono)'],
      },
      colors: {
        po: {
          canvas: 'var(--po-canvas)',
          sidebar: 'var(--po-sidebar)',
          header: 'var(--po-header)',
          panel: 'var(--po-panel)',
          'panel-raised': 'var(--po-panel-raised)',
          overlay: 'var(--po-overlay)',
          inset: 'var(--po-inset)',
          text: 'var(--po-text)',
          muted: 'var(--po-text-muted)',
          subtle: 'var(--po-text-subtle)',
          disabled: 'var(--po-text-disabled)',
          border: 'var(--po-border)',
          accent: 'var(--po-accent)',
          success: 'var(--po-success)',
          warning: 'var(--po-warning)',
          danger: 'var(--po-danger)',
          info: 'var(--po-info)',
        },
      },
    },
  },
  plugins: [],
};
