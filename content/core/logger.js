(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;

  function getPrefix() {
    const shortName =
      i18n && i18n.t ? i18n.t("meta.shortName", {}, "CSP") : "CSP";

    return `[${shortName}]`;
  }

  const logger = {
    debugEnabled: false,

    debug(...args) {
      if (!this.debugEnabled) {
        return;
      }

      console.debug(getPrefix(), ...args);
    },

    info(...args) {
      console.info(getPrefix(), ...args);
    },

    warn(...args) {
      console.warn(getPrefix(), ...args);
    },

    error(...args) {
      console.error(getPrefix(), ...args);
    },
  };

  app.core.logger = logger;
})();
