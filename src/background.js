const DEFAULT_FORMAT = "png";
const STITCH_SOURCE_FORMAT = "png";
const MAX_CANVAS_EDGE = 32767;
const CAPTURE_MIN_INTERVAL_MS = 550;
const CAPTURE_RETRY_ON_QUOTA_MS = 800;
const FULL_PAGE_SCROLL_DELAY_MS = 260;
const FULL_PAGE_SCROLL_STEP_RATIO = 0.85;
const EXTENDED_DEDUPE_PX = 16;
const EXTENDED_MIN_STEP_PX = 3;
const EXTENDED_MAX_PENDING_REQUESTS = 20;
const STITCH_ALIGNMENT_SEARCH_CSS = 48;
const STITCH_ALIGNMENT_MAX_BACKTRACK_CSS = 2;
const STITCH_ALIGNMENT_SAMPLE_WIDTH = 320;
const STITCH_ALIGNMENT_SAMPLE_STEP_X = 3;
const STITCH_ALIGNMENT_DISTANCE_PENALTY = 0.18;
const STITCH_ALIGNMENT_BAD_SCORE = 42;
const PREVIEW_RETENTION_MS = 10 * 60 * 1000;
const DEFAULT_DELAY_MS = 3000;

const extendedSessions = new Map();
const previewPayloads = new Map();
const areaCaptureConfigs = new Map();
let captureQueue = Promise.resolve();
let lastCaptureAt = 0;

function buildFilename(extension = DEFAULT_FORMAT, mode = "visible") {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + "_" + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("-");

  return `Screenshots/${mode}/screenshot_${mode}_${timestamp}.${extension}`;
}

function displayNameFromFilename(filename) {
  const parts = String(filename).split("/");
  return parts[parts.length - 1];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMimeType(format) {
  return format === "jpeg" ? "image/jpeg" : "image/png";
}

function toCaptureOptions({ format = DEFAULT_FORMAT, quality } = {}) {
  if (typeof quality === "number") {
    return { format, quality };
  }

  return { format };
}

function isCaptureQuotaError(error) {
  const message = String(error?.message || error || "");
  return message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND");
}

async function throttledCapture(windowId, options, retriesLeft = 1) {
  const now = Date.now();
  const waitMs = Math.max(0, CAPTURE_MIN_INTERVAL_MS - (now - lastCaptureAt));
  if (waitMs > 0) {
    await wait(waitMs);
  }

  try {
    const result = await chrome.tabs.captureVisibleTab(windowId, options);
    lastCaptureAt = Date.now();
    return result;
  } catch (error) {
    if (retriesLeft > 0 && isCaptureQuotaError(error)) {
      await wait(CAPTURE_RETRY_ON_QUOTA_MS);
      return throttledCapture(windowId, options, retriesLeft - 1);
    }

    throw error;
  }
}

function generatePreviewId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function blobToDataUrl(blob) {
  if (typeof FileReaderSync !== "undefined") {
    return new FileReaderSync().readAsDataURL(blob);
  }

  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Blob read failed"));
      reader.readAsDataURL(blob);
    });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x4000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    let piece = "";

    for (let i = 0; i < chunk.length; i += 1) {
      piece += String.fromCharCode(chunk[i]);
    }

    binary += piece;
  }

  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

function storePreviewPayload(payload) {
  const id = generatePreviewId();
  previewPayloads.set(id, payload);

  setTimeout(() => {
    previewPayloads.delete(id);
  }, PREVIEW_RETENTION_MS);

  return id;
}

function getPreviewPayload(id) {
  return previewPayloads.get(id) || null;
}

async function openPreviewTab({ dataUrl, filename, mode }) {
  const previewId = storePreviewPayload({ dataUrl, filename, mode });
  const previewPageUrl = new URL(chrome.runtime.getURL("src/preview/preview.html"));
  previewPageUrl.searchParams.set("id", previewId);
  await chrome.tabs.create({ url: previewPageUrl.toString() });
}

function buildCaptureResponse({ filename, mode, frameCount }) {
  const response = {
    ok: true,
    mode,
    filename,
    displayName: displayNameFromFilename(filename)
  };

  if (typeof frameCount === "number") {
    response.frameCount = frameCount;
  }

  return response;
}

