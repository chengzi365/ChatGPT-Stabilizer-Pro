(() => {
  const app = globalThis.__CSP__;

  function getRootRect(scrollRoot) {
    if (
      !scrollRoot ||
      scrollRoot === document.body ||
      scrollRoot === document.documentElement ||
      scrollRoot === document.scrollingElement
    ) {
      return {
        top: 0,
        left: 0,
        right: globalThis.innerWidth,
        bottom: globalThis.innerHeight,
      };
    }

    return scrollRoot.getBoundingClientRect();
  }

  function getScrollOffset(scrollRoot) {
    if (
      !scrollRoot ||
      scrollRoot === document.body ||
      scrollRoot === document.documentElement ||
      scrollRoot === document.scrollingElement
    ) {
      return (
        globalThis.scrollY ||
        document.scrollingElement?.scrollTop ||
        document.documentElement.scrollTop ||
        0
      );
    }

    return scrollRoot.scrollTop || 0;
  }

  function getDistanceToBottom(scrollRoot) {
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

      return Math.max(
        0,
        (scrollingElement?.scrollHeight || 0) -
          viewportHeight -
          getScrollOffset(scrollRoot)
      );
    }

    return Math.max(
      0,
      (scrollRoot.scrollHeight || 0) -
        (scrollRoot.clientHeight || 0) -
        getScrollOffset(scrollRoot)
    );
  }

  function getVisibilityFlags(element, scrollRoot, margin) {
    return getVisibilityFlagsForRootRect(element, getRootRect(scrollRoot), margin);
  }

  function getVisibilityFlagsForRootRect(element, rootRect, margin) {
    const rect = element.getBoundingClientRect();
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

  function getSelectionContainer() {
    const selection = globalThis.getSelection();

    if (!selection || selection.isCollapsed || !selection.anchorNode) {
      return null;
    }

    const anchorNode =
      selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode.parentElement;

    return anchorNode instanceof HTMLElement ? anchorNode : null;
  }

  function elementContainsSelection(element) {
    const selectionContainer = getSelectionContainer();
    return selectionContainer ? element.contains(selectionContainer) : false;
  }

  app.dom.visibility = Object.freeze({
    getRootRect,
    getScrollOffset,
    getDistanceToBottom,
    getVisibilityFlags,
    getVisibilityFlagsForRootRect,
    getSelectionContainer,
    elementContainsSelection,
  });

  Object.assign(app.dom, {
    getRootRect,
    getScrollOffset,
    getDistanceToBottom,
    getVisibilityFlags,
    getVisibilityFlagsForRootRect,
    getSelectionContainer,
    elementContainsSelection,
  });
})();
