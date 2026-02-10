(() => {
  if (window.__instantScreenshotExtendedTracker) {
    return;
  }

  const THROTTLE_MS = 130;
  const IDLE_FLUSH_MS = 180;
  let lastSentAt = 0;
  let idleTimer = null;
  let virtualScrollY = Math.round(window.scrollY);
  let lastWindowScrollY = Math.round(window.scrollY);
  const lastElementScrollTop = new WeakMap();

  function updateVirtualFromWindow() {
    const current = Math.round(window.scrollY);
    const delta = current - lastWindowScrollY;
    lastWindowScrollY = current;

    if (delta !== 0) {
      virtualScrollY = Math.max(0, virtualScrollY + delta);
    }
  }

  function isElementScrollable(element) {
    return (
      element instanceof Element &&
      element.scrollHeight - element.clientHeight > 1
    );
  }

  function shouldTrackElementScroll(element) {
    if (!isElementScrollable(element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const minWidth = window.innerWidth * 0.5;
    const minHeight = window.innerHeight * 0.5;

    if (rect.width < minWidth || rect.height < minHeight) {
      return false;
    }

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const containsCenter =
      centerX >= rect.left &&
      centerX <= rect.right &&
      centerY >= rect.top &&
      centerY <= rect.bottom;

    return containsCenter;
  }

  function updateVirtualFromElement(element) {
    if (!shouldTrackElementScroll(element)) {
      return false;
    }

    const current = Math.round(element.scrollTop);
    const previous = lastElementScrollTop.has(element)
      ? lastElementScrollTop.get(element)
      : current;

    lastElementScrollTop.set(element, current);

    const delta = current - previous;
    if (delta !== 0) {
      virtualScrollY = Math.max(0, virtualScrollY + delta);
      return true;
    }

    return false;
  }

  function sendSnapshot(force = false) {
    updateVirtualFromWindow();

    const now = Date.now();
    if (!force && now - lastSentAt < THROTTLE_MS) {
      return;
    }

    lastSentAt = now;
    chrome.runtime.sendMessage({
      type: "EXTENDED_SCROLL_EVENT",
      payload: {
        scrollY: Math.round(window.scrollY),
        virtualScrollY: Math.round(virtualScrollY),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      }
    });
  }

  function queueSnapshot() {
    sendSnapshot(false);

    if (idleTimer !== null) {
      clearTimeout(idleTimer);
    }

    idleTimer = setTimeout(() => {
      sendSnapshot(true);
      idleTimer = null;
    }, IDLE_FLUSH_MS);
  }

  function handleScroll(event) {
    const target = event?.target;

    if (
      target === document ||
      target === document.body ||
      target === document.documentElement
    ) {
      updateVirtualFromWindow();
    } else if (target instanceof Element) {
      const updated = updateVirtualFromElement(target);
      if (!updated) {
        updateVirtualFromWindow();
      }
    } else {
      updateVirtualFromWindow();
    }

    queueSnapshot();
  }

  function cleanup() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    window.removeEventListener("scroll", handleScroll);
    document.removeEventListener("scroll", handleScroll, true);
    window.removeEventListener("resize", queueSnapshot);
    chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    delete window.__instantScreenshotExtendedTracker;
  }

  function handleRuntimeMessage(message) {
    if (message?.type === "STOP_EXTENDED_TRACKER") {
      cleanup();
    }
  }

  window.addEventListener("scroll", handleScroll, { passive: true });
  document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
  window.addEventListener("resize", queueSnapshot);
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  window.__instantScreenshotExtendedTracker = { cleanup };
  sendSnapshot(true);
})();
