(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;

  app.runtime.protectionControllerMethods = {
    resetTrackedMessages() {
      this.clearLowPrioritySync();
      this.resetBaseRuntimeTracking();

      this.clearAllRecordStyles(this.registry.getOrderedRecords());
      this.registry.clear();

      this.teardownObservers();
      this.teardownBootstrapDiscoveryObserver();

      this.clearProtectionExpiry();
    },

    shouldUseCachedVisibilityState({ reason, isResync, record }) {
      const runtimeState = this.state.runtime;

      if (runtimeState.effectiveMode !== "performance") {
        return false;
      }

      if (
        isResync ||
        reason === "startup" ||
        reason === "route-change" ||
        reason === "level-change" ||
        reason === "manual-resync" ||
        reason === "dom-structure" ||
        reason === "dom-content" ||
        reason === "measurement-backlog"
      ) {
        return false;
      }

      return record.lastViewportHeight > 0;
    },

    scheduleProtectionExpiry(targetAt, reason) {
      const protectionState = this.state.protection;
      const pageState = this.state.page;

      if (!Number.isFinite(targetAt) || targetAt <= 0) {
        return;
      }

      if (
        protectionState.protectionTimer &&
        protectionState.protectionTimerAt > 0 &&
        protectionState.protectionTimerAt <= targetAt + 1
      ) {
        return;
      }

      this.clearProtectionExpiry();

      const delay = Math.max(16, Math.round(targetAt - performance.now()));
      protectionState.protectionTimerAt = targetAt;
      protectionState.protectionTimerReason = reason || "";
      protectionState.protectionTimerScrollOffset = app.dom.getScrollOffset(
        pageState.scrollRoot
      );
      protectionState.protectionTimer = globalThis.setTimeout(() => {
        protectionState.protectionTimer = null;
        protectionState.protectionTimerAt = 0;

        if (
          this.shouldSkipProtectionExpirySync(
            protectionState.protectionTimerReason,
            protectionState.protectionTimerScrollOffset
          )
        ) {
          protectionState.protectionTimerReason = "";
          protectionState.protectionTimerScrollOffset = 0;
          this.refreshProtectionExpiry(
            this.registry.getOrderedRecords(),
            performance.now()
          );
          return;
        }

        protectionState.protectionTimerReason = "";
        protectionState.protectionTimerScrollOffset = 0;
        this.scheduleSync(reason, false);
      }, delay);
    },

    shouldSkipProtectionExpirySync(reason, expectedScrollOffset) {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;

      if (
        reason !== "protection-expiry" ||
        runtimeState.effectiveMode !== "performance"
      ) {
        return false;
      }

      const currentScrollOffset = app.dom.getScrollOffset(pageState.scrollRoot);

      return Math.abs(currentScrollOffset - expectedScrollOffset) < 4;
    },

    clearProtectionExpiry() {
      const protectionState = this.state.protection;

      if (protectionState.protectionTimer) {
        globalThis.clearTimeout(protectionState.protectionTimer);
      }

      protectionState.protectionTimer = null;
      protectionState.protectionTimerAt = 0;
      protectionState.protectionTimerReason = "";
      protectionState.protectionTimerScrollOffset = 0;
    },

    activateBottomFollow(reason = "bottom-jump", durationMs = 1800) {
      const protectionState = this.state.protection;

      protectionState.bottomFollowActive = true;
      protectionState.bottomFollowReason = reason;
      protectionState.bottomFollowUntil =
        performance.now() + Math.max(120, durationMs);
    },

    clearBottomFollow() {
      const protectionState = this.state.protection;

      protectionState.bottomFollowActive = false;
      protectionState.bottomFollowUntil = 0;
      protectionState.bottomFollowReason = "";
    },

    markForegroundBusy(durationMs = 320) {
      const protectionState = this.state.protection;
      const nextUntil = performance.now() + Math.max(120, durationMs);

      if (nextUntil > (protectionState.interactionQuietUntil || 0)) {
        protectionState.interactionQuietUntil = nextUntil;
      }
    },

    isInteractionQuietWindowActive() {
      return (this.state.protection.interactionQuietUntil || 0) > performance.now();
    },

    isForegroundBusy() {
      if (this.isInteractionQuietWindowActive()) {
        return true;
      }

      if (this.isBottomFollowActive()) {
        return true;
      }

      return this.isActiveModeForegroundBusyHintActive(performance.now());
    },

    isBottomFollowActive() {
      const protectionState = this.state.protection;

      if (!protectionState.bottomFollowActive) {
        return false;
      }

      if (
        !Number.isFinite(protectionState.bottomFollowUntil) ||
        performance.now() > protectionState.bottomFollowUntil
      ) {
        this.clearBottomFollow();
        return false;
      }

      return true;
    },

    applyBottomFollowIfNeeded() {
      const pageState = this.state.page;
      const scrollRoot = pageState.scrollRoot;

      if (!this.isBottomFollowActive()) {
        return false;
      }

      this.markForegroundBusy(420);

      if (app.dom.getDistanceToBottom(scrollRoot) <= 2) {
        this.clearBottomFollow();
        return false;
      }

      if (
        !scrollRoot ||
        scrollRoot === document.body ||
        scrollRoot === document.documentElement ||
        scrollRoot === document.scrollingElement
      ) {
        const scrollingElement =
          document.scrollingElement || document.documentElement || document.body;
        const viewportHeight =
          globalThis.innerHeight || scrollingElement?.clientHeight || 0;
        const targetTop = Math.max(
          0,
          (scrollingElement?.scrollHeight || 0) - viewportHeight
        );

        globalThis.scrollTo(0, targetTop);
      } else {
        scrollRoot.scrollTop = Math.max(
          0,
          (scrollRoot.scrollHeight || 0) - (scrollRoot.clientHeight || 0)
        );
      }

      if (app.dom.getDistanceToBottom(scrollRoot) <= 2) {
        this.clearBottomFollow();
      }

      return true;
    },

    refreshProtectionExpiry(records, now) {
      let nextExpiry = Infinity;

      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];

        if (record.lastInteractionAt > 0) {
          const interactionExpiry =
            record.lastInteractionAt + config.protection.interactionProtectMs;

          if (interactionExpiry > now) {
            nextExpiry = Math.min(nextExpiry, interactionExpiry);
          }
        }

        if (record.streaming && record.lastTextChangeAt > 0) {
          const streamingExpiry =
            record.lastTextChangeAt + config.protection.streamingGraceMs;

          if (streamingExpiry > now) {
            nextExpiry = Math.min(nextExpiry, streamingExpiry);
          }
        }
      }

      if (Number.isFinite(nextExpiry) && nextExpiry > now) {
        this.scheduleProtectionExpiry(nextExpiry, "protection-expiry");
        return;
      }

      this.clearProtectionExpiry();
    },

    updateRecordState({
      record,
      index,
      totalRecords,
      rootRect,
      margin,
      focusedRecordId,
      selectedRecordId,
      latestAssistantRecord,
      now,
      keepAliveCount,
      reason,
      isResync,
    }) {
      const runtimeState = this.state.runtime;
      const flags = this.shouldUseCachedVisibilityState({
        reason,
        isResync,
        record,
      })
        ? {
            top: record.lastViewportTop,
            bottom: record.lastViewportBottom,
            height: record.lastViewportHeight,
            visible: record.visible,
            nearViewport: record.nearViewport,
          }
        : app.dom.getVisibilityFlagsForRootRect(
            record.messageElement,
            rootRect,
            margin
          );
      const previousVisible = record.visible;
      const previousNearViewport = record.nearViewport;
      const previousPinned = record.pinned;
      const previousProtected = record.protected;
      const previousHovered = record.hovered;
      const previousStreaming = record.streaming;

      record.visible = flags.visible;
      record.nearViewport = flags.nearViewport;
      record.lastViewportTop = flags.top;
      record.lastViewportBottom = flags.bottom;
      record.lastViewportHeight = flags.height;
      record.hovered =
        previousHovered || record.visible || record.nearViewport
          ? record.messageElement.matches(":hover")
          : false;
      record.pinned = index >= Math.max(0, totalRecords - keepAliveCount);

      const hasFocus = Boolean(focusedRecordId && focusedRecordId === record.id);
      const hasSelection = Boolean(selectedRecordId && selectedRecordId === record.id);
      const protectLatestAssistant = latestAssistantRecord
        ? latestAssistantRecord.id === record.id
        : false;
      const recentlyInteracted =
        now - record.lastInteractionAt <= config.protection.interactionProtectMs;

      if (
        record.authorRole === "assistant" &&
        (protectLatestAssistant || previousStreaming || !record.lastTextSignature)
      ) {
        this.updateStreamingState(record, protectLatestAssistant, now);
      } else {
        record.streaming = false;
      }

      record.protected =
        record.pinned ||
        record.visible ||
        record.nearViewport ||
        record.hovered ||
        hasFocus ||
        hasSelection ||
        protectLatestAssistant ||
        recentlyInteracted ||
        record.streaming;

      if (
        runtimeState.effectiveMode === "performance" &&
        (previousVisible !== record.visible ||
          previousNearViewport !== record.nearViewport ||
          previousPinned !== record.pinned ||
          previousProtected !== record.protected ||
          previousHovered !== record.hovered ||
          previousStreaming !== record.streaming)
      ) {
        this.markRecordForModeDecision(record);
      }

      this.clearRecordBaseStateRefresh(record);
    },
  };
})();
