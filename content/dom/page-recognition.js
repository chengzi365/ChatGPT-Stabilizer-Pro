(() => {
  const app = globalThis.__CSP__;
  const discoveryCache = app.dom.discoveryCache;
  const DISCOVERY_REFRESH_REASONS = new Set([
    "startup",
    "route-change",
    "level-change",
    "manual-resync",
    "manual-restore",
    "dom-structure",
    "dom-mutation",
  ]);
  const CONFIDENCE_RANK = Object.freeze({
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
  });
  const BOOTSTRAP_DISCOVERY_SELECTORS = Object.freeze([
    "main",
    "[data-message-author-role]",
    ".markdown",
    "section[data-testid^='conversation-turn-']",
    "section[data-turn-id]",
    "form textarea",
    "form div[contenteditable='true']",
    "form [data-lexical-editor='true']",
  ]);
  const BOOTSTRAP_DISCOVERY_QUERY = BOOTSTRAP_DISCOVERY_SELECTORS.join(", ");

  function getSelectorList(selectorKey) {
    return Array.isArray(app.dom.selectorLists?.[selectorKey])
      ? app.dom.selectorLists[selectorKey]
      : [];
  }

  function getAdapterQuery(adapter, selectorKey) {
    if (!adapter) {
      return "";
    }

    switch (selectorKey) {
      case "content":
        return adapter.contentQuery || "";
      case "message":
        return adapter.messageQuery || "";
      case "composer":
        return adapter.composerQuery || "";
      case "turn":
        return adapter.turnQuery || "";
      case "turnEditor":
        return adapter.turnEditorQuery || "";
      default:
        return "";
    }
  }

  function queryAllMatches(root, selectorInput) {
    if (!(root instanceof Element)) {
      return [];
    }

    const selector =
      typeof selectorInput === "string"
        ? selectorInput.trim()
        : Array.isArray(selectorInput)
        ? selectorInput
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .join(", ")
        : "";

    if (!selector) {
      return [];
    }

    try {
      return Array.from(root.querySelectorAll(selector)).filter(
        (element) => element instanceof HTMLElement
      );
    } catch {
      return [];
    }
  }

  function nodeTouchesDiscoveryCandidate(node) {
    if (node instanceof HTMLElement) {
      if (node.tagName === "MAIN") {
        return true;
      }

      try {
        return Boolean(
          node.matches(BOOTSTRAP_DISCOVERY_QUERY) ||
            node.querySelector(BOOTSTRAP_DISCOVERY_QUERY)
        );
      } catch {
        return false;
      }
    }

    if (
      node instanceof DocumentFragment &&
      typeof node.querySelector === "function"
    ) {
      try {
        return Boolean(node.querySelector(BOOTSTRAP_DISCOVERY_QUERY));
      } catch {
        return false;
      }
    }

    return false;
  }

  function hasComposer(root = document, adapter = app.dom.getActiveAdapter()) {
    return Boolean(
      app.dom.queryFirst(adapter?.composerSelectors || getSelectorList("composer"), root)
    );
  }

  function getRecognitionConfidence(signals) {
    if (!signals || signals.score <= 0) {
      return "none";
    }

    if (
      signals.composerCount > 0 &&
      signals.turnCount > 0 &&
      signals.messageCount > 0 &&
      signals.contentCount > 0 &&
      signals.contentMessageBalance >= 0.45
    ) {
      return "high";
    }

    if (
      (signals.turnCount > 0 && signals.messageCount > 0) ||
      (signals.messageCount > 0 && signals.contentCount > 0)
    ) {
      return "medium";
    }

    return "low";
  }

  function getCachedRootScan(root, adapter, routeKey = "") {
    if (!(root instanceof HTMLElement) || !adapter) {
      return null;
    }

    const scanCache = discoveryCache.getDiscoveryScanCache(routeKey);
    let adapterCache = scanCache.adapterRoots.get(root);

    if (!adapterCache) {
      adapterCache = new Map();
      scanCache.adapterRoots.set(root, adapterCache);
    }

    let rootCache = adapterCache.get(adapter.id);

    if (!rootCache) {
      rootCache = {
        composerPresent: hasComposer(root, adapter),
        turnElements: queryAllMatches(root, getAdapterQuery(adapter, "turn")),
        messageElements: queryAllMatches(root, getAdapterQuery(adapter, "message")),
        contentElements: queryAllMatches(root, getAdapterQuery(adapter, "content")),
      };
      adapterCache.set(adapter.id, rootCache);
    }

    return rootCache;
  }

  function getChatRootSignalsInternal(
    root,
    adapter = app.dom.getActiveAdapter(),
    routeKey = ""
  ) {
    if (!(root instanceof HTMLElement) || !adapter) {
      return discoveryCache.createEmptySignals();
    }

    const rootScan = getCachedRootScan(root, adapter, routeKey);
    const composerCount = rootScan?.composerPresent ? 1 : 0;
    const turnCount = rootScan?.turnElements?.length || 0;
    const messageCount = rootScan?.messageElements?.length || 0;
    const contentCount = rootScan?.contentElements?.length || 0;
    const threadReady = turnCount > 0 || messageCount > 0 || contentCount > 0;
    const isChatShell = composerCount > 0 || threadReady;
    const contentMessageBalance =
      messageCount > 0 && contentCount > 0
        ? Math.min(messageCount, contentCount) /
          Math.max(messageCount, contentCount)
        : 0;
    let score =
      composerCount * 1000 +
      Math.min(turnCount, 200) * 24 +
      Math.min(messageCount, 200) * 12 +
      Math.min(contentCount, 200) * 8;

    if (turnCount > 0 && messageCount > 0) {
      score += 80;
    }

    if (contentCount > 0) {
      score += 40;
    }

    score += Math.round(contentMessageBalance * 100);

    return {
      composerCount,
      turnCount,
      messageCount,
      contentCount,
      contentMessageBalance,
      isChatShell,
      threadReady,
      score: isChatShell ? score : 0,
      recognitionConfidence: getRecognitionConfidence({
        composerCount,
        turnCount,
        messageCount,
        contentCount,
        contentMessageBalance,
        isChatShell,
        threadReady,
        score: isChatShell ? score : 0,
      }),
    };
  }

  function getChatRootSignals(
    root,
    adapter = app.dom.getActiveAdapter(),
    routeKey = ""
  ) {
    return discoveryCache.withDiscoveryScanCache(routeKey, () =>
      getChatRootSignalsInternal(root, adapter, routeKey)
    );
  }

  function compareSignals(left, right) {
    const leftSignals = left || discoveryCache.createEmptySignals();
    const rightSignals = right || discoveryCache.createEmptySignals();

    if (leftSignals.score !== rightSignals.score) {
      return leftSignals.score - rightSignals.score;
    }

    const leftConfidence = CONFIDENCE_RANK[leftSignals.recognitionConfidence] || 0;
    const rightConfidence = CONFIDENCE_RANK[rightSignals.recognitionConfidence] || 0;

    if (leftConfidence !== rightConfidence) {
      return leftConfidence - rightConfidence;
    }

    if (leftSignals.turnCount !== rightSignals.turnCount) {
      return leftSignals.turnCount - rightSignals.turnCount;
    }

    if (leftSignals.messageCount !== rightSignals.messageCount) {
      return leftSignals.messageCount - rightSignals.messageCount;
    }

    return leftSignals.contentCount - rightSignals.contentCount;
  }

  function findRootFallback(adapter) {
    const composer = app.dom.queryFirst(adapter?.composerSelectors || [], document);

    if (composer instanceof HTMLElement) {
      return composer.closest("main");
    }

    const content = app.dom.queryFirst(adapter?.contentSelectors || [], document);

    if (content instanceof HTMLElement) {
      return content.closest("main");
    }

    return document.querySelector("main");
  }

  function selectBestAdapterCandidate(routeKey = "") {
    return discoveryCache.withDiscoveryScanCache(routeKey, () => {
      const adapters = Array.isArray(app.dom.discoveryAdapters)
        ? app.dom.discoveryAdapters
        : [];
      const mains = Array.from(document.querySelectorAll("main"));
      let bestCandidate = null;

      for (let index = 0; index < adapters.length; index += 1) {
        const adapter = adapters[index];
        let bestRoot = null;
        let bestSignals = discoveryCache.createEmptySignals();

        for (let mainIndex = 0; mainIndex < mains.length; mainIndex += 1) {
          const candidateRoot = mains[mainIndex];
          const candidateSignals = getChatRootSignalsInternal(
            candidateRoot,
            adapter,
            routeKey
          );

          if (candidateSignals.score <= 0) {
            continue;
          }

          if (!bestRoot || compareSignals(candidateSignals, bestSignals) > 0) {
            bestRoot = candidateRoot;
            bestSignals = candidateSignals;
          }
        }

        if (!bestRoot) {
          const fallbackRoot = findRootFallback(adapter);
          const fallbackSignals = getChatRootSignalsInternal(
            fallbackRoot,
            adapter,
            routeKey
          );

          if (fallbackRoot instanceof HTMLElement && fallbackSignals.score > 0) {
            bestRoot = fallbackRoot;
            bestSignals = fallbackSignals;
          }
        }

        if (!bestRoot || bestSignals.score <= 0) {
          continue;
        }

        const candidate = {
          adapter,
          chatRoot: bestRoot,
          isChatPage: bestSignals.isChatShell,
          threadReady: bestSignals.threadReady,
          recognitionConfidence: bestSignals.recognitionConfidence,
          signals: bestSignals,
        };

        if (
          !bestCandidate ||
          compareSignals(candidate.signals, bestCandidate.signals) > 0
        ) {
          bestCandidate = candidate;
        }
      }

      return bestCandidate;
    });
  }

  function createDiscoverySnapshot() {
    const discoveryState = discoveryCache.state;

    return {
      chatRoot:
        discoveryState.chatRoot instanceof HTMLElement &&
        discoveryState.chatRoot.isConnected
          ? discoveryState.chatRoot
          : null,
      isChatPage: Boolean(discoveryState.isChatPage),
      threadReady: Boolean(discoveryState.threadReady),
      activeAdapterId: discoveryState.activeAdapterId || "",
      recognitionConfidence: discoveryState.recognitionConfidence || "none",
      signals: {
        ...discoveryState.signals,
      },
    };
  }

  function updateDiscoveryState(result, routeKey) {
    const discoveryState = discoveryCache.state;

    discoveryState.routeKey = discoveryCache.getCurrentRouteKey(routeKey);
    discoveryState.chatRoot = result?.chatRoot || null;
    discoveryState.isChatPage = Boolean(result?.isChatPage);
    discoveryState.threadReady = Boolean(result?.threadReady);
    discoveryState.activeAdapterId = result?.adapter?.id || "";
    discoveryState.recognitionConfidence =
      result?.recognitionConfidence || "none";
    discoveryState.signals = result?.signals
      ? {
          ...result.signals,
        }
      : discoveryCache.createEmptySignals();

    if (result?.adapter) {
      app.dom.applyDiscoveryAdapter(result.adapter);
    }
  }

  function shouldRefreshDiscoveryState({
    reason = "",
    isResync = false,
    routeChangedSinceLastSync = false,
    routeKey = "",
  } = {}) {
    const discoveryState = discoveryCache.state;
    const currentRouteKey = discoveryCache.getCurrentRouteKey(routeKey);

    if (!discoveryState.activeAdapterId) {
      return (
        !discoveryState.routeKey ||
        discoveryState.routeKey !== currentRouteKey ||
        isResync ||
        routeChangedSinceLastSync ||
        DISCOVERY_REFRESH_REASONS.has(reason) ||
        reason === "interaction"
      );
    }

    if (isResync || routeChangedSinceLastSync) {
      return true;
    }

    if (DISCOVERY_REFRESH_REASONS.has(reason)) {
      return true;
    }

    return !(
      discoveryState.chatRoot instanceof HTMLElement &&
      discoveryState.chatRoot.isConnected
    );
  }

  function resolveDiscovery(options = {}) {
    if (shouldRefreshDiscoveryState(options)) {
      updateDiscoveryState(
        selectBestAdapterCandidate(options.routeKey),
        options.routeKey
      );
      return createDiscoverySnapshot();
    }

    return createDiscoverySnapshot();
  }

  function findChatRoot() {
    return resolveDiscovery().chatRoot;
  }

  function isChatPage(chatRoot) {
    const discoveryState = discoveryCache.state;

    if (
      chatRoot &&
      discoveryState.chatRoot === chatRoot &&
      chatRoot instanceof HTMLElement &&
      chatRoot.isConnected
    ) {
      return Boolean(discoveryState.isChatPage);
    }

    return getChatRootSignals(chatRoot).score > 0;
  }

  function findScrollRoot(chatRoot) {
    if (!chatRoot) {
      return document.scrollingElement || document.documentElement;
    }

    let current = chatRoot;

    while (current && current !== document.body) {
      const style = globalThis.getComputedStyle(current);
      const overflowY = style.overflowY;
      const isScrollable = /(auto|scroll|overlay)/.test(overflowY);

      if (isScrollable && current.scrollHeight > current.clientHeight + 8) {
        return current;
      }

      current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  const pageRecognition = {
    DISCOVERY_REFRESH_REASONS,
    BOOTSTRAP_DISCOVERY_SELECTORS,
    BOOTSTRAP_DISCOVERY_QUERY,
    getSelectorList,
    getAdapterQuery,
    queryAllMatches,
    nodeTouchesDiscoveryCandidate,
    hasComposer,
    getRecognitionConfidence,
    getCachedRootScan,
    getChatRootSignalsInternal,
    getChatRootSignals,
    compareSignals,
    findRootFallback,
    selectBestAdapterCandidate,
    createDiscoverySnapshot,
    updateDiscoveryState,
    shouldRefreshDiscoveryState,
    resolveDiscovery,
    findChatRoot,
    isChatPage,
    findScrollRoot,
  };

  app.dom.pageRecognition = pageRecognition;
  Object.assign(app.dom, {
    getChatRootSignals,
    nodeTouchesDiscoveryCandidate,
    resolveDiscovery,
    findChatRoot,
    isChatPage,
    findScrollRoot,
  });
})();