async function captureVisibleTab({ windowId, format = DEFAULT_FORMAT, quality } = {}) {
  const options = toCaptureOptions({ format, quality });
  const run = async () => throttledCapture(windowId, options);
  captureQueue = captureQueue.then(run, run);
  return captureQueue;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab available.");
  }

  return tab;
}

async function downloadUrl(url, filename) {
  await chrome.downloads.download({
    url,
    filename,
    saveAs: false
  });
}

async function captureAndDownload({ format = DEFAULT_FORMAT, quality } = {}) {
  const tab = await getActiveTab();
  const dataUrl = await captureVisibleTab({ windowId: tab.windowId, format, quality });
  const filename = buildFilename(format, "visible");

  await openPreviewTab({ dataUrl, filename, mode: "visible" });

  return buildCaptureResponse({ filename, mode: "visible" });
}

function sanitizeDelayMs(delayMs) {
  const value = Number(delayMs);
  if (!Number.isFinite(value)) {
    return DEFAULT_DELAY_MS;
  }

  return Math.max(500, Math.min(15000, Math.round(value)));
}

async function captureVisibleWithDelay({ format = DEFAULT_FORMAT, quality, delayMs } = {}) {
  const tab = await getActiveTab();
  const effectiveDelayMs = sanitizeDelayMs(delayMs);

  await wait(effectiveDelayMs);

  const targetTab = await chrome.tabs.get(tab.id).catch(() => null);
  if (!targetTab) {
    throw new Error("Target tab is no longer available for delayed capture.");
  }

  const dataUrl = await captureVisibleTab({
    windowId: tab.windowId,
    format,
    quality
  });

  const filename = buildFilename(format, "visible");
  await openPreviewTab({ dataUrl, filename, mode: "visible-delay" });

  return {
    ...buildCaptureResponse({ filename, mode: "visible-delay" }),
    delayMs: effectiveDelayMs
  };
}

async function captureAndPreview({ format = DEFAULT_FORMAT, quality } = {}) {
  const tab = await getActiveTab();
  const dataUrl = await captureVisibleTab({ windowId: tab.windowId, format, quality });
  const filename = buildFilename(format, "visible");

  await openPreviewTab({ dataUrl, filename, mode: "visible" });
  return { ok: true };
}

async function runInTab(tabId, func, args = []) {
  const [injectionResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  });

  return injectionResult?.result;
}

async function fetchBitmap(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function hideFixedAndStickyUi(tabId) {
  return runInTab(tabId, () => {
    const STYLE_ID = "__instant_capture_hide_style";
    const CLASS_NAME = "__instant_capture_hide_fixed";
    const ATTR = "data-instant-capture-hidden";

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .${CLASS_NAME} {
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    let hiddenCount = 0;
    const elements = document.querySelectorAll("*");
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) {
        continue;
      }

      const style = window.getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "sticky") {
        continue;
      }

      if (style.display === "none" || style.visibility === "hidden") {
        continue;
      }

      if (el.offsetWidth <= 0 || el.offsetHeight <= 0) {
        continue;
      }

      const rect = el.getBoundingClientRect();
      const intersectsViewport =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;

      if (!intersectsViewport) {
        continue;
      }

      if (!el.hasAttribute(ATTR)) {
        el.setAttribute(ATTR, "1");
        el.classList.add(CLASS_NAME);
        hiddenCount += 1;
      }
    }

    return hiddenCount;
  }).catch(() => 0);
}

async function restoreFixedAndStickyUi(tabId) {
  return runInTab(tabId, () => {
    const CLASS_NAME = "__instant_capture_hide_fixed";
    const ATTR = "data-instant-capture-hidden";

    let restored = 0;
    const nodes = document.querySelectorAll(`[${ATTR}="1"]`);
    for (const el of nodes) {
      if (el instanceof HTMLElement) {
        el.classList.remove(CLASS_NAME);
        el.removeAttribute(ATTR);
        restored += 1;
      }
    }

    return restored;
  }).catch(() => 0);
}

