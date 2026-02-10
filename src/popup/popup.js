const formatSelect = document.getElementById("format");
const downloadBtn = document.getElementById("downloadBtn");
const areaBtn = document.getElementById("areaBtn");
const fullPageBtn = document.getElementById("fullPageBtn");
const extendedBtn = document.getElementById("extendedBtn");
const statusEl = document.getElementById("status");

const JPEG_QUALITY = 92;
let extendedActive = false;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function setButtonsDisabled(disabled) {
  downloadBtn.disabled = disabled;
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

function sendMessage(type, withPayload = true) {
  const message = { type };
  if (withPayload) {
    message.payload = getPayload();
  }

  return chrome.runtime.sendMessage(message);
}

function refreshExtendedButton() {
  if (extendedActive) {
    extendedBtn.textContent = "Extended: Finish";
    extendedBtn.classList.add("active");
  } else {
    extendedBtn.textContent = "Extended: Start";
    extendedBtn.classList.remove("active");
  }
}

async function loadExtendedState() {
  try {
    const response = await sendMessage("GET_EXTENDED_STATE", false);
    extendedActive = Boolean(response?.active);
    refreshExtendedButton();
  } catch {
    extendedActive = false;
    refreshExtendedButton();
  }
}

async function runAction(type, loadingLabel, successLabel, withPayload = true) {
  setButtonsDisabled(true);
  setStatus(loadingLabel);

  try {
    const response = await sendMessage(type, withPayload);
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
    "Capturing visible area...",
    () => "Preview opened. Copy or download from preview."
  );
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
    "Capturing full page...",
    () => "Preview opened. Copy or download from preview."
  );
});

extendedBtn.addEventListener("click", async () => {
  if (!extendedActive) {
    const response = await runAction(
      "START_EXTENDED_CAPTURE",
      "Starting extended capture...",
      () => "Extended started. Scroll page, then reopen extension to finish."
    );

    if (response?.ok) {
      extendedActive = true;
      refreshExtendedButton();
    }

    return;
  }

  const response = await runAction(
    "FINISH_EXTENDED_CAPTURE",
    "Finishing and stitching extended capture...",
    (result) => `Preview opened (${result.frameCount} frames). Copy or download there.`,
    false
  );

  if (response?.ok) {
    extendedActive = false;
    refreshExtendedButton();
  }
});

loadExtendedState();
