(() => {
  const app = globalThis.__CSP__;

  class ModeStyleController {
    constructor() {
      this.styleElement = null;
    }

    normalizeClassList(classes, fallbackClass) {
      if (Array.isArray(classes)) {
        return classes.filter(Boolean);
      }

      if (typeof fallbackClass === "string" && fallbackClass.trim()) {
        return [fallbackClass.trim()];
      }

      return [];
    }

    normalizeDataMap(map) {
      if (!map || typeof map !== "object") {
        return {};
      }

      return Object.keys(map).reduce((normalized, key) => {
        const value = map[key];

        if (!key || value == null || value === "") {
          return normalized;
        }

        normalized[key] = String(value);
        return normalized;
      }, {});
    }

    normalizeStyleVarMap(map) {
      if (!map || typeof map !== "object") {
        return {};
      }

      return Object.keys(map).reduce((normalized, key) => {
        const value = map[key];

        if (!key || !key.startsWith("--") || value == null || value === "") {
          return normalized;
        }

        normalized[key] = String(value);
        return normalized;
      }, {});
    }

    normalizeModeState(modeState) {
      if (!modeState || !modeState.modeId) {
        return null;
      }

      const contentClasses = this.normalizeClassList(
        modeState.contentClasses,
        modeState.contentClass
      );
      const messageClasses = this.normalizeClassList(
        modeState.messageClasses,
        modeState.messageClass
      );

      return {
        modeId: modeState.modeId,
        contentClasses,
        messageClasses,
        distanceTier: modeState.distanceTier || "",
        contentDataset: this.normalizeDataMap(modeState.contentDataset),
        messageDataset: this.normalizeDataMap(modeState.messageDataset),
        contentStyleVars: this.normalizeStyleVarMap(modeState.contentStyleVars),
        messageStyleVars: this.normalizeStyleVarMap(modeState.messageStyleVars),
      };
    }

    isSameMap(previousMap, nextMap) {
      const previousKeys = Object.keys(previousMap || {});
      const nextKeys = Object.keys(nextMap || {});

      if (previousKeys.length !== nextKeys.length) {
        return false;
      }

      return previousKeys.every((key) => previousMap[key] === nextMap[key]);
    }

    isSameModeState(previousState, nextState) {
      if (previousState === nextState) {
        return true;
      }

      if (!previousState || !nextState) {
        return false;
      }

      if (
        previousState.modeId !== nextState.modeId ||
        previousState.distanceTier !== nextState.distanceTier ||
        previousState.contentClasses.length !== nextState.contentClasses.length ||
        previousState.messageClasses.length !== nextState.messageClasses.length ||
        !this.isSameMap(previousState.contentDataset, nextState.contentDataset) ||
        !this.isSameMap(previousState.messageDataset, nextState.messageDataset) ||
        !this.isSameMap(previousState.contentStyleVars, nextState.contentStyleVars) ||
        !this.isSameMap(previousState.messageStyleVars, nextState.messageStyleVars)
      ) {
        return false;
      }

      for (let index = 0; index < previousState.contentClasses.length; index += 1) {
        if (previousState.contentClasses[index] !== nextState.contentClasses[index]) {
          return false;
        }
      }

      for (let index = 0; index < previousState.messageClasses.length; index += 1) {
        if (previousState.messageClasses[index] !== nextState.messageClasses[index]) {
          return false;
        }
      }

      return true;
    }

    injectModeStyles() {
      if (this.styleElement) {
        return;
      }

      const styleElement = document.createElement("style");
      styleElement.id = "csp-mode-styles";
      styleElement.textContent = `
.csp-performance-collapsed-message {
  position: relative;
}

.csp-performance-collapsed-message::after {
  content: attr(data-csp-performance-label);
  display: flex;
  align-items: center;
  min-block-size: var(--csp-performance-collapsed-height, 64px);
  padding: 12px 14px;
  margin-block: 4px;
  border: 1px solid rgba(127, 127, 127, 0.18);
  border-radius: 14px;
  background: rgba(127, 127, 127, 0.08);
  color: inherit;
  font-size: 13px;
  line-height: 1.4;
  opacity: 0.84;
  white-space: pre-wrap;
  box-sizing: border-box;
}

.csp-performance-collapsed-content {
  display: none !important;
}
`;

      document.documentElement.appendChild(styleElement);
      this.styleElement = styleElement;
    }

    applyDataset(element, dataset) {
      Object.entries(dataset).forEach(([key, value]) => {
        element.dataset[key] = value;
      });
    }

    clearDataset(element, dataset) {
      Object.keys(dataset).forEach((key) => {
        delete element.dataset[key];
      });
    }

    applyStyleVars(element, styleVars) {
      Object.entries(styleVars).forEach(([key, value]) => {
        element.style.setProperty(key, value);
      });
    }

    clearStyleVars(element, styleVars) {
      Object.keys(styleVars).forEach((key) => {
        element.style.removeProperty(key);
      });
    }

    applyModeState(record, modeState) {
      const normalizedState = this.normalizeModeState(modeState);

      if (!normalizedState) {
        this.clearModeState(record);
        record.performanceCollapsed = false;
        return;
      }

      if (this.isSameModeState(record.modeState, normalizedState)) {
        return;
      }

      this.clearModeState(record);

      if (normalizedState.contentClasses.length > 0) {
        record.contentElement.classList.add(...normalizedState.contentClasses);
      }

      if (normalizedState.messageClasses.length > 0) {
        record.messageElement.classList.add(...normalizedState.messageClasses);
      }

      record.contentElement.dataset.cspMode = normalizedState.modeId;

      if (normalizedState.distanceTier) {
        record.contentElement.dataset.cspDistanceTier = normalizedState.distanceTier;
      }

      this.applyDataset(record.contentElement, normalizedState.contentDataset);
      this.applyDataset(record.messageElement, normalizedState.messageDataset);
      this.applyStyleVars(record.contentElement, normalizedState.contentStyleVars);
      this.applyStyleVars(record.messageElement, normalizedState.messageStyleVars);

      record.modeState = normalizedState;
    }

    clearModeState(record) {
      if (
        !(
          record &&
          record.contentElement instanceof HTMLElement &&
          record.messageElement instanceof HTMLElement
        )
      ) {
        return;
      }

      const previousState = record.modeState;

      if (previousState && Array.isArray(previousState.contentClasses)) {
        previousState.contentClasses.forEach((className) => {
          record.contentElement.classList.remove(className);
        });
      }

      if (previousState && Array.isArray(previousState.messageClasses)) {
        previousState.messageClasses.forEach((className) => {
          record.messageElement.classList.remove(className);
        });
      }

      if (previousState) {
        this.clearDataset(record.contentElement, previousState.contentDataset || {});
        this.clearDataset(record.messageElement, previousState.messageDataset || {});
        this.clearStyleVars(
          record.contentElement,
          previousState.contentStyleVars || {}
        );
        this.clearStyleVars(
          record.messageElement,
          previousState.messageStyleVars || {}
        );
      }

      delete record.contentElement.dataset.cspMode;
      delete record.contentElement.dataset.cspDistanceTier;

      record.modeState = null;
    }
  }

  app.style.ModeStyleController = ModeStyleController;
})();
