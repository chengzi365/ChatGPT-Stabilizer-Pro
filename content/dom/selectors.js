(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;

  function normalizeSelectorList(selectorList, fallback = []) {
    const source = Array.isArray(selectorList) ? selectorList : fallback;
    const normalized = [];

    for (let index = 0; index < source.length; index += 1) {
      const selector = String(source[index] || "").trim();

      if (!selector || normalized.includes(selector)) {
        continue;
      }

      normalized.push(selector);
    }

    return normalized;
  }

  function createSelectorString(selectorList) {
    return normalizeSelectorList(selectorList).join(", ");
  }

  function createAdapter(adapter, index) {
    const id = String(adapter?.id || `adapter-${index + 1}`).trim();
    const contentSelectors = normalizeSelectorList(
      adapter?.contentSelectors,
      config.selectors.content
    );
    const messageSelectors = normalizeSelectorList(
      adapter?.messageSelectors,
      config.selectors.message
    );
    const composerSelectors = normalizeSelectorList(
      adapter?.composerSelectors,
      config.selectors.composer
    );
    const turnSelectors = normalizeSelectorList(
      adapter?.turnSelectors,
      config.selectors.turn
    );
    const turnEditorSelectors = normalizeSelectorList(
      adapter?.turnEditorSelectors,
      config.selectors.turnEditor
    );

    return {
      id,
      contentSelectors,
      contentQuery: createSelectorString(contentSelectors),
      messageSelectors,
      messageQuery: createSelectorString(messageSelectors),
      composerSelectors,
      composerQuery: createSelectorString(composerSelectors),
      turnSelectors,
      turnQuery: createSelectorString(turnSelectors),
      turnEditorSelectors,
      turnEditorQuery: createSelectorString(turnEditorSelectors),
    };
  }

  const discoveryAdapters = Array.isArray(config.selectors.adapters)
    ? config.selectors.adapters.map((adapter, index) => createAdapter(adapter, index))
    : [createAdapter({}, 0)];
  const selectorLists = {
    content: [],
    message: [],
    composer: [],
    turn: [],
    turnEditor: [],
  };
  const selectors = {
    content: "",
    message: "",
    composer: "",
    turn: "",
    turnEditor: "",
  };
  let activeAdapter = discoveryAdapters[0] || null;

  function applyDiscoveryAdapter(adapter) {
    if (!adapter) {
      return null;
    }

    activeAdapter = adapter;
    selectorLists.content = [...adapter.contentSelectors];
    selectorLists.message = [...adapter.messageSelectors];
    selectorLists.composer = [...adapter.composerSelectors];
    selectorLists.turn = [...adapter.turnSelectors];
    selectorLists.turnEditor = [...adapter.turnEditorSelectors];
    selectors.content = createSelectorString(selectorLists.content);
    selectors.message = createSelectorString(selectorLists.message);
    selectors.composer = createSelectorString(selectorLists.composer);
    selectors.turn = createSelectorString(selectorLists.turn);
    selectors.turnEditor = createSelectorString(selectorLists.turnEditor);

    return activeAdapter;
  }

  function queryFirst(selectorInput, root = document) {
    const selectorList =
      typeof selectorInput === "string"
        ? [selectorInput]
        : normalizeSelectorList(selectorInput);

    for (let index = 0; index < selectorList.length; index += 1) {
      const selector = selectorList[index];

      try {
        const element = root.querySelector(selector);

        if (element) {
          return element;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  applyDiscoveryAdapter(activeAdapter);

  app.dom.selectors = selectors;
  app.dom.selectorLists = selectorLists;
  app.dom.discoveryAdapters = discoveryAdapters;
  app.dom.getActiveAdapter = () => activeAdapter;
  app.dom.applyDiscoveryAdapter = applyDiscoveryAdapter;
  app.dom.queryFirst = queryFirst;
})();