function toFriendlyCaptureError(error) {
  const message = String(error?.message || error || "");
  const blocked =
    message.includes("Cannot access a chrome:// URL") ||
    message.includes("Cannot access contents of url") ||
    message.includes("Cannot access contents of the page") ||
    message.includes("The extensions gallery cannot be scripted");

  if (blocked) {
    return new Error("This page cannot be captured. Open a normal website tab and try again.");
  }

  return error instanceof Error ? error : new Error(message || "Capture failed");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(rect, viewportWidth, viewportHeight) {
  const rawX = Number(rect?.x ?? 0);
  const rawY = Number(rect?.y ?? 0);
  const rawWidth = Number(rect?.width ?? 0);
  const rawHeight = Number(rect?.height ?? 0);

  const x1 = clamp(rawX, 0, viewportWidth);
  const y1 = clamp(rawY, 0, viewportHeight);
  const x2 = clamp(rawX + rawWidth, 0, viewportWidth);
  const y2 = clamp(rawY + rawHeight, 0, viewportHeight);

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

async function cropVisibleAreaDataUrl({
  sourceDataUrl,
  rect,
  viewportWidth,
  viewportHeight,
  format = DEFAULT_FORMAT,
  quality
}) {
  if (!viewportWidth || !viewportHeight) {
    throw new Error("Invalid viewport dimensions for area capture.");
  }

  const normalized = normalizeRect(rect, viewportWidth, viewportHeight);
  if (normalized.width < 2 || normalized.height < 2) {
    throw new Error("Selected area is too small.");
  }

  const bitmap = await fetchBitmap(sourceDataUrl);

  try {
    const scaleX = bitmap.width / viewportWidth;
    const scaleY = bitmap.height / viewportHeight;

    const sourceX = clamp(Math.floor(normalized.x * scaleX), 0, bitmap.width - 1);
    const sourceY = clamp(Math.floor(normalized.y * scaleY), 0, bitmap.height - 1);
    const sourceWidth = clamp(
      Math.ceil(normalized.width * scaleX),
      1,
      bitmap.width - sourceX
    );
    const sourceHeight = clamp(
      Math.ceil(normalized.height * scaleY),
      1,
      bitmap.height - sourceY
    );

    if (sourceWidth > MAX_CANVAS_EDGE || sourceHeight > MAX_CANVAS_EDGE) {
      throw new Error("Selected area is too large to process.");
    }

    const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Canvas rendering context unavailable.");
    }

    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    const blob = await canvas.convertToBlob({
      type: getMimeType(format),
      quality: format === "jpeg" ? (quality ?? 92) / 100 : undefined
    });

    return blobToDataUrl(blob);
  } finally {
    bitmap.close();
  }
}

async function startAreaCapture({ format = DEFAULT_FORMAT, quality } = {}) {
  const tab = await getActiveTab();

  areaCaptureConfigs.set(tab.id, {
    format,
    quality,
    windowId: tab.windowId
  });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/area-selector.js"]
    });
  } catch (error) {
    areaCaptureConfigs.delete(tab.id);
    throw toFriendlyCaptureError(error);
  }

  return {
    ok: true,
    message: "Draw and release to capture the selected area."
  };
}

async function handleAreaSelectionMade(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) {
    return { ok: false, error: "No tab context for area capture." };
  }

  const options = areaCaptureConfigs.get(tabId) || { format: DEFAULT_FORMAT };
  const payload = message?.payload || {};
  const viewportWidth = Number(payload.viewportWidth);
  const viewportHeight = Number(payload.viewportHeight);

  const sourceDataUrl = await captureVisibleTab({
    windowId: sender.tab?.windowId ?? options.windowId,
    format: options.format,
    quality: options.quality
  });

  const croppedDataUrl = await cropVisibleAreaDataUrl({
    sourceDataUrl,
    rect: payload.rect,
    viewportWidth,
    viewportHeight,
    format: options.format,
    quality: options.quality
  });

  const filename = buildFilename(options.format, "area");
  await openPreviewTab({ dataUrl: croppedDataUrl, filename, mode: "area" });
  areaCaptureConfigs.delete(tabId);

  return buildCaptureResponse({ filename, mode: "area" });
}

function handleAreaSelectionCancelled(sender) {
  const tabId = sender.tab?.id;
  if (tabId) {
    areaCaptureConfigs.delete(tabId);
  }

  return { ok: true, cancelled: true };
}

function hasNearbyFrame(frames, scrollY) {
  return frames.some((frame) => Math.abs(frame.scrollY - scrollY) <= EXTENDED_DEDUPE_PX);
}

function dedupeFramesByScroll(frames) {
  const sorted = [...frames].sort((a, b) => a.scrollY - b.scrollY);
  const deduped = [];

  for (const frame of sorted) {
    if (!hasNearbyFrame(deduped, frame.scrollY)) {
      deduped.push(frame);
    }
  }

  return deduped;
}

