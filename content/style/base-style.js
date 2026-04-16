(() => {
  const app = globalThis.__CSP__;

  class StyleController {
    constructor() {
      this.styleElement = null;
    }

    clearElementState(contentElement) {
      if (!contentElement) {
        return;
      }

      contentElement.classList.remove("csp-optimizable", "csp-keep-alive");
      delete contentElement.dataset.cspId;
      delete contentElement.dataset.cspOptimized;
      delete contentElement.dataset.cspProtected;
    }

    injectBaseStyles() {
      if (this.styleElement) {
        return;
      }

      const styleElement = document.createElement("style");
      styleElement.id = "csp-base-styles";
      styleElement.textContent = `
.csp-optimizable {
  content-visibility: auto;
  contain-intrinsic-size: auto var(--csp-fallback-size, 600px);
}

.csp-keep-alive {
  content-visibility: visible;
}
`;

      document.documentElement.appendChild(styleElement);
      this.styleElement = styleElement;
    }

    apply(record, shouldOptimize, shouldKeepAlive) {
      const contentElement = record.contentElement;
      const previousElement = record.baseStyleElement || null;
      const nextId = String(record.id);
      const optimize = Boolean(shouldOptimize);
      const keepAlive = Boolean(shouldKeepAlive);

      if (previousElement && previousElement !== contentElement) {
        this.clearElementState(previousElement);
      }

      if (!contentElement) {
        record.baseStyleElement = null;
        record.baseStyleId = "";
        record.baseStyleOptimized = false;
        record.baseStyleKeepAlive = false;
        return;
      }

      const elementChanged = previousElement !== contentElement;

      if (elementChanged || record.baseStyleOptimized !== optimize) {
        contentElement.classList.toggle("csp-optimizable", optimize);
        contentElement.dataset.cspOptimized = optimize ? "true" : "false";
      }

      if (elementChanged || record.baseStyleKeepAlive !== keepAlive) {
        contentElement.classList.toggle("csp-keep-alive", keepAlive);
        contentElement.dataset.cspProtected = keepAlive ? "true" : "false";
      }

      if (elementChanged || record.baseStyleId !== nextId) {
        contentElement.dataset.cspId = nextId;
      }

      record.baseStyleElement = contentElement;
      record.baseStyleId = nextId;
      record.baseStyleOptimized = optimize;
      record.baseStyleKeepAlive = keepAlive;
    }

    clear(record) {
      const contentElement = record.baseStyleElement || record.contentElement;

      this.clearElementState(contentElement);
      record.baseStyleElement = null;
      record.baseStyleId = "";
      record.baseStyleOptimized = false;
      record.baseStyleKeepAlive = false;
    }
  }

  app.style.BaseStyleController = StyleController;
})();
