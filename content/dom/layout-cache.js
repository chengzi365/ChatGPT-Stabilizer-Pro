(() => {
  const app = globalThis.__CSP__;

  function createEmptyLayoutCache() {
    return {
      height: 0,
      signature: "",
      measuredAt: 0,
    };
  }

  function buildLayoutSignature(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    const rect = element.getBoundingClientRect();
    const style = globalThis.getComputedStyle(element);
    const width = Math.round(
      rect.width || element.clientWidth || element.offsetWidth || 0
    );

    return [
      width,
      style.fontSize || "",
      style.lineHeight || "",
      style.whiteSpace || "",
      style.wordBreak || "",
    ].join("|");
  }

  function applyLayoutCache(record, height, signature, measuredAt) {
    record.layoutCache = {
      height,
      signature: signature || "",
      measuredAt,
    };
    record.lastMeasuredHeight = height;
    record.performanceExpandedHeight = height;
  }

  function clearLayoutCache(record) {
    record.layoutCache = createEmptyLayoutCache();
    record.lastMeasuredHeight = 0;
    record.performanceExpandedHeight = 0;
  }

  app.dom.layoutCache = Object.freeze({
    createEmptyLayoutCache,
    buildLayoutSignature,
    applyLayoutCache,
    clearLayoutCache,
  });

  Object.assign(app.dom, {
    createEmptyLayoutCache,
    buildLayoutSignature,
  });
})();