async function getLiveScrollSnapshot(tabId) {
  return runInTab(tabId, () => ({
    scrollY: Math.round(window.scrollY),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  })).catch(() => null);
}

async function captureExtendedFrame(session, fallbackScrollY) {
  const live = await getLiveScrollSnapshot(session.tabId);
  const preferredY = Number.isFinite(fallbackScrollY)
    ? fallbackScrollY
    : Number.isFinite(session.lastObservedScrollY)
      ? session.lastObservedScrollY
      : live?.scrollY;
  const normalizedY = Math.max(
    0,
    Math.round(preferredY ?? 0)
  );

  if (typeof live?.viewportWidth === "number" && live.viewportWidth > 0) {
    session.viewportWidth = live.viewportWidth;
  }
  if (typeof live?.viewportHeight === "number" && live.viewportHeight > 0) {
    session.viewportHeight = live.viewportHeight;
  }

  if (hasNearbyFrame(session.frames, normalizedY)) {
    return false;
  }

  const dataUrl = await captureVisibleTab({
    windowId: session.windowId,
    format: session.captureFormat
  });

  session.frames.push({ scrollY: normalizedY, dataUrl });
  session.frames.sort((a, b) => a.scrollY - b.scrollY);
  return true;
}

async function enqueueExtendedCapture(session, scrollY) {
  if (typeof scrollY === "number") {
    session.lastObservedScrollY = Math.max(0, Math.round(scrollY));
  }

  session.pendingCaptureCount = Math.min(
    session.pendingCaptureCount + 1,
    EXTENDED_MAX_PENDING_REQUESTS
  );

  if (session.captureLoopRunning) {
    return;
  }

  session.captureLoopRunning = true;

  try {
    while (session.pendingCaptureCount > 0) {
      session.pendingCaptureCount -= 1;
      await captureExtendedFrame(session, session.lastObservedScrollY);
    }
  } finally {
    session.captureLoopRunning = false;
  }
}

async function waitForExtendedIdle(session) {
  while (session.captureLoopRunning) {
    await wait(40);
  }
}

async function getCurrentPageSnapshot(tabId) {
  return runInTab(tabId, () => {
    const body = document.body;
    const doc = document.documentElement;
    const max = (...nums) => Math.max(...nums.filter((n) => Number.isFinite(n)));

    return {
      fullHeight: max(
        doc.scrollHeight,
        doc.offsetHeight,
        doc.clientHeight,
        body?.scrollHeight,
        body?.offsetHeight,
        body?.clientHeight
      ),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
  });
}

function buildLumaSample(bitmap) {
  const sampleWidth = Math.max(
    1,
    Math.min(bitmap.width, STITCH_ALIGNMENT_SAMPLE_WIDTH)
  );
  const sampleHeight = Math.max(
    1,
    Math.round(bitmap.height * (sampleWidth / bitmap.width))
  );
  const canvas = new OffscreenCanvas(sampleWidth, sampleHeight);
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true
  });

  if (!context) {
    return null;
  }

  context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
  const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const luma = new Uint8Array(sampleWidth * sampleHeight);

  for (let pixel = 0, outIndex = 0; pixel < data.length; pixel += 4, outIndex += 1) {
    const r = data[pixel];
    const g = data[pixel + 1];
    const b = data[pixel + 2];
    luma[outIndex] = (r * 77 + g * 150 + b * 29) >> 8;
  }

  return {
    width: sampleWidth,
    height: sampleHeight,
    scaleY: sampleHeight / bitmap.height,
    luma
  };
}

function scoreLumaTopOverlap({ prevSample, nextSample, overlapRows }) {
  const width = Math.min(prevSample.width, nextSample.width);
  const prevStart = prevSample.height - overlapRows;
  const nextStart = 0;
  let total = 0;
  let samples = 0;

  for (let y = 0; y < overlapRows; y += 1) {
    const prevRow = (prevStart + y) * prevSample.width;
    const nextRow = (nextStart + y) * nextSample.width;

    for (let x = 0; x < width; x += STITCH_ALIGNMENT_SAMPLE_STEP_X) {
      const diff = prevSample.luma[prevRow + x] - nextSample.luma[nextRow + x];
      total += Math.abs(diff);
      samples += 1;
    }
  }

  return samples > 0 ? total / samples : Number.POSITIVE_INFINITY;
}

