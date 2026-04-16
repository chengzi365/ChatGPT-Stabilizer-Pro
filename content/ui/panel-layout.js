(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const i18n = app.core.i18n;
  const storage = app.core.storage;
  const { clamp } = app.core.utils;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  app.ui.panelLayoutMethods = {
    handleResize() {
      this.schedulePositionClamp();
    },

    getDefaultPanelSize() {
      return this.normalizePanelSize({
        width: config.panel.defaultWidth,
        height: config.panel.defaultHeight,
      });
    },

    getBadgeDimensions() {
      const rect = this.elements?.badge?.getBoundingClientRect();

      return {
        width: rect?.width || config.panel.defaultBadgeWidth,
        height: rect?.height || config.panel.defaultBadgeHeight,
      };
    },

    getLauncherDimensions() {
      const rect = this.elements?.launcher?.getBoundingClientRect();
      const fallback = config.panel.defaultLauncherSize;

      return {
        width: rect?.width || fallback,
        height: rect?.height || fallback,
      };
    },

    getPanelChromeHeight(state = {}) {
      const isHidden =
        typeof state.isHidden === "boolean" ? state.isHidden : this.isHidden;
      const isOpen =
        typeof state.isOpen === "boolean" ? state.isOpen : this.isOpen;

      if (isHidden || !isOpen) {
        return 0;
      }

      return this.getBadgeDimensions().height + config.panel.shellGap;
    },

    getHostDimensionsForPanelSize(
      panelSize = this.panelSize || this.getDefaultPanelSize(),
      state = {}
    ) {
      const isHidden =
        typeof state.isHidden === "boolean" ? state.isHidden : this.isHidden;
      const isOpen =
        typeof state.isOpen === "boolean" ? state.isOpen : this.isOpen;

      if (isHidden) {
        return this.getLauncherDimensions();
      }

      if (isOpen) {
        return {
          width: panelSize.width,
          height:
            panelSize.height +
            this.getPanelChromeHeight({
              isHidden,
              isOpen,
            }),
        };
      }

      return this.getBadgeDimensions();
    },

    getPanelSizeBounds() {
      const margin = config.panel.viewportMargin;
      const availableWidth = Math.max(240, globalThis.innerWidth - margin * 2);
      const availableHeight = Math.max(
        240,
        globalThis.innerHeight - margin * 2 - this.getPanelChromeHeight()
      );
      const maxWidth = Math.min(config.panel.maxWidth, availableWidth);
      const maxHeight = Math.min(config.panel.maxHeight, availableHeight);

      return {
        minWidth: Math.min(config.panel.minWidth, maxWidth),
        maxWidth,
        minHeight: Math.min(config.panel.minHeight, maxHeight),
        maxHeight,
      };
    },

    normalizePanelSize(size) {
      const bounds = this.getPanelSizeBounds();
      const fallback = {
        width: clamp(config.panel.defaultWidth, bounds.minWidth, bounds.maxWidth),
        height: clamp(config.panel.defaultHeight, bounds.minHeight, bounds.maxHeight),
      };

      if (
        !size ||
        typeof size.width !== "number" ||
        typeof size.height !== "number"
      ) {
        return fallback;
      }

      return {
        width: clamp(Math.round(size.width), bounds.minWidth, bounds.maxWidth),
        height: clamp(Math.round(size.height), bounds.minHeight, bounds.maxHeight),
      };
    },

    getDefaultPosition() {
      const dimensions = this.getFallbackDimensions();

      return {
        top: config.panel.defaultTop,
        left: Math.max(
          config.panel.viewportMargin,
          globalThis.innerWidth -
            dimensions.width -
            config.panel.viewportMargin
        ),
      };
    },

    getFallbackDimensions() {
      return this.getHostDimensionsForPanelSize();
    },

    measureCurrentSize() {
      if (!this.host) {
        return this.getFallbackDimensions();
      }

      const rect = this.host.getBoundingClientRect();

      return {
        width: rect.width || this.getFallbackDimensions().width,
        height: rect.height || this.getFallbackDimensions().height,
      };
    },

    applyPanelSize() {
      if (!this.elements.panel) {
        return;
      }

      this.elements.panel.style.width = `${this.panelSize.width}px`;
      this.elements.panel.style.height = `${this.panelSize.height}px`;
    },

    persistPanelSize() {
      storage.set(config.storageKeys.panelSize, this.panelSize);
    },

    normalizePosition(position, dimensions = this.getFallbackDimensions()) {
      const fallback = this.getDefaultPosition();

      if (
        !position ||
        typeof position.left !== "number" ||
        typeof position.top !== "number"
      ) {
        return this.normalizePosition(fallback, dimensions);
      }

      const margin = config.panel.viewportMargin;
      const width = Math.max(0, dimensions.width || 0);
      const height = Math.max(0, dimensions.height || 0);
      const maxLeft = Math.max(margin, globalThis.innerWidth - width - margin);
      const maxTop = Math.max(margin, globalThis.innerHeight - height - margin);

      return {
        left: clamp(Math.round(position.left), margin, maxLeft),
        top: clamp(Math.round(position.top), margin, maxTop),
      };
    },

    applyPosition() {
      if (this.host) {
        this.host.style.left = `${this.position.left}px`;
        this.host.style.top = `${this.position.top}px`;
      }
    },

    persistPosition() {
      storage.set(config.storageKeys.panelPosition, this.position);
    },

    getPositionForDisplayState(nextState = {}) {
      const isHidden =
        typeof nextState.isHidden === "boolean"
          ? nextState.isHidden
          : this.isHidden;
      const isOpen =
        typeof nextState.isOpen === "boolean" ? nextState.isOpen : this.isOpen;
      const currentDimensions = this.getHostDimensionsForPanelSize(
        this.panelSize,
        {
          isHidden: this.isHidden,
          isOpen: this.isOpen,
        }
      );
      const nextDimensions = this.getHostDimensionsForPanelSize(
        this.panelSize,
        {
          isHidden,
          isOpen,
        }
      );
      const anchorRight = this.position.left + currentDimensions.width;

      return this.normalizePosition(
        {
          left: anchorRight - nextDimensions.width,
          top: this.position.top,
        },
        nextDimensions
      );
    },

    schedulePositionClamp() {
      if (this.positionClampScheduled || !this.host) {
        return;
      }

      this.positionClampScheduled = true;
      globalThis.requestAnimationFrame(() => {
        this.positionClampScheduled = false;
        const nextPanelSize = this.normalizePanelSize(this.panelSize);
        let sizeChanged = false;

        if (
          nextPanelSize.width !== this.panelSize.width ||
          nextPanelSize.height !== this.panelSize.height
        ) {
          this.panelSize = nextPanelSize;
          this.applyPanelSize();
          this.persistPanelSize();
          sizeChanged = true;
        }

        const nextPosition = this.normalizePosition(
          this.position,
          sizeChanged
            ? this.getHostDimensionsForPanelSize(this.panelSize)
            : this.measureCurrentSize()
        );

        if (
          nextPosition.left !== this.position.left ||
          nextPosition.top !== this.position.top
        ) {
          this.position = nextPosition;
          this.applyPosition();
          this.persistPosition();
        }
      });
    },

    updateVisibility() {
      if (!this.elements.badge || !this.elements.panel || !this.elements.launcher) {
        return;
      }

      this.applyPanelSize();
      this.elements.badge.style.display = this.isHidden ? "none" : "flex";
      this.elements.panel.style.display =
        this.isOpen && !this.isHidden ? "grid" : "none";
      this.elements.launcher.style.display = this.isHidden ? "inline-flex" : "none";

      const badgeLabel = this.isOpen
        ? t("panel.actions.collapse", {}, "Collapse panel")
        : t("panel.actions.expand", {}, "Expand panel");

      this.elements.badge.title = badgeLabel;
      this.elements.badge.setAttribute("aria-label", badgeLabel);
      this.elements.launcher.title = t("panel.actions.show", {}, "Show panel");
      this.elements.launcher.setAttribute(
        "aria-label",
        t("panel.actions.show", {}, "Show panel")
      );
      this.schedulePositionClamp();
    },

    setOpen(isOpen) {
      const shouldPreserveAnchor = !this.isHidden && isOpen !== this.isOpen;
      const nextPosition = shouldPreserveAnchor
        ? this.getPositionForDisplayState({ isOpen })
        : null;

      this.isOpen = isOpen;

      if (nextPosition) {
        this.position = nextPosition;
        this.applyPosition();
        this.persistPosition();
      }

      storage.set(config.storageKeys.panelOpen, this.isOpen);
      if (this.isOpen && this.activeTab === "mode") {
        this.pendingModeAutoScroll = true;
      }
      this.clearScheduledRender();
      this.markAllSectionsDirty();
      this.updateVisibility();
      this.syncDiagnosticsSubscription();

      if (!this.isHidden) {
        this.renderSafely();
      }
    },

    setHidden(isHidden, openOnShow) {
      const nextIsOpen = !isHidden && openOnShow ? true : this.isOpen;
      const shouldPreserveAnchor =
        isHidden !== this.isHidden || nextIsOpen !== this.isOpen;
      const nextPosition = shouldPreserveAnchor
        ? this.getPositionForDisplayState({
            isHidden,
            isOpen: nextIsOpen,
          })
        : null;

      this.isHidden = isHidden;
      storage.set(config.storageKeys.panelHidden, this.isHidden);
      this.clearScheduledRender();

      if (!this.isHidden && openOnShow) {
        this.isOpen = true;
        storage.set(config.storageKeys.panelOpen, this.isOpen);
      }

      if (nextPosition) {
        this.position = nextPosition;
        this.applyPosition();
        this.persistPosition();
      }

      if (!this.isHidden && this.isOpen && this.activeTab === "mode") {
        this.pendingModeAutoScroll = true;
      }

      this.markAllSectionsDirty();
      this.updateVisibility();
      this.syncDiagnosticsSubscription();

      if (this.isHidden) {
        return;
      }

      this.renderSafely();
    },

    setActiveTab(tab) {
      const nextTab = this.normalizeTab(tab);

      if (nextTab === this.activeTab) {
        return;
      }

      this.activeTab = nextTab;
      storage.set(config.storageKeys.panelTab, this.activeTab);
      if (this.activeTab === "mode") {
        this.pendingModeAutoScroll = true;
      }
      this.clearScheduledRender();
      this.markAllSectionsDirty();
      this.syncDiagnosticsSubscription();
      this.renderSafely();
      this.schedulePositionClamp();
    },
  };
})();
