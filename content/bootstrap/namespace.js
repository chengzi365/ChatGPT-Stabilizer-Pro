(() => {
  const app = (globalThis.__CSP__ = globalThis.__CSP__ || {});
  const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime || null;

  function resolveExtensionVersion() {
    if (!runtime || typeof runtime.getManifest !== "function") {
      return "0.0.0";
    }

    try {
      const manifest = runtime.getManifest();
      return manifest && typeof manifest.version === "string"
        ? manifest.version
        : "0.0.0";
    } catch (error) {
      return "0.0.0";
    }
  }

  app.version = resolveExtensionVersion();
  app.core = app.core || {};
  app.dom = app.dom || {};
  app.runtime = app.runtime || {};
  app.modes = app.modes || {};
  app.ui = app.ui || {};
  app.style = app.style || {};
})();
