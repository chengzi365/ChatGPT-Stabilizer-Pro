(() => {
  const app = globalThis.__CSP__;
  const ROUTE_CHANGE_EVENT = "csp:routechange";
  const SETTINGS_HASH_PATTERN = /^#settings(?:\/|$)/i;

  function normalizeRouteHash(hash) {
    const nextHash = typeof hash === "string" ? hash.trim() : "";

    if (!nextHash) {
      return "";
    }

    if (SETTINGS_HASH_PATTERN.test(nextHash)) {
      return "";
    }

    return nextHash;
  }

  function buildNormalizedRouteKey(locationLike = globalThis.location) {
    const pathname = locationLike?.pathname || "";
    const search = locationLike?.search || "";
    const hash = normalizeRouteHash(locationLike?.hash || "");

    return `${pathname}${search}${hash}`;
  }

  app.dom.getNormalizedRouteKey = buildNormalizedRouteKey;

  app.dom.routeControllerMethods = {
    installRouteWatchers() {
      const observerState = this.state.observers;
      const pageState = this.state.page;

      if (observerState.routeWatchersInstalled) {
        return;
      }

      observerState.routeWatchersInstalled = true;
      pageState.lastObservedRouteKey = this.getRouteKey();

      const onRouteChange = () => {
        this.handleRouteChange();
      };

      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = (...args) => {
        const result = originalPushState.apply(history, args);
        globalThis.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT));
        return result;
      };

      history.replaceState = (...args) => {
        const result = originalReplaceState.apply(history, args);
        globalThis.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT));
        return result;
      };

      globalThis.addEventListener(ROUTE_CHANGE_EVENT, onRouteChange);
      globalThis.addEventListener("popstate", onRouteChange);
      globalThis.addEventListener("hashchange", onRouteChange);
    },

    handleRouteChange() {
      const pageState = this.state.page;
      const routeKey = this.getRouteKey();
      const previousRouteKey =
        pageState.lastObservedRouteKey ||
        pageState.lastSyncedRouteKey ||
        routeKey;

      pageState.lastObservedRouteKey = routeKey;

      if (routeKey === previousRouteKey) {
        return;
      }

      this.refreshRuntimeProfile("route-change");
      this.scheduleSync("route-change", true);
      this.scheduleRouteFollowups(routeKey);
    },

    scheduleRouteFollowups(routeKey) {
      const schedulerState = this.state.scheduler;

      this.clearRouteFollowups();

      [160, 480, 1100].forEach((delayMs) => {
        const timer = globalThis.setTimeout(() => {
          if (this.getRouteKey() !== routeKey) {
            return;
          }

          this.refreshRuntimeProfile("route-change");
          this.scheduleSync("route-change", true);
        }, delayMs);

        schedulerState.routeFollowupTimers.push(timer);
      });
    },

    clearRouteFollowups() {
      const schedulerState = this.state.scheduler;

      schedulerState.routeFollowupTimers.forEach((timer) => {
        globalThis.clearTimeout(timer);
      });

      schedulerState.routeFollowupTimers = [];
    },

    getRouteKey() {
      return buildNormalizedRouteKey(globalThis.location);
    },
  };
})();