function findAlignedSourceY({
  prevSample,
  nextSample,
  expectedSourceY
}) {
  if (!prevSample || !nextSample) {
    return expectedSourceY;
  }

  const maxOverlapRows = Math.min(prevSample.height - 1, nextSample.height - 1);
  if (maxOverlapRows < 2) {
    return expectedSourceY;
  }

  const minOverlapRows = 2;
  const expectedOverlapRows = clamp(
    Math.round(expectedSourceY * nextSample.scaleY),
    minOverlapRows,
    maxOverlapRows
  );
  let bestOverlapRows = expectedOverlapRows;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let overlapRows = minOverlapRows; overlapRows <= maxOverlapRows; overlapRows += 1) {
    const score = scoreLumaTopOverlap({
      prevSample,
      nextSample,
      overlapRows
    });
    const distancePenalty =
      Math.abs(overlapRows - expectedOverlapRows) * STITCH_ALIGNMENT_DISTANCE_PENALTY;
    const weightedScore = score + distancePenalty;

    if (weightedScore < bestScore) {
      bestScore = weightedScore;
      bestOverlapRows = overlapRows;
    }
  }

  if (!Number.isFinite(bestScore)) {
    return expectedSourceY;
  }

  if (bestScore > STITCH_ALIGNMENT_BAD_SCORE) {
    // If matching confidence is low, fall back to expected seam instead of risking overlaps.
    return expectedSourceY;
  }

  const aligned = Math.round(bestOverlapRows / nextSample.scaleY);
  return clamp(aligned, 0, Math.max(0, Math.round(nextSample.height / nextSample.scaleY) - 1));
}

async function stitchFramesToDataUrl({ frames, viewportWidth, viewportHeight, format, quality }) {
  const sortedFrames = [...frames].sort((a, b) => a.scrollY - b.scrollY);

  if (!sortedFrames.length) {
    throw new Error("No frames captured for stitching.");
  }

  const firstBitmap = await fetchBitmap(sortedFrames[0].dataUrl);
  const safeViewportWidth = Math.max(1, viewportWidth || firstBitmap.width);
  const safeViewportHeight = Math.max(1, viewportHeight || firstBitmap.height);
  const scale = firstBitmap.width / safeViewportWidth;
  const minDeltaCss = EXTENDED_MIN_STEP_PX;
  let stitchedHeightCss = safeViewportHeight;

  for (let index = 1; index < sortedFrames.length; index += 1) {
    const prev = sortedFrames[index - 1];
    const next = sortedFrames[index];
    const rawDelta = next.scrollY - prev.scrollY;
    const normalizedDelta = clamp(rawDelta, minDeltaCss, safeViewportHeight);
    stitchedHeightCss += normalizedDelta;
  }

  const canvasWidth = firstBitmap.width;
  const canvasHeight = Math.round(stitchedHeightCss * scale);

  if (canvasWidth > MAX_CANVAS_EDGE || canvasHeight > MAX_CANVAS_EDGE) {
    firstBitmap.close();
    throw new Error("Captured area is too large for a single stitched image.");
  }

  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    firstBitmap.close();
    throw new Error("Canvas rendering context unavailable.");
  }

  // Draw first frame fully, then append only unseen lower portions from subsequent frames.
  const firstBitmapHeight = firstBitmap.height;
  let prevSample = buildLumaSample(firstBitmap);
  context.drawImage(
    firstBitmap,
    0,
    0,
    firstBitmap.width,
    firstBitmapHeight,
    0,
    0,
    canvas.width,
    firstBitmapHeight
  );
  firstBitmap.close();

  let drawnBottomPx = firstBitmapHeight;

  for (let index = 1; index < sortedFrames.length; index += 1) {
    const prev = sortedFrames[index - 1];
    const frame = sortedFrames[index];
    const rawDelta = frame.scrollY - prev.scrollY;
    const normalizedDelta = clamp(rawDelta, minDeltaCss, safeViewportHeight);
    const overlapCss = Math.max(0, safeViewportHeight - normalizedDelta);
    const bitmap = await fetchBitmap(frame.dataUrl);
    const expectedSourceY = clamp(Math.round(overlapCss * scale), 0, bitmap.height - 1);
    const nextSample = buildLumaSample(bitmap);
    const maxBacktrackPx = Math.max(1, Math.round(STITCH_ALIGNMENT_MAX_BACKTRACK_CSS * scale));
    const maxSearchPx = Math.max(2, Math.round(STITCH_ALIGNMENT_SEARCH_CSS * scale));
    let sourceY = findAlignedSourceY({
      prevSample,
      nextSample,
      expectedSourceY
    });
    // Bound seam near expected to avoid extreme jumps from repeated patterns.
    sourceY = clamp(sourceY, expectedSourceY - maxBacktrackPx, expectedSourceY + maxSearchPx);
    sourceY = clamp(sourceY, 0, bitmap.height - 1);
    const sourceHeight = bitmap.height - sourceY;
    const remainingHeight = canvas.height - drawnBottomPx;
    const drawHeight = Math.min(sourceHeight, Math.max(remainingHeight, 0));

    if (drawHeight > 0) {
      context.drawImage(
        bitmap,
        0,
        sourceY,
        bitmap.width,
        drawHeight,
        0,
        drawnBottomPx,
        canvas.width,
        drawHeight
      );
      drawnBottomPx += drawHeight;
    }

    prevSample = nextSample;
    bitmap.close();
  }

  let outputCanvas = canvas;
  if (drawnBottomPx > 0 && drawnBottomPx < canvas.height) {
    const croppedCanvas = new OffscreenCanvas(canvas.width, drawnBottomPx);
    const croppedContext = croppedCanvas.getContext("2d", { alpha: false });
    if (croppedContext) {
      croppedContext.drawImage(
        canvas,
        0,
        0,
        canvas.width,
        drawnBottomPx,
        0,
        0,
        canvas.width,
        drawnBottomPx
      );
      outputCanvas = croppedCanvas;
    }
  }

  const blob = await outputCanvas.convertToBlob({
    type: getMimeType(format),
    quality: format === "jpeg" ? (quality ?? 92) / 100 : undefined
  });

  return blobToDataUrl(blob);
}

