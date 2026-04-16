(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const INTERACTION_RECORD_FAST_PATH_DEPTH = 8;

  function getElementTarget(targetNode) {
    if (targetNode instanceof Element) {
      return targetNode;
    }

    if (targetNode instanceof Node) {
      return targetNode.parentElement;
    }

    return null;
  }

  function getButtonCandidate(targetNode) {
    const target = getElementTarget(targetNode);

    if (!(target instanceof Element)) {
      return null;
    }

    return target.closest("button, [role='button']");
  }

  function matchesBottomFollowTriggerLabel(button) {
    const label = [
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
      button.textContent || "",
    ]
      .join(" ")
      .trim()
      .toLowerCase();

    if (!label) {
      return false;
    }

    return /scroll to bottom|jump to bottom|back to bottom|latest|new messages|回到底部|滚动到底部|最新消息|底部/.test(
      label
    );
  }

  function isFloatingBottomButton(button) {
    if (!(button instanceof HTMLElement)) {
      return false;
    }

    const rect = button.getBoundingClientRect();

    if (
      rect.width < 20 ||
      rect.width > 120 ||
      rect.height < 20 ||
      rect.height > 96 ||
      rect.top < globalThis.innerHeight * 0.45 ||
      rect.bottom > globalThis.innerHeight + 8
    ) {
      return false;
    }

    if (button.closest(`#${config.panel.hostId}`) || button.closest("form")) {
      return false;
    }

    let current = button;
    let depth = 0;

    while (current && depth < 4) {
      const style = globalThis.getComputedStyle(current);

      if (/(fixed|sticky|absolute)/.test(style.position)) {
        return true;
      }

      current = current.parentElement;
      depth += 1;
    }

    return false;
  }

  function isNativeInteractiveTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(
        "button, a[href], input, textarea, select, option, summary, [role='button'], [contenteditable='true'], [contenteditable='']"
      )
    );
  }

  app.dom.interactionControllerMethods = {
    installInteractionWatchers() {
      const observerState = this.state.observers;

      if (observerState.interactionWatchersInstalled) {
        return;
      }

      observerState.interactionWatchersInstalled = true;

      const handleInteraction = (event) => {
        this.handleInteractionEvent(event);
      };

      document.addEventListener("pointerdown", handleInteraction, true);
      document.addEventListener("keydown", handleInteraction, true);
      document.addEventListener("focusin", handleInteraction, true);
      document.addEventListener("input", handleInteraction, true);
      document.addEventListener("focusout", (event) => {
        this.handleFocusOutEvent(event);
      }, true);
      document.addEventListener("pointerover", (event) => {
        this.handleHoverEvent(event);
      }, true);
      document.addEventListener("pointerout", (event) => {
        this.handleHoverEvent(event);
      }, true);
      document.addEventListener("selectionchange", () => {
        this.handleSelectionChange();
      });
    },

    markProtectionStateRecordsDirty(previousRecordId, nextRecordId) {
      const touchedIds = [previousRecordId, nextRecordId];

      for (let index = 0; index < touchedIds.length; index += 1) {
        const recordId = touchedIds[index];

        if (!Number.isFinite(recordId) || recordId <= 0) {
          continue;
        }

        const record = this.registry.getById(recordId);

        if (record) {
          this.markRecordForBaseStateRefresh(record);
          this.markRecordForModeDecision(record);
        }
      }
    },

    updateFocusedRecordState(record) {
      const protectionState = this.state.protection;
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;
      const nextRecordId = record?.id || 0;
      const previousRecordId = protectionState.focusedRecordId || 0;

      if (previousRecordId === nextRecordId) {
        return;
      }

      protectionState.focusedRecordId = nextRecordId;
      this.markProtectionStateRecordsDirty(previousRecordId, nextRecordId);

      if (runtimeState.level !== "off" && pageState.chatRoot) {
        this.scheduleSync("interaction", false);
      }
    },

    updateSelectedRecordState(record) {
      const protectionState = this.state.protection;
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;
      const nextRecordId = record?.id || 0;
      const previousRecordId = protectionState.selectedRecordId || 0;

      if (previousRecordId === nextRecordId) {
        return;
      }

      protectionState.selectedRecordId = nextRecordId;
      this.markProtectionStateRecordsDirty(previousRecordId, nextRecordId);

      if (runtimeState.level !== "off" && pageState.chatRoot) {
        this.scheduleSync("interaction", false);
      }
    },

    updateHoveredRecordState(record) {
      const protectionState = this.state.protection;
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;
      const nextRecordId = record?.id || 0;
      const previousRecordId = protectionState.hoveredRecordId || 0;

      if (previousRecordId === nextRecordId) {
        return;
      }

      protectionState.hoveredRecordId = nextRecordId;
      this.markProtectionStateRecordsDirty(previousRecordId, nextRecordId);

      if (runtimeState.level !== "off" && pageState.chatRoot) {
        this.scheduleSync("interaction", false);
      }
    },

    handleFocusOutEvent(event) {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;

      if (runtimeState.level === "off" || !pageState.chatRoot) {
        this.updateFocusedRecordState(null);
        return;
      }

      const relatedTarget =
        event.relatedTarget instanceof Node ? event.relatedTarget : null;
      const nextFocusedRecord = relatedTarget
        ? this.findRecordFromTarget(relatedTarget)
        : null;

      this.updateFocusedRecordState(nextFocusedRecord);
    },

    handleHoverEvent(event) {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;
      const protectionState = this.state.protection;

      if (runtimeState.level === "off" || !pageState.chatRoot) {
        this.updateHoveredRecordState(null);
        return;
      }

      if (event.type === "pointerover") {
        this.updateHoveredRecordState(
          event.target instanceof Node
            ? this.findRecordFromTarget(event.target)
            : null
        );
        return;
      }

      const previousRecord =
        event.target instanceof Node ? this.findRecordFromTarget(event.target) : null;
      const nextRecord =
        event.relatedTarget instanceof Node
          ? this.findRecordFromTarget(event.relatedTarget)
          : null;

      if (previousRecord && nextRecord && previousRecord.id === nextRecord.id) {
        return;
      }

      if ((protectionState.hoveredRecordId || 0) === (previousRecord?.id || 0)) {
        this.updateHoveredRecordState(nextRecord);
      }
    },

    handleInteractionEvent(event) {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;

      if (
        runtimeState.level === "off" ||
        !pageState.chatRoot ||
        !(event.target instanceof Node)
      ) {
        return;
      }

      if (event.type === "keydown") {
        this.handleNativeFindShortcut(event);
      }

      if (event.type === "pointerdown") {
        this.handleBottomFollowTrigger(event);
      }

      this.markForegroundBusy(event.type === "input" ? 520 : 320);

      const record = this.findRecordFromTarget(event.target);

      if (event.type === "focusin") {
        this.updateFocusedRecordState(record);
      }

      if (!record) {
        return;
      }

      if (
        event.type === "pointerdown" &&
        this.shouldTreatPointerdownAsTextSelection(event, record)
      ) {
        return;
      }

      this.markRecordInteracted(record);
    },

    handleSelectionChange() {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;

      if (runtimeState.level === "off" || !pageState.chatRoot) {
        return;
      }

      this.markForegroundBusy(260);

      const selection = globalThis.getSelection();

      if (!selection || selection.isCollapsed || !selection.anchorNode) {
        this.updateSelectedRecordState(null);
        return;
      }

      const record = this.findRecordFromTarget(selection.anchorNode);

      if (!record) {
        this.updateSelectedRecordState(null);
        return;
      }

      this.updateSelectedRecordState(record);
      this.markRecordSelected(record);
    },

    findRecordFromTarget(targetNode) {
      const pageState = this.state.page;
      const target =
        targetNode instanceof HTMLElement ? targetNode : targetNode.parentElement;

      if (!(target instanceof HTMLElement) || !pageState.chatRoot) {
        return null;
      }

      if (!pageState.chatRoot.contains(target)) {
        return null;
      }

      const fastPathMatch = this.registry.findRecordFromNodeChain(
        target,
        pageState.chatRoot,
        INTERACTION_RECORD_FAST_PATH_DEPTH
      );

      if (fastPathMatch) {
        return fastPathMatch;
      }

      const contentElement = target.closest(app.dom.selectors.content);
      const messageElement = app.dom.findMessageContainerFromTarget(
        target,
        pageState.chatRoot
      );

      if (
        !(contentElement instanceof HTMLElement) &&
        !(messageElement instanceof HTMLElement)
      ) {
        return null;
      }

      if (
        contentElement instanceof HTMLElement &&
        pageState.chatRoot.contains(contentElement)
      ) {
        const contentMatch = this.registry.getByContentElement(contentElement);

        if (contentMatch) {
          return contentMatch;
        }
      }

      if (
        messageElement instanceof HTMLElement &&
        pageState.chatRoot.contains(messageElement)
      ) {
        const directMatch = this.registry.getByMessageElement(messageElement);

        if (directMatch) {
          return directMatch;
        }
      }

      return this.registry.findRecordFromAncestor(target, pageState.chatRoot);
    },

    canUseInteractionFastPath(record) {
      const runtimeState = this.state.runtime;

      if (runtimeState.effectiveMode !== "performance" || !record) {
        return false;
      }

      if (record.performanceCollapsed || record.performanceState !== "expanded") {
        return false;
      }

      if (
        record.performanceDirty ||
        record.performanceNeedsDecision ||
        record.needsMeasure ||
        record.needsContentProfile ||
        record.measureDeferred
      ) {
        return false;
      }

      return record.visible || record.nearViewport || record.protected;
    },

    shouldTreatPointerdownAsTextSelection(event, record) {
      const runtimeState = this.state.runtime;

      if (runtimeState.effectiveMode !== "performance" || !record) {
        return false;
      }

      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) {
        return false;
      }

      if (record.performanceCollapsed || record.performanceState !== "expanded") {
        return false;
      }

      const target =
        event.target instanceof HTMLElement ? event.target : event.target?.parentElement;

      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (isNativeInteractiveTarget(target)) {
        return false;
      }

      return Boolean(target.closest(app.dom.selectors.content));
    },

    markRecordInteracted(record) {
      const runtimeState = this.state.runtime;

      if (runtimeState.level === "off") {
        return;
      }

      const now = performance.now();
      record.lastInteractionAt = now;
      this.markRecordForBaseStateRefresh(record);
      this.scheduleProtectionExpiry(
        now + config.protection.interactionProtectMs,
        "protection-expiry"
      );

      if (this.canUseInteractionFastPath(record)) {
        return;
      }

      this.markRecordForModeDecision(record);
      this.scheduleSync("interaction", false);
    },

    markRecordSelected(record) {
      const runtimeState = this.state.runtime;

      if (runtimeState.level === "off") {
        return;
      }

      if (
        runtimeState.effectiveMode === "performance" &&
        !record.performanceCollapsed &&
        (record.visible || record.nearViewport || record.protected)
      ) {
        return;
      }

      this.markRecordInteracted(record);
    },

    handleBottomFollowTrigger(event) {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;

      if (runtimeState.effectiveMode !== "performance") {
        return;
      }

      const button = getButtonCandidate(event.target);

      if (!(button instanceof HTMLElement)) {
        return;
      }

      if (this.findRecordFromTarget(button)) {
        return;
      }

      if (app.dom.getDistanceToBottom(pageState.scrollRoot) <= 2) {
        return;
      }

      if (
        !matchesBottomFollowTriggerLabel(button) &&
        !isFloatingBottomButton(button)
      ) {
        return;
      }

      this.markForegroundBusy(520);

      this.activateBottomFollow("bottom-button", 2200);

      this.applyBottomFollowIfNeeded();

      if (this.isBottomFollowActive()) {
        this.scheduleSync("visibility-change", false);
      }
    },

    handleNativeFindShortcut(event) {
      const runtimeState = this.state.runtime;
      if (
        runtimeState.effectiveMode !== "performance" ||
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        (!event.ctrlKey && !event.metaKey) ||
        String(event.key || "").toLowerCase() !== "f"
      ) {
        return;
      }

      const hasCollapsedHistory = this.registry.hasCollapsedPerformanceRecord();

      if (!hasCollapsedHistory) {
        return;
      }

      const searchNoticeState = this.getActiveModeSearchNoticeState();

      if (!searchNoticeState) {
        return;
      }

      const now = performance.now();

      if (
        searchNoticeState.lastNoticeAt > 0 &&
        now - searchNoticeState.lastNoticeAt < 1500
      ) {
        return;
      }

      const nextSearchNoticeState = this.markActiveModeSearchNotice(now);

      if (!nextSearchNoticeState) {
        return;
      }

      this.diagnostics.setMetrics({
        nativeSearchDegradeNoticeCount: nextSearchNoticeState.noticeCount,
      });
      this.diagnostics.pushEvent("search", "events.nativeSearchDegraded", "warn");
    },
  };
})();
