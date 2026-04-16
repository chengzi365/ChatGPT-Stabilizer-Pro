(() => {
  const app = globalThis.__CSP__;

  const capabilities = {
    detect() {
      return {
        contentVisibility:
          typeof CSS !== "undefined" &&
          CSS.supports &&
          CSS.supports("content-visibility", "auto"),
        containIntrinsicSize:
          typeof CSS !== "undefined" &&
          CSS.supports &&
          CSS.supports("contain-intrinsic-size", "auto 1px"),
      };
    },
  };

  app.core.capabilities = capabilities;
})();
