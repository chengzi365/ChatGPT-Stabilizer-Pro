(() => {
  const app = globalThis.__CSP__;

  const PANEL_ICONS = Object.freeze({
    copy: `
      <rect x="9" y="9" width="10" height="10" rx="2"></rect>
      <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
    `,
    resync: `
      <path d="M20 4v6h-6"></path>
      <path d="M4 20v-6h6"></path>
      <path d="M20 10a8 8 0 0 0-14.7-3"></path>
      <path d="M4 14a8 8 0 0 0 14.7 3"></path>
    `,
    restore: `
      <path d="M3 12a9 9 0 1 0 3-6.7"></path>
      <path d="M3 4v5h5"></path>
    `,
    collapse: `
      <path d="m6 15 6-6 6 6"></path>
    `,
    hide: `
      <path d="M3 3l18 18"></path>
      <path d="M10.6 10.5a2 2 0 0 0 2.8 2.8"></path>
      <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5.2 0 9.4 3.8 10 7-.2.9-.7 1.8-1.4 2.7"></path>
      <path d="M6.6 6.7C4.6 8 3.3 9.8 3 12c.6 3.2 4.8 7 9 7 1.7 0 3.3-.4 4.7-1.1"></path>
    `,
    show: `
      <path d="M2.8 12c1-4 4.9-7 9.2-7s8.2 3 9.2 7c-1 4-4.9 7-9.2 7s-8.2-3-9.2-7Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `,
  });

  app.ui.panelIconMarkup = function panelIconMarkup(name) {
    const iconBody = PANEL_ICONS[name] || "";

    return `<svg viewBox="0 0 24 24" aria-hidden="true">${iconBody}</svg>`;
  };
})();
