(() => {
  const app = globalThis.__CSP__;

  class MessageRegistry {
    constructor() {
      this.nextId = 1;
      this.records = new Map();
      this.byStableKey = new Map();
      this.byContent = new WeakMap();
      this.byMessage = new WeakMap();
      this.orderedRecords = [];
    }

    sync(units) {
      const seenIds = new Set();
      const added = [];
      const removed = [];
      const orderedRecords = [];

      for (let index = 0; index < units.length; index += 1) {
        const unit = units[index];
        const match = this.findRecordForUnit(unit, seenIds);
        let record = match?.record || null;

        if (!record) {
          record = this.createRecord(unit);
          added.push(record);
        } else {
          this.updateRecord(record, unit);
        }

        this.setRecordStableKey(record, unit.stableKey);
        this.byContent.set(unit.contentElement, record);
        this.byMessage.set(unit.messageElement, record);
        record.orderIndex = index;

        seenIds.add(record.id);
        orderedRecords.push(record);
      }

      for (const [recordId, record] of this.records) {
        if (
          !seenIds.has(record.id) ||
          !record.messageElement.isConnected ||
          !record.contentElement.isConnected
        ) {
          this.records.delete(recordId);
          this.deleteRecordStableKey(record);
          removed.push(record);
        }
      }

      this.orderedRecords = orderedRecords;

      return {
        added,
        removed,
        records: orderedRecords,
      };
    }

    hasStrongStableIdentity(unit) {
      return (
        unit?.identityConfidence === "high" || unit?.identityConfidence === "medium"
      );
    }

    findRecordForUnit(unit, seenIds) {
      const stableKeyRecord = unit.stableKey
        ? this.byStableKey.get(unit.stableKey) || null
        : null;
      const contentRecord = this.byContent.get(unit.contentElement) || null;
      const messageRecord = this.byMessage.get(unit.messageElement) || null;
      const candidates = this.hasStrongStableIdentity(unit)
        ? [
            {
              source: "stableKey",
              record: stableKeyRecord,
            },
            {
              source: "contentElement",
              record: contentRecord,
            },
            {
              source: "messageElement",
              record: messageRecord,
            },
          ]
        : [
            {
              source: "contentElement",
              record: contentRecord,
            },
            {
              source: "messageElement",
              record: messageRecord,
            },
            {
              source: "stableKey",
              record: stableKeyRecord,
            },
          ];

      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const record = candidate.record;

        if (!record || seenIds.has(record.id)) {
          continue;
        }

        return candidate;
      }

      return null;
    }

    shouldPreserveExtendedState(identityConfidence) {
      return identityConfidence === "high" || identityConfidence === "medium";
    }

    invalidateRecordForElementReplacement(record, identityConfidence) {
      const preserveExtendedState =
        this.shouldPreserveExtendedState(identityConfidence);

      record.visible = false;
      record.nearViewport = false;
      record.hovered = false;
      record.streaming = false;
      record.optimized = false;
      record.baseStateDirty = true;
      record.modeState = null;
      record.observedMessageElement = null;
      record.warmObservedMessageElement = null;
      record.lastViewportTop = 0;
      record.lastViewportBottom = 0;
      record.lastViewportHeight = 0;
      record.performanceWarmObserved = false;
      record.performanceNeedsDecision = true;
      record.performanceDirty = true;
      record.performanceDecisionCache = null;
      record.layoutCache = {
        height: 0,
        signature: "",
        measuredAt: 0,
      };
      record.contentProfileCache = {
        signature: "",
        profiledAt: 0,
        nodeCountEstimate: null,
        structureScoreEstimate: null,
        richContentCountEstimate: null,
        textLengthEstimate: null,
        plainTextDominant: null,
      };
      record.lastMeasuredHeight = 0;
      record.performanceExpandedHeight = 0;
      record.needsMeasure = true;
      record.needsContentProfile = true;
      record.measureDeferred = false;
      record.measureAttempts = 0;
      record.nodeCountEstimate = null;
      record.structureScoreEstimate = null;
      record.richContentCountEstimate = null;
      record.textLengthEstimate = null;
      record.plainTextDominant = null;

      if (preserveExtendedState) {
        return;
      }

      record.pinned = false;
      record.protected = false;
      record.lastInteractionAt = 0;
      record.lastTextSignature = "";
      record.lastTextChangeAt = 0;
      record.performanceBand = "";
      record.performanceState = "expanded";
      record.performanceCollapsed = false;
      record.performancePlaceholderHeight = 0;
      record.performanceFarSince = 0;
      record.performanceNoCollapseUntil = 0;
      record.performanceRestoreReason = "";
      record.lastExpandedAt = 0;
      record.lastCollapsedAt = 0;
      record.performanceLastStateChangeAt = 0;
      record.recentEmergencyRestoreCount = 0;
      record.sessionCollapseBlocked = false;
      record.localFreezeZoneId = "";
      record.selfMutationUntil = 0;
    }

    updateRecord(record, unit) {
      const contentChanged = record.contentElement !== unit.contentElement;
      const messageChanged = record.messageElement !== unit.messageElement;
      const stableKeyChanged = record.stableKey !== unit.stableKey;

      if (stableKeyChanged) {
        this.setRecordStableKey(record, unit.stableKey);
      }

      if (contentChanged || messageChanged) {
        this.invalidateRecordForElementReplacement(
          record,
          unit.identityConfidence
        );
      }

      record.messageElement = unit.messageElement;
      record.contentElement = unit.contentElement;
      record.authorRole = unit.authorRole;
      record.routeKey = unit.routeKey || "";
      record.stableKey = unit.stableKey || "";
      record.identityConfidence = unit.identityConfidence || "low";
      record.stableKeySource = unit.stableKeySource || "";
      record.messageId = unit.messageId || "";
      record.turnId = unit.turnId || "";
      record.turnOrder = Number.isFinite(unit.turnOrder) ? unit.turnOrder : 0;
    }

    setRecordStableKey(record, stableKey) {
      const nextStableKey = stableKey || "";
      const previousStableKey = record.stableKey || "";

      if (
        previousStableKey &&
        previousStableKey !== nextStableKey &&
        this.byStableKey.get(previousStableKey) === record
      ) {
        this.byStableKey.delete(previousStableKey);
      }

      record.stableKey = nextStableKey;

      if (nextStableKey) {
        this.byStableKey.set(nextStableKey, record);
      }
    }

    deleteRecordStableKey(record) {
      const stableKey = record?.stableKey || "";

      if (stableKey && this.byStableKey.get(stableKey) === record) {
        this.byStableKey.delete(stableKey);
      }
    }

    createRecord(unit) {
      const record = {
        id: this.nextId++,
        messageElement: unit.messageElement,
        contentElement: unit.contentElement,
        authorRole: unit.authorRole,
        routeKey: unit.routeKey || "",
        stableKey: unit.stableKey || "",
        identityConfidence: unit.identityConfidence || "low",
        stableKeySource: unit.stableKeySource || "",
        messageId: unit.messageId || "",
        turnId: unit.turnId || "",
        turnOrder: Number.isFinite(unit.turnOrder) ? unit.turnOrder : 0,
        orderIndex: 0,
        visible: false,
        nearViewport: false,
        pinned: false,
        protected: false,
        optimized: false,
        baseStateDirty: true,
        baseMetricsSnapshot: app.runtime.createEmptyBaseMetricsTotals(),
        hovered: false,
        streaming: false,
        lastInteractionAt: 0,
        lastTextSignature: "",
        lastTextChangeAt: 0,
        layoutCache: {
          height: 0,
          signature: "",
          measuredAt: 0,
        },
        lastMeasuredHeight: 0,
        needsMeasure: true,
        needsContentProfile: true,
        measureDeferred: false,
        measureAttempts: 0,
        contentProfileCache: {
          signature: "",
          profiledAt: 0,
          nodeCountEstimate: null,
          structureScoreEstimate: null,
          richContentCountEstimate: null,
          textLengthEstimate: null,
          plainTextDominant: null,
        },
        nodeCountEstimate: null,
        structureScoreEstimate: null,
        richContentCountEstimate: null,
        textLengthEstimate: null,
        plainTextDominant: null,
        lastViewportTop: 0,
        lastViewportBottom: 0,
        lastViewportHeight: 0,
        performanceBand: "",
        performanceState: "expanded",
        performanceWarmObserved: false,
        performanceNeedsDecision: true,
        performanceDirty: true,
        performanceDecisionCache: null,
        performanceCollapsed: false,
        performancePlaceholderHeight: 0,
        performanceExpandedHeight: 0,
        performanceFarSince: 0,
        performanceNoCollapseUntil: 0,
        performanceRestoreReason: "",
        lastExpandedAt: 0,
        lastCollapsedAt: 0,
        performanceLastStateChangeAt: 0,
        recentEmergencyRestoreCount: 0,
        sessionCollapseBlocked: false,
        localFreezeZoneId: "",
        selfMutationUntil: 0,
        modeState: null,
        observedMessageElement: null,
        warmObservedMessageElement: null,
      };

      this.records.set(record.id, record);
      this.setRecordStableKey(record, record.stableKey);
      this.byContent.set(record.contentElement, record);
      this.byMessage.set(record.messageElement, record);

      return record;
    }

    clear() {
      this.records.clear();
      this.byStableKey.clear();
      this.orderedRecords = [];
      this.byContent = new WeakMap();
      this.byMessage = new WeakMap();
    }

    getOrderedRecords() {
      return this.orderedRecords;
    }

    getByMessageElement(messageElement) {
      return this.byMessage.get(messageElement) || null;
    }

    getByContentElement(contentElement) {
      return this.byContent.get(contentElement) || null;
    }

    getById(id) {
      return this.records.get(id) || null;
    }

    getByKnownElement(element) {
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      return this.byContent.get(element) || this.byMessage.get(element) || null;
    }

    findRecordFromNodeChain(target, stopNode, maxDepth = Number.POSITIVE_INFINITY) {
      let current = target instanceof HTMLElement ? target : target?.parentElement;
      let depth = 0;

      while (
        current &&
        current !== stopNode &&
        current !== document.body &&
        depth <= maxDepth
      ) {
        const directMatch = this.getByKnownElement(current);

        if (directMatch) {
          return directMatch;
        }

        current = current.parentElement;
        depth += 1;
      }

      return null;
    }

    findRecordFromAncestor(target, stopNode) {
      return this.findRecordFromNodeChain(target, stopNode);
    }

    hasCollapsedPerformanceRecord() {
      for (let index = 0; index < this.orderedRecords.length; index += 1) {
        if (this.orderedRecords[index].performanceCollapsed) {
          return true;
        }
      }

      return false;
    }

    size() {
      return this.records.size;
    }
  }

  app.dom.MessageRegistry = MessageRegistry;
})();
