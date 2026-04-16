(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const PERFORMANCE_WARM_MARGIN = Object.freeze({
    forward: 2.5,
    backward: 1.25,
    neutral: 1.5,
  });

  function getVisibilityFlagsForObserverRect(rect, rootRect, margin) {
    const visible = rect.bottom > rootRect.top && rect.top < rootRect.bottom;
    const nearViewport =
      rect.bottom > rootRect.top - margin && rect.top < rootRect.bottom + margin;

    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      visible,
      nearViewport,
    };
  }

  app.dom.observerControllerMethods = {
    clearObservedRecordTracking(records = null) {
      const observerState = this.state.observers;
      const trackedRecords = Array.isArray(records)
        ? records
        : this.registry?.getOrderedRecords?.() || [];

      observerState.observedIds.clear();
      observerState.warmObservedIds.clear();

      for (let index = 0; index < trackedRecords.length; index += 1) {
        const record = trackedRecords[index];

        if (!record) {
          continue;
        }

        record.observedMessageElement = null;
        record.warmObservedMessageElement = null;
      }
    },

    detachRecordObservation(record) {
      const observerState = this.state.observers;

      if (!record) {
        return;
      }

      if (observerState.intersectionObserver && record.observedMessageElement) {
        observerState.intersectionObserver.unobserve(record.observedMessageElement);
      }

      if (observerState.warmIntersectionObserver && record.warmObservedMessageElement) {
        observerState.warmIntersectionObserver.unobserve(
          record.warmObservedMessageElement
        );
      }

      record.observedMessageElement = null;
      record.warmObservedMessageElement = null;
      observerState.observedIds.delete(record.id);
      observerState.warmObservedIds.delete(record.id);
    },

    ensureBootstrapDiscoveryObserver() {
      const observerState = this.state.observers;
      const observerRoot = document.body || document.documentElement;

      if (!(observerRoot instanceof HTMLElement)) {
        return;
      }

      if (
        observerState.bootstrapMutationObserver &&
        observerState.bootstrapMutationObserverRoot === observerRoot
      ) {
        return;
      }

      this.teardownBootstrapDiscoveryObserver();

      observerState.bootstrapMutationObserver = new MutationObserver((mutations) => {
        let shouldSync = false;

        for (let index = 0; index < mutations.length; index += 1) {
          const mutation = mutations[index];

          if (mutation.type === "attributes") {
            if (app.dom.nodeTouchesDiscoveryCandidate(mutation.target)) {
              shouldSync = true;
              break;
            }

            continue;
          }

          if (
            this.discoveryNodesAffectStructure(mutation.addedNodes) ||
            this.discoveryNodesAffectStructure(mutation.removedNodes)
          ) {
            shouldSync = true;
            break;
          }
        }

        if (shouldSync) {
          this.scheduleSync("dom-structure", false);
        }
      });
      observerState.bootstrapMutationObserver.observe(observerRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "data-message-author-role",
          "data-turn-id",
          "data-testid",
          "data-writing-block",
          "contenteditable",
        ],
      });
      observerState.bootstrapMutationObserverRoot = observerRoot;
    },

    teardownBootstrapDiscoveryObserver() {
      const observerState = this.state.observers;

      if (observerState.bootstrapMutationObserver) {
        observerState.bootstrapMutationObserver.disconnect();
      }

      observerState.bootstrapMutationObserver = null;
      observerState.bootstrapMutationObserverRoot = null;
    },

    getPerformanceWarmRootMargin(scrollRoot) {
      const rootRect = app.dom.getRootRect(scrollRoot);
      const viewportHeight = Math.max(1, rootRect.bottom - rootRect.top);
      const observerHints = this.getActiveModeObserverHints();
      const scrollDirection = observerHints?.scrollDirection || 0;
      const warmMarginScale = observerHints?.warmMarginScale || 1;
      let topMargin = viewportHeight * PERFORMANCE_WARM_MARGIN.neutral;
      let bottomMargin = viewportHeight * PERFORMANCE_WARM_MARGIN.neutral;

      if (scrollDirection > 0) {
        topMargin = viewportHeight * PERFORMANCE_WARM_MARGIN.backward;
        bottomMargin = viewportHeight * PERFORMANCE_WARM_MARGIN.forward;
      } else if (scrollDirection < 0) {
        topMargin = viewportHeight * PERFORMANCE_WARM_MARGIN.forward;
        bottomMargin = viewportHeight * PERFORMANCE_WARM_MARGIN.backward;
      }

      return `${Math.round(topMargin * warmMarginScale)}px 0px ${Math.round(
        bottomMargin * warmMarginScale
      )}px 0px`;
    },

    ensureObservers(levelConfig, chatRoot, scrollRoot, records) {
      const observerState = this.state.observers;
      const runtimeState = this.state.runtime;

      if (!levelConfig.enableObservers || runtimeState.level === "off") {
        this.teardownObservers();
        return;
      }

      this.teardownBootstrapDiscoveryObserver();

      if (!observerState.mutationObserver || observerState.mutationObserverRoot !== chatRoot) {
        if (observerState.mutationObserver) {
          observerState.mutationObserver.disconnect();
        }

        observerState.mutationObserver = new MutationObserver((mutations) => {
          const mutationState = this.processMutations(mutations);

          if (mutationState.structureChanged) {
            this.scheduleSync("dom-structure", false);
            return;
          }

          if (mutationState.contentChanged) {
            this.scheduleSync("dom-content", false);
          }
        });
        observerState.mutationObserver.observe(chatRoot, {
          childList: true,
          characterData: true,
          subtree: true,
          attributes: true,
          attributeFilter: [
            "aria-busy",
            "data-is-streaming",
            "data-state",
            "data-status",
            "data-message-author-role",
          ],
        });
        observerState.mutationObserverRoot = chatRoot;
      }

      const rootMargin = `${levelConfig.nearViewportMargin}px 0px ${levelConfig.nearViewportMargin}px 0px`;

      if (
        !observerState.intersectionObserver ||
        observerState.intersectionRoot !== scrollRoot ||
        observerState.intersectionMargin !== rootMargin
      ) {
        if (observerState.intersectionObserver) {
          observerState.intersectionObserver.disconnect();
        }

        const observerRoot =
          scrollRoot &&
          scrollRoot !== document.body &&
          scrollRoot !== document.documentElement &&
          scrollRoot !== document.scrollingElement
            ? scrollRoot
            : null;

        observerState.intersectionObserver = new IntersectionObserver(
          (entries) => {
            let shouldSync = false;
            const currentRootRect = app.dom.getRootRect(scrollRoot);
            const nearViewportMargin =
              this.getEffectiveLevelConfig().nearViewportMargin;

            for (let index = 0; index < entries.length; index += 1) {
              const entry = entries[index];
              const record = this.registry.getByMessageElement(entry.target);

              if (!record) {
                continue;
              }

              const previousVisible = record.visible;
              const previousNear = record.nearViewport;
              const flags = getVisibilityFlagsForObserverRect(
                entry.boundingClientRect,
                currentRootRect,
                nearViewportMargin
              );

              record.visible = flags.visible;
              record.nearViewport = entry.isIntersecting || flags.nearViewport;
              record.lastViewportTop = flags.top;
              record.lastViewportBottom = flags.bottom;
              record.lastViewportHeight = flags.height;

              if (
                previousVisible !== record.visible ||
                previousNear !== record.nearViewport
              ) {
                this.markRecordForBaseStateRefresh(record);
                this.markRecordForModeDecision(record);
                shouldSync = true;
              }
            }

            if (shouldSync) {
              this.scheduleSync("visibility-change", false);
            }
          },
          {
            root: observerRoot,
            rootMargin,
            threshold: 0.01,
          }
        );

        observerState.intersectionRoot = scrollRoot;
        observerState.intersectionMargin = rootMargin;
        observerState.observedIds.clear();
      }

      if (runtimeState.effectiveMode === "performance") {
        const warmRootMargin = this.getPerformanceWarmRootMargin(scrollRoot);

        if (
          !observerState.warmIntersectionObserver ||
          observerState.warmIntersectionRoot !== scrollRoot ||
          observerState.warmIntersectionMargin !== warmRootMargin
        ) {
          if (observerState.warmIntersectionObserver) {
            observerState.warmIntersectionObserver.disconnect();
          }

          const observerRoot =
            scrollRoot &&
            scrollRoot !== document.body &&
            scrollRoot !== document.documentElement &&
            scrollRoot !== document.scrollingElement
              ? scrollRoot
              : null;

          observerState.warmIntersectionObserver = new IntersectionObserver(
            (entries) => {
              let shouldSync = false;
              const currentRootRect = app.dom.getRootRect(scrollRoot);
              const nearViewportMargin =
                this.getEffectiveLevelConfig().nearViewportMargin;

              for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index];
                const record = this.registry.getByMessageElement(entry.target);

                if (!record) {
                  continue;
                }

                const previousWarm = record.performanceWarmObserved;
                const flags = getVisibilityFlagsForObserverRect(
                  entry.boundingClientRect,
                  currentRootRect,
                  nearViewportMargin
                );

                record.performanceWarmObserved = entry.isIntersecting;
                record.lastViewportTop = flags.top;
                record.lastViewportBottom = flags.bottom;
                record.lastViewportHeight = flags.height;

                if (previousWarm !== record.performanceWarmObserved) {
                  this.markRecordForModeDecision(record);
                  shouldSync = true;
                }
              }

              if (shouldSync) {
                this.scheduleSync("visibility-change", false);
              }
            },
            {
              root: observerRoot,
              rootMargin: warmRootMargin,
              threshold: 0.01,
            }
          );

          observerState.warmIntersectionRoot = scrollRoot;
          observerState.warmIntersectionMargin = warmRootMargin;
          observerState.warmObservedIds.clear();
        }
      } else if (observerState.warmIntersectionObserver) {
        observerState.warmIntersectionObserver.disconnect();
        observerState.warmIntersectionObserver = null;
        observerState.warmIntersectionRoot = null;
        observerState.warmIntersectionMargin = null;
        observerState.warmObservedIds.clear();
      }

      const needsBaseObservePass =
        observerState.observedIds.size !== records.length;
      const needsWarmObservePass =
        runtimeState.effectiveMode === "performance" &&
        observerState.warmIntersectionObserver &&
        observerState.warmObservedIds.size !== records.length;

      let hasBaseObservationDrift = false;
      let hasWarmObservationDrift = false;

      if (!needsBaseObservePass || !needsWarmObservePass) {
        for (let index = 0; index < records.length; index += 1) {
          const record = records[index];

          if (
            !hasBaseObservationDrift &&
            record.observedMessageElement !== record.messageElement
          ) {
            hasBaseObservationDrift = true;
          }

          if (
            !hasWarmObservationDrift &&
            runtimeState.effectiveMode === "performance" &&
            observerState.warmIntersectionObserver &&
            record.warmObservedMessageElement !== record.messageElement
          ) {
            hasWarmObservationDrift = true;
          }

          if (
            hasBaseObservationDrift &&
            (hasWarmObservationDrift || !observerState.warmIntersectionObserver)
          ) {
            break;
          }
        }
      }

      if (
        !needsBaseObservePass &&
        !needsWarmObservePass &&
        !hasBaseObservationDrift &&
        !hasWarmObservationDrift
      ) {
        return;
      }

      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];

        const baseObservedElement = record.observedMessageElement;
        const baseObservationStale =
          baseObservedElement &&
          baseObservedElement !== record.messageElement;

        if (baseObservationStale) {
          observerState.intersectionObserver.unobserve(baseObservedElement);
        }

        if (
          (needsBaseObservePass || hasBaseObservationDrift) &&
          (!observerState.observedIds.has(record.id) || baseObservationStale)
        ) {
          observerState.intersectionObserver.observe(record.messageElement);
          observerState.observedIds.add(record.id);
          record.observedMessageElement = record.messageElement;
        }

        if (
          record.observedMessageElement !== record.messageElement
        ) {
          record.observedMessageElement = record.messageElement;
        }

        const warmObservedElement = record.warmObservedMessageElement;
        const warmObservationStale =
          warmObservedElement &&
          warmObservedElement !== record.messageElement;

        if (warmObservationStale && observerState.warmIntersectionObserver) {
          observerState.warmIntersectionObserver.unobserve(warmObservedElement);
        }

        if (
          (needsWarmObservePass || hasWarmObservationDrift) &&
          observerState.warmIntersectionObserver &&
          (!observerState.warmObservedIds.has(record.id) || warmObservationStale)
        ) {
          observerState.warmIntersectionObserver.observe(record.messageElement);
          observerState.warmObservedIds.add(record.id);
          record.warmObservedMessageElement = record.messageElement;
        }

        if (
          observerState.warmIntersectionObserver &&
          record.warmObservedMessageElement !== record.messageElement
        ) {
          record.warmObservedMessageElement = record.messageElement;
        }
      }
    },

    teardownObservers() {
      const observerState = this.state.observers;

      this.clearLowPrioritySync();

      if (observerState.mutationObserver) {
        observerState.mutationObserver.disconnect();
      }

      if (observerState.intersectionObserver) {
        observerState.intersectionObserver.disconnect();
      }

      if (observerState.warmIntersectionObserver) {
        observerState.warmIntersectionObserver.disconnect();
      }

      observerState.mutationObserver = null;
      observerState.mutationObserverRoot = null;
      observerState.intersectionObserver = null;
      observerState.intersectionRoot = null;
      observerState.intersectionMargin = null;
      observerState.warmIntersectionObserver = null;
      observerState.warmIntersectionRoot = null;
      observerState.warmIntersectionMargin = null;
      this.clearObservedRecordTracking();
    },

    discoveryNodesAffectStructure(nodes) {
      for (let index = 0; index < nodes.length; index += 1) {
        if (app.dom.nodeTouchesDiscoveryCandidate(nodes[index])) {
          return true;
        }
      }

      return false;
    },

    processMutations(mutations) {
      let structureChanged = false;
      let contentChanged = false;
      const now = performance.now();

      for (let index = 0; index < mutations.length; index += 1) {
        const mutation = mutations[index];

        if (structureChanged) {
          break;
        }

        if (mutation.type === "attributes") {
          if (mutation.attributeName === "data-message-author-role") {
            structureChanged = true;
            continue;
          }

          const record = this.findRecordForMutationTarget(mutation.target);

          if (record && this.shouldSuppressSelfMutation(record, mutation, now)) {
            this.markSelfMutationSuppressed();
            continue;
          }

          if (record) {
            this.markRecordContentDirty(record, {
              invalidateProfile: false,
              reason: "content-attribute",
            });
            contentChanged = true;
          }

          continue;
        }

        if (mutation.type === "characterData") {
          const record = this.findRecordForMutationTarget(mutation.target);

          if (record && this.shouldSuppressSelfMutation(record, mutation, now)) {
            this.markSelfMutationSuppressed();
            continue;
          }

          if (record) {
            this.markRecordContentDirty(record, {
              invalidateProfile: false,
              reason: "text-content",
            });
            contentChanged = true;
          }

          continue;
        }

        if (mutation.type === "childList") {
          if (
            this.mutationNodesAffectStructure(mutation.addedNodes) ||
            this.mutationNodesAffectStructure(mutation.removedNodes)
          ) {
            structureChanged = true;
            continue;
          }

          const record = this.findRecordForMutationTarget(mutation.target);

          if (record && this.shouldSuppressSelfMutation(record, mutation, now)) {
            this.markSelfMutationSuppressed();
            continue;
          }

          if (record) {
            const target =
              mutation.target instanceof HTMLElement
                ? mutation.target
                : mutation.target.parentElement;

            if (!this.isMutationInsideRecordContent(record, target)) {
              continue;
            }

            this.markRecordContentDirty(record, {
              invalidateProfile: this.mutationNodesInvalidateContentProfile(
                mutation.addedNodes
              ) || this.mutationNodesInvalidateContentProfile(mutation.removedNodes),
              reason: "content-childlist",
            });
            contentChanged = true;
            continue;
          }
        }
      }

      return {
        structureChanged,
        contentChanged,
      };
    },

    findRecordForMutationTarget(targetNode) {
      const pageState = this.state.page;
      const target =
        targetNode instanceof HTMLElement ? targetNode : targetNode.parentElement;

      if (!(target instanceof HTMLElement) || !pageState.chatRoot) {
        return null;
      }

      const contentElement = app.dom.findContentElementFromTarget(
        target,
        pageState.chatRoot
      );

      if (contentElement) {
        const contentMatch = this.registry.getByContentElement(contentElement);

        if (contentMatch) {
          return contentMatch;
        }
      }

      return this.findRecordFromTarget(target);
    },

    mutationNodesAffectStructure(nodes) {
      for (let index = 0; index < nodes.length; index += 1) {
        if (app.dom.nodeTouchesStructure(nodes[index])) {
          return true;
        }
      }

      return false;
    },

    mutationNodesInvalidateContentProfile(nodes) {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];

        if (node instanceof Element) {
          return true;
        }

        if (
          node instanceof DocumentFragment &&
          typeof node.querySelector === "function" &&
          node.querySelector("*")
        ) {
          return true;
        }
      }

      return false;
    },

    isMutationInsideRecordContent(record, target) {
      if (!record || !(target instanceof HTMLElement)) {
        return false;
      }

      return (
        target === record.contentElement || record.contentElement.contains(target)
      );
    },

    shouldSuppressSelfMutation(record, mutation, now) {
      if (
        !record ||
        !record.selfMutationUntil ||
        record.selfMutationUntil < now
      ) {
        return false;
      }

      const target =
        mutation.target instanceof HTMLElement
          ? mutation.target
          : mutation.target.parentElement;

      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (!target.closest("[data-csp-managed='true']")) {
        return false;
      }

      if (mutation.type === "characterData") {
        return false;
      }

      return target === record.messageElement || target === record.contentElement;
    },

    markSelfMutationSuppressed() {
          this.markActiveModeSelfMutationSuppressed();
    },

    markRecordContentDirty(
      record,
      { invalidateProfile = false, reason = "content-update" } = {}
    ) {
      if (invalidateProfile) {
        this.markRecordContentProfileDirty(record, reason);
        return;
      }

      this.markRecordLayoutDirty(record, reason);
    },
  };
})();