async function startExtendedCapture({ format = DEFAULT_FORMAT, quality } = {}) {
  const tab = await getActiveTab();

  if (extendedSessions.has(tab.id)) {
    return {
      ok: true,
      active: true,
      frameCount: extendedSessions.get(tab.id).frames.length,
      message: "Extended capture is already running on this tab."
    };
  }

  const pageInfo = await getCurrentPageSnapshot(tab.id);
  if (!pageInfo?.viewportWidth || !pageInfo?.viewportHeight) {
    throw new Error("Could not start extended capture on this page.");
  }

  const session = {
    tabId: tab.id,
    windowId: tab.windowId,
    format,
    quality,
    captureFormat: STITCH_SOURCE_FORMAT,
    viewportWidth: pageInfo.viewportWidth,
    viewportHeight: pageInfo.viewportHeight,
    frames: [],
    pendingCaptureCount: 0,
    lastObservedScrollY: Math.max(0, Math.round(pageInfo.scrollY)),
    captureLoopRunning: false
  };

  extendedSessions.set(tab.id, session);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/extended-tracker.js"]
    });
    await hideFixedAndStickyUi(tab.id);

    await enqueueExtendedCapture(session, pageInfo.scrollY);
    await waitForExtendedIdle(session);

    return {
      ok: true,
      active: true,
      frameCount: session.frames.length,
      message: "Extended capture started. Scroll the page, then click finish in the popup."
    };
  } catch (error) {
    await restoreFixedAndStickyUi(tab.id);
    extendedSessions.delete(tab.id);
    throw toFriendlyCaptureError(error);
  }
}

async function stopExtendedTracking(tabId) {
  await chrome.tabs.sendMessage(tabId, { type: "STOP_EXTENDED_TRACKER" }).catch(() => {
    // Ignore if tracker script is unavailable.
  });
  await restoreFixedAndStickyUi(tabId);
}

