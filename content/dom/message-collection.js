(() => {
  const app = globalThis.__CSP__;
  const pageRecognition = app.dom.pageRecognition;
  const messageIdentity = app.dom.messageIdentity;
  const discoveryCache = app.dom.discoveryCache;

  function resolveMessageContainer(contentElement, chatRoot) {
    let current = contentElement;

    while (current && current !== chatRoot && current !== document.body) {
      if (current.matches(app.dom.selectors.message)) {
        return current;
      }

      if (
        current !== contentElement &&
        typeof current.className === "string" &&
        current.className.includes("group")
      ) {
        return current;
      }

      current = current.parentElement;
    }

    return contentElement.parentElement || contentElement;
  }

  function isTurnEditing(turnElement) {
    if (!(turnElement instanceof HTMLElement)) {
      return false;
    }

    return Boolean(turnElement.querySelector(app.dom.selectors.turnEditor));
  }

  function findEditableTurns(chatRoot) {
    if (!(chatRoot instanceof HTMLElement)) {
      return [];
    }

    const turns = pageRecognition.queryAllMatches(chatRoot, app.dom.selectors.turn);
    const editableTurns = [];

    for (let index = 0; index < turns.length; index += 1) {
      const turnElement = turns[index];

      if (isTurnEditing(turnElement)) {
        editableTurns.push(turnElement);
      }
    }

    return editableTurns;
  }

  function getThreadEditLifecycleState(chatRoot) {
    const editableTurns = findEditableTurns(chatRoot);

    return {
      hasEditingTurn: editableTurns.length > 0,
      editableTurnCount: editableTurns.length,
      editableTurns,
    };
  }

  function findMessageContainerFromTarget(target, chatRoot) {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    let current = target;

    while (current && current !== chatRoot && current !== document.body) {
      if (current.matches(app.dom.selectors.message)) {
        return current;
      }

      if (
        current !== target &&
        typeof current.className === "string" &&
        current.className.includes("group")
      ) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function findContentElementFromTarget(target, chatRoot) {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const contentElement = target.closest(app.dom.selectors.content);

    if (!(contentElement instanceof HTMLElement)) {
      return null;
    }

    if (chatRoot && !chatRoot.contains(contentElement)) {
      return null;
    }

    return contentElement;
  }

  function nodeTouchesStructure(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    if (
      node.matches(app.dom.selectors.content) ||
      node.matches(app.dom.selectors.message)
    ) {
      return true;
    }

    return Boolean(
      node.querySelector(`${app.dom.selectors.content}, ${app.dom.selectors.message}`)
    );
  }

  function collectMessageUnits(chatRoot, routeKey) {
    return discoveryCache.withDiscoveryScanCache(routeKey, () => {
      const root = chatRoot || document;
      const activeAdapter = app.dom.getActiveAdapter();
      const cachedRootScan =
        root instanceof HTMLElement
          ? pageRecognition.getCachedRootScan(root, activeAdapter, routeKey)
          : null;
      const contentElements =
        cachedRootScan?.contentElements ||
        pageRecognition.queryAllMatches(root, app.dom.selectors.content);
      const units = [];
      const seenContents = new Set();
      let skipped = 0;
      let failures = 0;

      for (let index = 0; index < contentElements.length; index += 1) {
        const contentElement = contentElements[index];

        if (!(contentElement instanceof HTMLElement) || !contentElement.isConnected) {
          skipped += 1;
          continue;
        }

        if (seenContents.has(contentElement)) {
          skipped += 1;
          continue;
        }

        const messageElement = resolveMessageContainer(contentElement, chatRoot);

        if (!(messageElement instanceof HTMLElement)) {
          failures += 1;
          continue;
        }

        const authorRole = messageIdentity.resolveAuthorRole(contentElement);
        const identity = messageIdentity.resolveStableMessageIdentity(
          messageElement,
          contentElement,
          authorRole,
          routeKey,
          units.length + 1,
          chatRoot
        );

        seenContents.add(contentElement);
        units.push({
          messageElement,
          contentElement,
          authorRole,
          routeKey: identity.routeKey,
          stableKey: identity.stableKey,
          identityConfidence: identity.identityConfidence,
          stableKeySource: identity.stableKeySource,
          messageId: identity.messageId,
          turnId: identity.turnId,
          turnOrder: identity.turnOrder,
        });
      }

      return {
        units,
        skipped,
        failures,
      };
    });
  }

  function collectMessageElements(chatRoot, routeKey = "") {
    return discoveryCache.withDiscoveryScanCache(routeKey, () => {
      const root = chatRoot || document;
      const activeAdapter = app.dom.getActiveAdapter();
      const cachedRootScan =
        root instanceof HTMLElement
          ? pageRecognition.getCachedRootScan(root, activeAdapter, routeKey)
          : null;
      const candidates =
        cachedRootScan?.messageElements ||
        pageRecognition.queryAllMatches(root, app.dom.selectors.message);
      const messages = [];
      const seen = new Set();

      for (let index = 0; index < candidates.length; index += 1) {
        const element = candidates[index];

        if (!(element instanceof HTMLElement) || !element.isConnected || seen.has(element)) {
          continue;
        }

        if (
          element.matches("[data-message-author-role]") &&
          element.parentElement?.closest("[data-message-author-role]")
        ) {
          continue;
        }

        if (
          element.matches("article") &&
          element.querySelector("[data-message-author-role]")
        ) {
          continue;
        }

        seen.add(element);
        messages.push(element);
      }

      return messages;
    });
  }

  const messageCollection = {
    resolveMessageContainer,
    isTurnEditing,
    findEditableTurns,
    getThreadEditLifecycleState,
    findMessageContainerFromTarget,
    findContentElementFromTarget,
    nodeTouchesStructure,
    collectMessageUnits,
    collectMessageElements,
  };

  app.dom.messageCollection = messageCollection;
  Object.assign(app.dom, {
    resolveMessageContainer,
    findMessageContainerFromTarget,
    findContentElementFromTarget,
    isTurnEditing,
    findEditableTurns,
    getThreadEditLifecycleState,
    nodeTouchesStructure,
    collectMessageUnits,
    collectMessageElements,
  });
})();
