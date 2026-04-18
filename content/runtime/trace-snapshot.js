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

  function isPanelElement(element) {
    return Boolean(
      element instanceof Element &&
        config.panel?.hostId &&
        element.closest(`#${config.panel.hostId}`)
    );
  }

  function getPreferredActiveElement() {
    const activeElement = toElement(document.activeElement);

    if (!isPanelElement(activeElement)) {
      return activeElement;
    }

    const selection = globalThis.getSelection?.();
    const anchorElement = toElement(selection?.anchorNode || null);

    if (!isPanelElement(anchorElement)) {
      return anchorElement;
    }

    const focusElement = toElement(selection?.focusNode || null);

    if (!isPanelElement(focusElement)) {
      return focusElement;
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

  function roundMetric(value) {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }

  function buildTraceIdentifier(traceRecorder, prefix, primaryValue, fallbackValue = "") {
    const value = String(primaryValue || fallbackValue || "").trim();

    if (!value || !traceRecorder || typeof traceRecorder.hashTraceValue !== "function") {
      return "";
    }

    return traceRecorder.hashTraceValue(prefix, value);
  }

  function collectClassFlags(element) {
    if (!(element instanceof Element) || !element.classList) {
      return [];
    }

    const flags = [];

    element.classList.forEach((token) => {
      if (/^csp-/.test(token) && flags.length < 8) {
        flags.push(token);
      }
    });

    return flags;
  }

  function summarizeRect(element) {
    if (!(element instanceof Element) || typeof element.getBoundingClientRect !== "function") {
      return null;
    }

    const rect = element.getBoundingClientRect();

    return {
      width: roundMetric(rect.width),
      height: roundMetric(rect.height),
      top: roundMetric(rect.top),
      bottom: roundMetric(rect.bottom),
    };
  }

  function buildDomPathSegment(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    const tag = element.tagName.toLowerCase();
    const testId = limitText(element.getAttribute("data-testid") || "", 40);
    const role = limitText(element.getAttribute("role") || "", 24);
    const authorRole = limitText(
      element.getAttribute("data-message-author-role") || "",
      16
    );
    let segment = tag;

    if (testId) {
      segment += `[data-testid=${testId}]`;
    } else if (authorRole) {
      segment += `[author=${authorRole}]`;
    } else if (role) {
      segment += `[role=${role}]`;
    } else if (element.hasAttribute("contenteditable")) {
      segment += "[editable]";
    } else if (element.parentElement) {
      const siblings = Array.from(element.parentElement.children).filter(
        (child) => child.tagName === element.tagName
      );

      if (siblings.length > 1) {
        segment += `:nth-of-type(${siblings.indexOf(element) + 1})`;
      }
    }

    return segment;
  }

  function buildDomPathSignature(element, maxDepth = 5) {
    if (!(element instanceof Element)) {
      return "";
    }

    const segments = [];
    let current = element;

    while (current instanceof Element && segments.length < maxDepth) {
      segments.unshift(buildDomPathSegment(current));

      if (
        current.matches(getTurnSelector()) ||
        current.matches("[data-message-author-role]") ||
        current === document.body
      ) {
        break;
      }

      current = current.parentElement;
    }

    return segments.filter(Boolean).join(" > ");
  }

  function summarizeTurn(traceRecorder, turnElement) {
    if (!(turnElement instanceof Element)) {
      return null;
    }

    const messageElement = turnElement.querySelector("[data-message-author-role]");
    const optimizableElements = turnElement.querySelectorAll(".csp-optimizable");
    const keepAliveElements = turnElement.querySelectorAll(".csp-keep-alive");
    const testId = turnElement.getAttribute("data-testid") || "";
    const rawTurnId = turnElement.getAttribute("data-turn-id") || "";
    const rawMessageId = messageElement?.getAttribute("data-message-id") || "";

    return {
      testId,
      turnIndex: parseTurnIndex(testId),
      turnHash: buildTraceIdentifier(traceRecorder, "t", rawTurnId, testId),
      turnRole: turnElement.getAttribute("data-turn") || "",
      scrollAnchor: limitText(
        turnElement.getAttribute("data-scroll-anchor") || "",
        40
      ),
      messageHash: buildTraceIdentifier(traceRecorder, "m", rawMessageId),
      authorRole:
        messageElement?.getAttribute("data-message-author-role") || "",
      editing: Boolean(turnElement.querySelector(getTurnEditorSelector())),
      optimizableCount: optimizableElements.length,
      keepAliveCount: keepAliveElements.length,
    };
  }

  function summarizeElement(traceRecorder, element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const turnElement = element.closest(getTurnSelector());
    const messageElement = element.closest("[data-message-author-role]");
    const testId = element.getAttribute("data-testid") || "";
    const rawTurnId =
      element.getAttribute("data-turn-id") ||
      turnElement?.getAttribute("data-turn-id") ||
      "";
    const rawMessageId =
      element.getAttribute("data-message-id") ||
      messageElement?.getAttribute("data-message-id") ||
      "";

    return {
      tag: element.tagName.toLowerCase(),
      domId: limitText(element.id || "", 48),
      role: element.getAttribute("role") || "",
      testId,
      domPathSignature: buildDomPathSignature(element),
      turnHash: buildTraceIdentifier(traceRecorder, "t", rawTurnId, testId),
      messageHash: buildTraceIdentifier(traceRecorder, "m", rawMessageId),
      authorRole:
        element.getAttribute("data-message-author-role") ||
        messageElement?.getAttribute("data-message-author-role") ||
        "",
      isEditable:
        element.matches(getTurnEditorSelector()) ||
        Boolean(element.closest(getTurnEditorSelector())),
      isConnected: Boolean(element.isConnected),
      isOptimizable: element.classList.contains("csp-optimizable"),
      isKeepAlive: element.classList.contains("csp-keep-alive"),
      hidden: element.hidden,
      open: typeof element.open === "boolean" ? element.open : false,
      ariaBusy: element.getAttribute("aria-busy") === "true",
      classFlags: collectClassFlags(element),
      rect: summarizeRect(element),
    };
  }

  function summarizeRecord(traceRecorder, record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const sourceElement =
      record.contentElement instanceof Element
        ? record.contentElement
        : record.messageElement instanceof Element
        ? record.messageElement
        : null;
    const sourceTestId =
      sourceElement?.getAttribute("data-testid") ||
      record.messageElement?.getAttribute?.("data-testid") ||
      record.contentElement?.getAttribute?.("data-testid") ||
      "";

    return {
      recordId: Number.isFinite(record.id) ? record.id : 0,
      orderIndex: Number.isFinite(record.orderIndex) ? record.orderIndex : -1,
      turnHash: buildTraceIdentifier(
        traceRecorder,
        "t",
        record.turnId || "",
        sourceTestId || record.stableKey || String(record.id || "")
      ),
      messageHash: buildTraceIdentifier(
        traceRecorder,
        "m",
        record.messageId || "",
        record.stableKey || String(record.id || "")
      ),
      authorRole: record.authorRole || "",
      optimized: Boolean(record.optimized),
      protected: Boolean(record.protected),
      visible: Boolean(record.visible),
      nearViewport: Boolean(record.nearViewport),
      streaming: Boolean(record.streaming),
      modeId: record.modeState?.modeId || "",
      distanceTier: record.modeState?.distanceTier || "",
      domPathSignature: sourceElement ? buildDomPathSignature(sourceElement) : "",
    };
  }

  function parseTurnIndex(testId) {
    const match = String(testId || "").match(/conversation-turn-(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function collectTurnKeys(turns) {
    return turns
      .map((turn) => turn?.turnHash || turn?.testId || "")
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

  function classifyConversationScope(pathname, hasChatRoot) {
    if (hasChatRoot || /^\/(?:c|g)\/|^\/$/.test(pathname || "")) {
      return "chat";
    }

    if (/settings/i.test(pathname || "")) {
      return "settings";
    }

    if (/library|gpts/i.test(pathname || "")) {
      return "library";
    }

    return "unknown";
  }

  app.runtime.traceRecorderSnapshotMethods = {
    hashTraceValue(prefix, value) {
      const rawValue = String(value || "").trim();

      if (!rawValue) {
        return "";
      }

      this.ensureTraceSession();
      const source = `${this.runtime.exportSalt}|${rawValue}`;
      let hash = 2166136261;

      for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }

      return `${prefix}_${(hash >>> 0).toString(36).slice(0, 8)}`;
    },

    buildRouteSummary(locationLike = globalThis.location, chatRoot = null) {
      const pathname = locationLike?.pathname || "";
      const search = locationLike?.search || "";
      const hash = locationLike?.hash || "";
      const rawPath = `${pathname}${search}${hash}`;

      return {
        routeHash: this.hashTraceValue("r", rawPath),
        pathHash: this.hashTraceValue("p", pathname),
        pathDepth: pathname.split("/").filter(Boolean).length,
        conversationScope: classifyConversationScope(pathname, Boolean(chatRoot)),
      };
    },

    buildEventDetail(event) {
      const target = toElement(event.target);
      const detail = {
        target: summarizeElement(this, target),
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

    buildTraceRecordSummary(record) {
      return summarizeRecord(this, record);
    },

    buildTraceRecordSummaries(records, maxSize = 8) {
      const source = Array.isArray(records) ? records : [];
      const summaries = [];

      for (let index = 0; index < source.length && summaries.length < maxSize; index += 1) {
        const summary = summarizeRecord(this, source[index]);

        if (summary) {
          summaries.push(summary);
        }
      }

      return summaries;
    },

    collectTurnSummariesFromNode(node, output) {
      const element = toElement(node);

      if (!(element instanceof Element)) {
        return;
      }

      if (element.matches(getTurnSelector())) {
        const summary = summarizeTurn(this, element);

        if (summary) {
          output.push(summary);
        }
      }

      element.querySelectorAll(getTurnSelector()).forEach((turnElement) => {
        const summary = summarizeTurn(this, turnElement);

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
              target: summarizeElement(this, toElement(mutation.target)),
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
        const key = turn.turnHash || turn.testId;

        if (!key || seenAdded.has(key)) {
          return;
        }

        seenAdded.add(key);
        uniqueAddedTurns.push(turn);
      });
      removedTurns.forEach((turn) => {
        const key = turn.turnHash || turn.testId;

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
        .map((turnElement) => summarizeTurn(this, turnElement))
        .filter(Boolean);
      const activeElement = getPreferredActiveElement();
      const editableState =
        typeof app.dom.getThreadEditLifecycleState === "function"
          ? app.dom.getThreadEditLifecycleState(chatRoot)
          : {
              editableTurnCount: chatRoot
                ? chatRoot.querySelectorAll(getTurnEditorSelector()).length
                : 0,
              editableTurns: [],
            };
      const editableTurnHashes = limitArray(
        (editableState.editableTurns || [])
          .map((turnElement) => summarizeTurn(this, turnElement))
          .filter(Boolean)
          .map((turn) => turn.turnHash || turn.testId || "")
          .filter(Boolean),
        tailTurnCount
      );
      const lastTurn = tailTurns[tailTurns.length - 1] || null;
      const routeSummary = this.buildRouteSummary(globalThis.location, chatRoot);

      return {
        ...routeSummary,
        isChatPage: Boolean(chatRoot),
        adapterId: this.controller?.state?.page?.activeAdapterId || "",
        turnCount: turnElements.length,
        messageCount: chatRoot
          ? chatRoot.querySelectorAll("[data-message-author-role]").length
          : 0,
        editableTurnCount: editableState.editableTurnCount || 0,
        editableTurnHashes,
        cspOptimizableCount: chatRoot
          ? chatRoot.querySelectorAll(".csp-optimizable").length
          : 0,
        cspKeepAliveCount: chatRoot
          ? chatRoot.querySelectorAll(".csp-keep-alive").length
          : 0,
        lastTurn,
        lastTurnHash: lastTurn?.turnHash || lastTurn?.testId || "",
        tailTurns,
        tailTurnHashes: tailTurns
          .map((turn) => turn.turnHash || turn.testId || "")
          .filter(Boolean),
        activeElement: summarizeElement(this, activeElement),
      };
    },

    buildSnapshotDelta(previousSnapshot, nextSnapshot) {
      if (!previousSnapshot || !nextSnapshot) {
        return null;
      }

      const maxTurnDiffIds = Math.max(4, config.trace.maxTurnDiffIds || 24);
      const previousTurnIds = collectTurnKeys(previousSnapshot.tailTurns || []);
      const nextTurnIds = collectTurnKeys(nextSnapshot.tailTurns || []);
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
          (previousSnapshot.lastTurn?.turnHash || previousSnapshot.lastTurn?.testId) !==
            (nextSnapshot.lastTurn?.turnHash || nextSnapshot.lastTurn?.testId) ||
          (previousSnapshot.lastTurn?.messageHash || "") !==
            (nextSnapshot.lastTurn?.messageHash || ""),
        tailAdded: tailDelta.added,
        tailRemoved: tailDelta.removed,
      };
    },
  };
})();