async function finishExtendedCapture() {
  const tab = await getActiveTab();
  const session = extendedSessions.get(tab.id);

  if (!session) {
    return { ok: false, error: "Extended capture is not active on this tab." };
  }

  try {
    await enqueueExtendedCapture(session, session.lastObservedScrollY);

    await waitForExtendedIdle(session);
    const stitchedFrames = dedupeFramesByScroll(session.frames);

    if (!stitchedFrames.length) {
      throw new Error("No frames were captured. Try scrolling a little and finishing again.");
    }

    const dataUrl = await stitchFramesToDataUrl({
      frames: stitchedFrames,
      viewportWidth: session.viewportWidth,
      viewportHeight: session.viewportHeight,
      format: session.format,
      quality: session.quality
    });

    const filename = buildFilename(session.format, "extended");

    await openPreviewTab({ dataUrl, filename, mode: "extended" });

    return buildCaptureResponse({ filename, mode: "extended", frameCount: stitchedFrames.length });
  } finally {
    await stopExtendedTracking(tab.id);
    extendedSessions.delete(tab.id);
  }
}

async function cancelExtendedCapture() {
  const tab = await getActiveTab();
  if (!extendedSessions.has(tab.id)) {
    return { ok: true, active: false };
  }

  await stopExtendedTracking(tab.id);
  extendedSessions.delete(tab.id);
  return { ok: true, active: false };
}

async function getExtendedState() {
  const tab = await getActiveTab();
  const session = extendedSessions.get(tab.id);

  if (!session) {
    return { ok: true, active: false, frameCount: 0 };
  }

  return {
    ok: true,
    active: true,
    frameCount: session.frames.length
  };
}

async function handleExtendedScrollEvent(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) {
    return;
  }

  const session = extendedSessions.get(tabId);
  if (!session) {
    return;
  }

  const payload = message?.payload || {};
  if (typeof payload.viewportWidth === "number" && payload.viewportWidth > 0) {
    session.viewportWidth = payload.viewportWidth;
  }
  if (typeof payload.viewportHeight === "number" && payload.viewportHeight > 0) {
    session.viewportHeight = payload.viewportHeight;
  }

  const observedY = typeof payload.virtualScrollY === "number"
    ? payload.virtualScrollY
    : payload.scrollY;

  if (typeof observedY === "number") {
    await enqueueExtendedCapture(session, observedY);
  }
}

async function captureFullPageDataUrl({ format = DEFAULT_FORMAT, quality } = {}) {
  const tab = await getActiveTab();
  const tabId = tab.id;

  const pageInfo = await getCurrentPageSnapshot(tabId);

  if (!pageInfo || !pageInfo.viewportHeight || !pageInfo.viewportWidth) {
    throw new Error("Unable to read page dimensions for full-page capture.");
  }

  const maxScrollY = Math.max(pageInfo.fullHeight - pageInfo.viewportHeight, 0);
  const stepY = Math.max(1, Math.round(pageInfo.viewportHeight * FULL_PAGE_SCROLL_STEP_RATIO));
  const scrollPositions = [];
  for (let y = 0; y <= maxScrollY; y += stepY) {
    scrollPositions.push(y);
  }
  if (scrollPositions[scrollPositions.length - 1] !== maxScrollY) {
    scrollPositions.push(maxScrollY);
  }

  const frames = [];
  let stitchedViewportWidth = pageInfo.viewportWidth;
  let stitchedViewportHeight = pageInfo.viewportHeight;

  try {
    await hideFixedAndStickyUi(tabId);

    for (const y of scrollPositions) {
      await runInTab(tabId, (targetY) => {
        window.scrollTo(0, targetY);
      }, [y]);

      await wait(FULL_PAGE_SCROLL_DELAY_MS);
      const frameDataUrl = await captureVisibleTab({
        windowId: tab.windowId,
        format: STITCH_SOURCE_FORMAT
      });
      const live = await getLiveScrollSnapshot(tabId);
      const liveY = Math.max(0, Math.round(live?.scrollY ?? y));

      if (typeof live?.viewportWidth === "number" && live.viewportWidth > 0) {
        stitchedViewportWidth = live.viewportWidth;
      }
      if (typeof live?.viewportHeight === "number" && live.viewportHeight > 0) {
        stitchedViewportHeight = live.viewportHeight;
      }

      frames.push({ scrollY: liveY, dataUrl: frameDataUrl });
    }
  } finally {
    await restoreFixedAndStickyUi(tabId);
    await runInTab(tabId, (x, y) => {
      window.scrollTo(x, y);
    }, [pageInfo.scrollX, pageInfo.scrollY]).catch(() => {
      // Ignore restore failure if tab changed.
    });
  }

  if (!frames.length) {
    throw new Error("Could not capture full page.");
  }

  return stitchFramesToDataUrl({
    frames: dedupeFramesByScroll(frames),
    viewportWidth: stitchedViewportWidth,
    viewportHeight: stitchedViewportHeight,
    format,
    quality
  });
}

