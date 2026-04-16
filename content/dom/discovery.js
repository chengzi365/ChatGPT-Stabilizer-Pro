(() => {
  const app = globalThis.__CSP__;

  app.dom.discovery = Object.freeze({
    cache: app.dom.discoveryCache || null,
    recognition: app.dom.pageRecognition || null,
    identity: app.dom.messageIdentity || null,
    collection: app.dom.messageCollection || null,
  });
})();
