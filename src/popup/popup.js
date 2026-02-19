const formatSelect = document.getElementById("format");
const downloadBtn = document.getElementById("downloadBtn");
const delayedBtn = document.getElementById("delayedBtn");
const areaBtn = document.getElementById("areaBtn");
const fullPageBtn = document.getElementById("fullPageBtn");
const extendedBtn = document.getElementById("extendedBtn");
const statusEl = document.getElementById("status");

const JPEG_QUALITY = 92;
const DROPDOWN_DELAY_MS = 3000;
const NO_PAYLOAD = Symbol("NO_PAYLOAD");
let extendedActive = false;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function setButtonsDisabled(disabled) {
  downloadBtn.disabled = disabled;
  delayedBtn.disabled = disabled;
  areaBtn.disabled = disabled;
  fullPageBtn.disabled = disabled;
  extendedBtn.disabled = disabled;
}

function getPayload() {
  const format = formatSelect.value;
  const payload = { format };

  if (format === "jpeg") {
    payload.quality = JPEG_QUALITY;
  }

  return payload;
}

function sendMessage(type, payload = undefined) {
  const message = { type };
  if (payload !== undefined) {
    message.payload = payload;
  }

  return chrome.runtime.sendMessage(message);
}

function refreshExtendedButton() {
  if (extendedActive) {
    extendedBtn.textContent = "Long Capture: Finish";
    extendedBtn.classList.add("active");
  } else {
    extendedBtn.textContent = "Long Capture: Start";
    extendedBtn.classList.remove("active");
  }
}

async function loadExtendedState() {
  try {
    const response = await sendMessage("GET_EXTENDED_STATE");
    extendedActive = Boolean(response?.active);
    refreshExtendedButton();
  } catch {
    extendedActive = false;
    refreshExtendedButton();
  }
}

async function runAction(type, loadingLabel, successLabel, payload = undefined) {
  setButtonsDisabled(true);
  setStatus(loadingLabel);

  try {
    const effectivePayload = payload === undefined ? getPayload() : payload;
    const response = effectivePayload === NO_PAYLOAD
      ? await sendMessage(type)
      : await sendMessage(type, effectivePayload);
    if (!response?.ok) {
      throw new Error(response?.error || "Capture failed");
    }

    setStatus(successLabel(response), "ok");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isStaleWorker = message.includes("Unknown message type");
    const isRestrictedPage =
      message.includes("Cannot access a chrome:// URL") ||
      message.includes("Cannot access contents of the page") ||
      message.includes("This page cannot be captured");

    const friendly = isStaleWorker
      ? "Extension worker is stale. Reload this extension in chrome://extensions and try again."
      : isRestrictedPage
        ? "This page is restricted by Chrome. Open a normal website tab and try again."
        : message;
    setStatus(friendly, "error");
    return null;
  } finally {
    setButtonsDisabled(false);
  }
}

downloadBtn.addEventListener("click", async () => {
  await runAction(
    "CAPTURE_DOWNLOAD",
    "Capturing current view...",
    () => "Preview opened. Copy or download from preview."
  );
});

delayedBtn.addEventListener("click", () => {
  const payload = {
    ...getPayload(),
    delayMs: DROPDOWN_DELAY_MS
  };

  setStatus("Timer started (3s). Reopen dropdown now...", "ok");
  chrome.runtime.sendMessage({
    type: "CAPTURE_DELAYED_VISIBLE",
    payload
  }).catch(() => {
    // Ignore here; capture errors are shown when service worker responds/opens preview.
  });

  // Close immediately so page keeps focus and dropdown can be reopened before capture.
  window.close();
});

areaBtn.addEventListener("click", async () => {
  await runAction(
    "START_AREA_CAPTURE",
    "Starting area selector...",
    () => "Drag and release on the page to capture selected area."
  );
});

fullPageBtn.addEventListener("click", async () => {
  await runAction(
    "CAPTURE_FULL_PAGE_DOWNLOAD",
    "Capturing full page (auto-scroll)...",
    () => "Preview opened. Copy or download from preview."
  );
});

extendedBtn.addEventListener("click", async () => {
  if (!extendedActive) {
    const response = await runAction(
      "START_EXTENDED_CAPTURE",
      "Starting long capture...",
      () => "Long capture started. Scroll page, then reopen extension to finish."
    );

    if (response?.ok) {
      extendedActive = true;
      refreshExtendedButton();
    }

    return;
  }

  const response = await runAction(
    "FINISH_EXTENDED_CAPTURE",
    "Finishing and stitching long capture...",
    (result) => `Preview opened (${result.frameCount} frames). Copy or download there.`,
    NO_PAYLOAD
  );

  if (response?.ok) {
    extendedActive = false;
    refreshExtendedButton();
  }
});

loadExtendedState();
