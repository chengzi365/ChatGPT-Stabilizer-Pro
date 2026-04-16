(() => {
  const app = globalThis.__CSP__;
  const Controller = app.runtime.Controller;

  if (app.instance) {
    return;
  }

  app.core.i18n.init();
  app.core.storage.init();

  const controller = new Controller();
  app.instance = controller;
  controller.init();
})();