async function captureFullPageAndDownload({ format = DEFAULT_FORMAT, quality } = {}) {
  const dataUrl = await captureFullPageDataUrl({ format, quality });
  const filename = buildFilename(format, "fullpage");

  await openPreviewTab({ dataUrl, filename, mode: "fullpage" });

  return buildCaptureResponse({ filename, mode: "fullpage" });
}

async function downloadFromPreview({ dataUrl, filename }) {
  if (!dataUrl || !filename) {
    throw new Error("Preview download is missing required data.");
  }

  await downloadUrl(dataUrl, filename);
  return {
    ok: true,
    filename,
    displayName: displayNameFromFilename(filename)
  };
}

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === "capture-visible-tab") {
      await captureAndDownload({ format: DEFAULT_FORMAT });
      return;
    }

    if (command === "capture-full-page") {
      await captureFullPageAndDownload({ format: DEFAULT_FORMAT });
    }
  } catch (error) {
    console.error("Command capture failed:", error);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  extendedSessions.delete(tabId);
  areaCaptureConfigs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" && extendedSessions.has(tabId)) {
    extendedSessions.delete(tabId);
  }

  if (changeInfo.status === "loading" && areaCaptureConfigs.has(tabId)) {
    areaCaptureConfigs.delete(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "CAPTURE_DOWNLOAD" || message?.type === "CAPTURE_VISIBLE") {
        const result = await captureAndDownload(message.payload || {});
        sendResponse(result);
        return;
      }

      if (message?.type === "CAPTURE_PREVIEW") {
        const result = await captureAndPreview(message.payload || {});
        sendResponse(result);
        return;
      }

      if (message?.type === "CAPTURE_DELAYED_VISIBLE") {
        const result = await captureVisibleWithDelay(message.payload || {});
        sendResponse(result);
        return;
      }

      if (message?.type === "CAPTURE_FULL_PAGE_DOWNLOAD" || message?.type === "CAPTURE_FULL_PAGE") {
        const result = await captureFullPageAndDownload(message.payload || {});
        sendResponse(result);
        return;
      }

      if (
        message?.type === "START_AREA_CAPTURE" ||
        message?.type === "CAPTURE_AREA" ||
        message?.type === "CAPTURE_SELECTED_AREA"
      ) {
        const result = await startAreaCapture(message.payload || {});
        sendResponse(result);
        return;
      }

      if (message?.type === "START_EXTENDED_CAPTURE") {
        const result = await startExtendedCapture(message.payload || {});
        sendResponse(result);
        return;
      }

      if (message?.type === "FINISH_EXTENDED_CAPTURE") {
        const result = await finishExtendedCapture();
        sendResponse(result);
        return;
      }

      if (message?.type === "CANCEL_EXTENDED_CAPTURE") {
        const result = await cancelExtendedCapture();
        sendResponse(result);
        return;
      }

      if (message?.type === "GET_EXTENDED_STATE") {
        const result = await getExtendedState();
        sendResponse(result);
        return;
      }

      if (message?.type === "EXTENDED_SCROLL_EVENT") {
        await handleExtendedScrollEvent(message, sender);
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "AREA_SELECTION_MADE") {
        const result = await handleAreaSelectionMade(message, sender);
        sendResponse(result);
        return;
      }

      if (message?.type === "AREA_SELECTION_CANCELLED") {
        const result = handleAreaSelectionCancelled(sender);
        sendResponse(result);
        return;
      }

      if (message?.type === "PREVIEW_DOWNLOAD") {
        const result = await downloadFromPreview(message.payload || {});
        sendResponse(result);
        return;
      }

      if (message?.type === "GET_PREVIEW_PAYLOAD") {
        const payload = getPreviewPayload(message?.payload?.id);
        if (!payload) {
          sendResponse({ ok: false, error: "Preview expired. Capture again." });
          return;
        }

        sendResponse({ ok: true, ...payload });
        return;
      }

      sendResponse({
        ok: false,
        error: `Unknown message type: ${String(message?.type || "undefined")}`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: errorMessage });
    }
  })();

  return true;
});
