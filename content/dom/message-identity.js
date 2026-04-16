(() => {
  const app = globalThis.__CSP__;
  const discoveryCache = app.dom.discoveryCache;

  function readElementAttr(root, attributeName) {
    if (!(root instanceof Element) || !attributeName) {
      return "";
    }

    const directValue = root.getAttribute(attributeName) || "";

    if (directValue) {
      return directValue;
    }

    const descendant = root.querySelector(`[${attributeName}]`);
    return descendant?.getAttribute(attributeName) || "";
  }

  function parseTurnOrder(turnElement, fallbackOrder) {
    if (!(turnElement instanceof HTMLElement)) {
      return fallbackOrder;
    }

    const testId = turnElement.getAttribute("data-testid") || "";
    const match = testId.match(/conversation-turn-(\d+)/);

    if (match) {
      return Number(match[1]);
    }

    return fallbackOrder;
  }

  function buildTextSignature(contentElement) {
    const text = String(contentElement?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      return "0::";
    }

    return `${text.length}:${text.slice(0, 24)}:${text.slice(-48)}`;
  }

  function findTurnContainerFromTarget(target, chatRoot) {
    if (!(target instanceof Element)) {
      return null;
    }

    const turnElement = target.closest(app.dom.selectors.turn);

    if (!(turnElement instanceof HTMLElement)) {
      return null;
    }

    if (chatRoot && !chatRoot.contains(turnElement)) {
      return null;
    }

    return turnElement;
  }

  function findTurnContainerFromMessage(messageElement, chatRoot) {
    if (!(messageElement instanceof HTMLElement)) {
      return null;
    }

    const turnElement = messageElement.closest(app.dom.selectors.turn);

    if (!(turnElement instanceof HTMLElement)) {
      return null;
    }

    if (chatRoot && !chatRoot.contains(turnElement)) {
      return null;
    }

    return turnElement;
  }

  function resolveAuthorRole(contentElement) {
    const roleElement = contentElement.closest("[data-message-author-role]");
    return roleElement ? roleElement.getAttribute("data-message-author-role") || "" : "";
  }

  function resolveStableMessageIdentity(
    messageElement,
    contentElement,
    authorRole,
    routeKey,
    fallbackOrder,
    chatRoot
  ) {
    const currentRouteKey = discoveryCache.getCurrentRouteKey(routeKey);
    const turnElement =
      findTurnContainerFromMessage(messageElement, chatRoot) ||
      findTurnContainerFromTarget(contentElement, chatRoot);
    const messageId =
      readElementAttr(messageElement, "data-message-id") ||
      readElementAttr(contentElement, "data-message-id");
    const turnId =
      (turnElement?.getAttribute("data-turn-id") || "").trim() ||
      readElementAttr(messageElement, "data-turn-id") ||
      readElementAttr(contentElement, "data-turn-id");
    const turnOrder = parseTurnOrder(turnElement, fallbackOrder);

    if (messageId) {
      return {
        routeKey: currentRouteKey,
        stableKey: `${currentRouteKey}::message:${messageId}`,
        identityConfidence: "high",
        stableKeySource: "message-id",
        messageId,
        turnId,
        turnOrder,
      };
    }

    if (turnId) {
      return {
        routeKey: currentRouteKey,
        stableKey: `${currentRouteKey}::turn:${turnId}`,
        identityConfidence: "medium",
        stableKeySource: "turn-id",
        messageId,
        turnId,
        turnOrder,
      };
    }

    return {
      routeKey: currentRouteKey,
      stableKey: `${currentRouteKey}::fallback:${turnOrder}:${authorRole || "unknown"}:${buildTextSignature(
        contentElement
      )}`,
      identityConfidence: "low",
      stableKeySource: "fallback",
      messageId,
      turnId,
      turnOrder,
    };
  }

  const messageIdentity = {
    readElementAttr,
    parseTurnOrder,
    buildTextSignature,
    findTurnContainerFromTarget,
    findTurnContainerFromMessage,
    resolveAuthorRole,
    resolveStableMessageIdentity,
  };

  app.dom.messageIdentity = messageIdentity;
  Object.assign(app.dom, {
    resolveAuthorRole,
    findTurnContainerFromTarget,
    findTurnContainerFromMessage,
  });
})();
