(() => {
  const EXISTING = window.__instantScreenshotAreaSelector;
  if (EXISTING && typeof EXISTING.start === "function") {
    EXISTING.start();
    return;
  }

  const OVERLAY_ID = "instant-screenshot-area-overlay";
  const MIN_SELECTION_PX = 6;

  const state = {
    active: false,
    dragging: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    overlay: null,
    box: null,
    hint: null
  };

  function normalizeRect(x1, y1, x2, y2) {
    const left = Math.max(0, Math.min(x1, x2));
    const top = Math.max(0, Math.min(y1, y2));
    const right = Math.min(window.innerWidth, Math.max(x1, x2));
    const bottom = Math.min(window.innerHeight, Math.max(y1, y2));

    return {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  }

  function applyBox(rect) {
    state.box.style.left = `${rect.x}px`;
    state.box.style.top = `${rect.y}px`;
    state.box.style.width = `${rect.width}px`;
    state.box.style.height = `${rect.height}px`;
  }

  function currentRect() {
    return normalizeRect(state.startX, state.startY, state.currentX, state.currentY);
  }

  function sendMessage(type, payload = {}) {
    chrome.runtime.sendMessage({ type, payload }).catch(() => {
      // Ignore if service worker is temporarily unavailable.
    });
  }

  function teardown() {
    if (!state.active) {
      return;
    }

    state.active = false;
    state.dragging = false;

    window.removeEventListener("keydown", onKeyDown, true);

    if (state.overlay) {
      state.overlay.removeEventListener("pointerdown", onPointerDown, true);
      state.overlay.removeEventListener("pointermove", onPointerMove, true);
      state.overlay.removeEventListener("pointerup", onPointerUp, true);
      state.overlay.removeEventListener("pointercancel", onPointerCancel, true);
      state.overlay.remove();
    }

    state.overlay = null;
    state.box = null;
    state.hint = null;
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    teardown();
    sendMessage("AREA_SELECTION_CANCELLED", { reason: "escape" });
  }

  function onPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();

    state.dragging = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.currentX = event.clientX;
    state.currentY = event.clientY;

    state.hint.textContent = "Drag to choose area. Release to capture. Esc to cancel.";
    applyBox(currentRect());
    state.overlay.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!state.dragging) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    state.currentX = event.clientX;
    state.currentY = event.clientY;

    const rect = currentRect();
    applyBox(rect);
    state.hint.textContent = `${Math.round(rect.width)} x ${Math.round(rect.height)} px`;
  }

  function finalizeSelection() {
    const rect = currentRect();
    teardown();

    if (rect.width < MIN_SELECTION_PX || rect.height < MIN_SELECTION_PX) {
      sendMessage("AREA_SELECTION_CANCELLED", { reason: "too-small" });
      return;
    }

    sendMessage("AREA_SELECTION_MADE", {
      rect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
  }

  function onPointerUp(event) {
    if (!state.dragging) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    state.dragging = false;
    state.currentX = event.clientX;
    state.currentY = event.clientY;

    finalizeSelection();
  }

  function onPointerCancel(event) {
    event.preventDefault();
    event.stopPropagation();

    teardown();
    sendMessage("AREA_SELECTION_CANCELLED", { reason: "pointer-cancel" });
  }

  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      cursor: "crosshair",
      background: "rgba(5, 10, 20, 0.20)",
      userSelect: "none"
    });

    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed",
      border: "2px solid #10b981",
      background: "rgba(16, 185, 129, 0.18)",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.7) inset",
      left: "0",
      top: "0",
      width: "0",
      height: "0",
      pointerEvents: "none"
    });

    const hint = document.createElement("div");
    hint.textContent = "Drag to choose area. Release to capture. Esc to cancel.";
    Object.assign(hint.style, {
      position: "fixed",
      left: "12px",
      top: "12px",
      background: "rgba(0, 0, 0, 0.75)",
      color: "#ffffff",
      padding: "7px 10px",
      borderRadius: "8px",
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      fontSize: "12px",
      lineHeight: "1.25",
      pointerEvents: "none"
    });

    overlay.appendChild(box);
    overlay.appendChild(hint);
    return { overlay, box, hint };
  }

  function start() {
    teardown();

    const nodes = createOverlay();
    state.overlay = nodes.overlay;
    state.box = nodes.box;
    state.hint = nodes.hint;
    state.active = true;

    state.overlay.addEventListener("pointerdown", onPointerDown, true);
    state.overlay.addEventListener("pointermove", onPointerMove, true);
    state.overlay.addEventListener("pointerup", onPointerUp, true);
    state.overlay.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("keydown", onKeyDown, true);

    document.documentElement.appendChild(state.overlay);
  }

  function handleRuntimeMessage(message) {
    if (message?.type === "STOP_AREA_SELECTOR") {
      teardown();
    }
  }

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  window.__instantScreenshotAreaSelector = {
    start,
    teardown
  };

  start();
})();
