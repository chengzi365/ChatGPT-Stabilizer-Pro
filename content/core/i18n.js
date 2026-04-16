(() => {
  const app = globalThis.__CSP__;
  const nativeI18n = globalThis.browser?.i18n || globalThis.chrome?.i18n || null;
  const fallbackLocale = "en-US";
  let nativeI18nEnabled = Boolean(nativeI18n);

  function isExtensionContextInvalidated(error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "";

    return /Extension context invalidated/i.test(message);
  }

  function safeNativeI18nCall(methodName, fallbackValue, ...args) {
    if (
      !nativeI18nEnabled ||
      !nativeI18n ||
      typeof nativeI18n[methodName] !== "function"
    ) {
      return fallbackValue;
    }

    try {
      return nativeI18n[methodName](...args);
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        nativeI18nEnabled = false;
        return fallbackValue;
      }

      return fallbackValue;
    }
  }

  function normalizeLocale(locale) {
    if (!locale) {
      return fallbackLocale;
    }

    return String(locale).replace(/_/g, "-");
  }

  function normalizeMessageName(key) {
    return String(key).replace(/[.-]/g, "_");
  }

  function interpolate(message, params) {
    return String(message).replace(/\{(\w+)\}/g, (match, name) => {
      if (name in params) {
        return String(params[name]);
      }

      return match;
    });
  }

  const i18n = {
    locale: fallbackLocale,

    init() {
      const nativeLocale = safeNativeI18nCall(
        "getUILanguage",
        navigator.language || fallbackLocale
      );

      this.locale = normalizeLocale(nativeLocale);
      return this.locale;
    },

    getLocale() {
      return this.locale || fallbackLocale;
    },

    getFormattingLocale() {
      const locale = this.getLocale().toLowerCase();

      if (locale.startsWith("zh")) {
        return "zh-CN";
      }

      return "en-US";
    },

    t(key, params = {}, fallback) {
      const messageName = normalizeMessageName(key);
      const message = safeNativeI18nCall("getMessage", "", messageName);

      if (message) {
        return interpolate(message, params);
      }

      if (typeof fallback === "string") {
        return interpolate(fallback, params);
      }

      return key;
    },
  };

  app.core.i18n = i18n;
})();
