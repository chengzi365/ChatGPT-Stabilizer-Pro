(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const FALLBACK_TURN_SELECTOR =
    "section[data-testid^='conversation-turn-'], section[data-turn-id]";
  const FALLBACK_EDITOR_SELECTOR =
    "textarea, [data-writing-block], [contenteditable='true'], [contenteditable='']";

  function getTurnSelector() {
    return app.dom.selectors?.turn || FALLBACK_TURN_SELECTOR;
  }

  function getTurnEditorSelector() {
    return app.dom.selectors?.turnEditor || FALLBACK_EDITOR_SELECTOR;
  }

  function toElement(target) {
    if (target instanceof Element) {
      return target;
    }

    if (target instanceof Node) {
      return target.parentElement;
    }

    return null;
  }

  function limitText(value, maxLength = 120) {
    const compact = String(value || "").replace(/\s+/g, " ").trim();

    if (!compact) {
      return "";
    }

    return compact.length > maxLength
      ? `${compact.slice(0, Math.max(0, maxLength - 1))}...`
      : compact;
  }

  function limitArray(values, maxSize) {
    if (!Array.isArray(values) || values.length <= maxSize) {
      return Array.isArray(values) ? values : [];
    }

    return values.slice(0, maxSize);
  }

  function safeClassName(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    if (typeof element.className !== "string") {
      return "";
    }

    return limitText(element.className, 120);
  }

  function parseTurnIndex(testId) {
    const match = String(testId || "").match(/conversation-turn-(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function summarizeTurn(turnElement) {
    if (!(turnElement instanceof Element)) {
      return null;
    }

    const messageElement = turnElement.querySelector("[data-message-author-role]");
    const optimizableElements = turnElement.querySelectorAll(".csp-optimizable");
    const keepAliveElements = turnElement.querySelectorAll(".csp-keep-alive");

    return {
      testId: turnElement.getAttribute("data-testid") || "",
      turnIndex: parseTurnIndex(turnElement.getAttribute("data-testid") || ""),
      turnId: turnElement.getAttribute("data-turn-id") || "",
      turnRole: turnElement.getAttribute("data-turn") || "",
      scrollAnchor: turnElement.getAttribute("data-scroll-anchor") || "",
      messageId: messageElement?.getAttribute("data-message-id") || "",
      authorRole:
        messageElement?.getAttribute("data-message-author-role") || "",
      editing: Boolean(turnElement.querySelector(getTurnEditorSelector())),
      optimizableCount: optimizableElements.length,
      keepAliveCount: keepAliveElements.length,
    };
  }

  function summarizeElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const turnElement = element.closest(getTurnSelector());
    const messageElement = element.closest("[data-message-author-role]");

    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      className: safeClassName(element),
      role: element.getAttribute("role") || "",
      testId: element.getAttribute("data-testid") || "",
      turnId:
        element.getAttribute("data-turn-id") ||
        turnElement?.getAttribute("data-turn-id") ||
        "",
      messageId:
        element.getAttribute("data-message-id") ||
        messageElement?.getAttribute("data-message-id") ||
        "",
      authorRole:
        element.getAttribute("data-message-author-role") ||
        messageElement?.getAttribute("data-message-author-role") ||
        "",
      ariaLabel: limitText(element.getAttribute("aria-label") || "", 80),
      title: limitText(element.getAttribute("title") || "", 80),
      text: limitText(element.textContent || "", 120),
    };
  }

  function collectTurnIds(turns) {
    return turns
      .map((turn) => turn?.turnId || turn?.testId || "")
      .filter(Boolean);
  }

  function diffIdentifierLists(previousIds, nextIds, maxSize) {
    const previousSet = new Set(previousIds);
    const nextSet = new Set(nextIds);
    const added = [];
    const removed = [];

    nextIds.forEach((id) => {
      if (!previousSet.has(id)) {
        added.push(id);
      }
    });
    previousIds.forEach((id) => {
      if (!nextSet.has(id)) {
        removed.push(id);
      }
    });

    return {
      added: limitArray(added, maxSize),
      removed: limitArray(removed, maxSize),
    };
  }

  app.runtime.traceRecorderSnapshotMethods = {
    buildEventDetail(event) {
      const target = toElement(event.target);
      const detail = {
        target: summarizeElement(target),
      };

      if (typeof event.button === "number") {
        detail.button = event.button;
      }

      if (typeof event.pointerType === "string" && event.pointerType) {
        detail.pointerType = event.pointerType;
      }

      if (typeof event.key === "string" && event.key) {
        detail.key = event.key;
        detail.meta = Boolean(event.metaKey);
        detail.ctrl = Boolean(event.ctrlKey);
        detail.shift = Boolean(event.shiftKey);
        detail.alt = Boolean(event.altKey);
      }

      if (typeof event.inputType === "string" && event.inputType) {
        detail.inputType = event.inputType;
      }

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        detail.valueLength = target.value.length;
      }

      return detail;
    },

    collectTurnSummariesFromNode(node, output) {
      const element = toElement(node);

      if (!(element instanceof Element)) {
        return;
      }

      if (element.matches(getTurnSelector())) {
        const summary = summarizeTurn(element);

        if (summary) {
          output.push(summary);
        }
      }

      element.querySelectorAll(getTurnSelector()).forEach((turnElement) => {
        const summary = summarizeTurn(turnElement);

        if (summary) {
          output.push(summary);
        }
      });
    },

    buildMutationSummary(mutations) {
      const maxMutationSamples = Math.max(4, config.trace.maxMutationSamples || 12);
      const maxTurnDiffIds = Math.max(4, config.trace.maxTurnDiffIds || 24);
      const addedTurns = [];
      const removedTurns = [];
      const attributeChanges = [];
      let childListCount = 0;
      let attributeCount = 0;
      let characterDataCount = 0;
      let addedNodeCount = 0;
      let removedNodeCount = 0;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          childListCount += 1;
          addedNodeCount += mutation.addedNodes.length;
          removedNodeCount += mutation.removedNodes.length;
          mutation.addedNodes.forEach((node) => {
            this.collectTurnSummariesFromNode(node, addedTurns);
          });
          mutation.removedNodes.forEach((node) => {
            this.collectTurnSummariesFromNode(node, removedTurns);
          });
          return;
        }

        if (mutation.type === "attributes") {
          attributeCount += 1;

          if (attributeChanges.length < maxMutationSamples) {
            attributeChanges.push({
              name: mutation.attributeName || "",
              target: summarizeElement(toElement(mutation.target)),
            });
          }
          return;
        }

        if (mutation.type === "characterData") {
          characterDataCount += 1;
        }
      });

      const uniqueAddedTurns = [];
      const uniqueRemovedTurns = [];
      const seenAdded = new Set();
      const seenRemoved = new Set();

      addedTurns.forEach((turn) => {
        const key = turn.turnId || turn.testId;

        if (!key || seenAdded.has(key)) {
          return;
        }

        seenAdded.add(key);
        uniqueAddedTurns.push(turn);
      });
      removedTurns.forEach((turn) => {
        const key = turn.turnId || turn.testId;

        if (!key || seenRemoved.has(key)) {
          return;
        }

        seenRemoved.add(key);
        uniqueRemovedTurns.push(turn);
      });

      return {
        mutationCount: mutations.length,
        childListCount,
        attributeCount,
        characterDataCount,
        addedNodeCount,
        removedNodeCount,
        addedTurns: limitArray(uniqueAddedTurns, maxTurnDiffIds),
        removedTurns: limitArray(uniqueRemovedTurns, maxTurnDiffIds),
        attributeChanges,
      };
    },

    buildSnapshot() {
      const chatRoot = app.dom.findChatRoot();
      const turnSelector = getTurnSelector();
      const turnElements = chatRoot
        ? Array.from(chatRoot.querySelectorAll(turnSelector))
        : [];
      const tailTurnCount = Math.max(4, config.trace.tailTurnCount || 10);
      const tailTurns = turnElements
        .slice(-tailTurnCount)
        .map((turnElement) => summarizeTurn(turnElement))
        .filter(Boolean);
      const activeElement = toElement(document.activeElement);
      const editableState =
        typeof app.dom.getThreadEditLifecycleState === "function"
          ? app.dom.getThreadEditLifecycleState(chatRoot)
          : {
              editableTurnCount: chatRoot
                ? chatRoot.querySelectorAll(getTurnEditorSelector()).length
                : 0,
              editableTurns: [],
            };
      const editableTurnIds = limitArray(
        (editableState.editableTurns || [])
          .map((turnElement) => summarizeTurn(turnElement))
          .filter(Boolean)
          .map((turn) => turn.turnId || turn.testId || "")
          .filter(Boolean),
        tailTurnCount
      );
      const lastTurn = tailTurns[tailTurns.length - 1] || null;

      return {
        routeKey: this.controller.getRouteKey(),
        path: globalThis.location.pathname,
        title: document.title || "",
        turnCount: turnElements.length,
        messageCount: chatRoot
          ? chatRoot.querySelectorAll("[data-message-author-role]").length
          : 0,
        editableTurnCount: editableState.editableTurnCount || 0,
        editableTurnIds,
        cspOptimizableCount: chatRoot
          ? chatRoot.querySelectorAll(".csp-optimizable").length
          : 0,
        cspKeepAliveCount: chatRoot
          ? chatRoot.querySelectorAll(".csp-keep-alive").length
          : 0,
        lastTurn,
        tailTurns,
        activeElement: summarizeElement(activeElement),
      };
    },

    buildSnapshotDelta(previousSnapshot, nextSnapshot) {
      if (!previousSnapshot || !nextSnapshot) {
        return null;
      }

      const maxTurnDiffIds = Math.max(4, config.trace.maxTurnDiffIds || 24);
      const previousTurnIds = collectTurnIds(previousSnapshot.tailTurns || []);
      const nextTurnIds = collectTurnIds(nextSnapshot.tailTurns || []);
      const tailDelta = diffIdentifierLists(
        previousTurnIds,
        nextTurnIds,
        maxTurnDiffIds
      );

      return {
        turnCountDelta: nextSnapshot.turnCount - previousSnapshot.turnCount,
        messageCountDelta:
          nextSnapshot.messageCount - previousSnapshot.messageCount,
        editableTurnCountDelta:
          nextSnapshot.editableTurnCount - previousSnapshot.editableTurnCount,
        cspOptimizableCountDelta:
          nextSnapshot.cspOptimizableCount -
          previousSnapshot.cspOptimizableCount,
        cspKeepAliveCountDelta:
          nextSnapshot.cspKeepAliveCount - previousSnapshot.cspKeepAliveCount,
        lastTurnChanged:
          (previousSnapshot.lastTurn?.turnId || previousSnapshot.lastTurn?.testId) !==
            (nextSnapshot.lastTurn?.turnId || nextSnapshot.lastTurn?.testId) ||
          (previousSnapshot.lastTurn?.messageId || "") !==
            (nextSnapshot.lastTurn?.messageId || ""),
        tailAdded: tailDelta.added,
        tailRemoved: tailDelta.removed,
      };
    },
  };
})();
