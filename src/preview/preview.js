const params = new URLSearchParams(window.location.search);
const previewId = params.get("id") || "";

const previewImage = document.getElementById("previewImage");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const closeBtn = document.getElementById("closeBtn");
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const modeChip = document.getElementById("modeChip");

let cachedBlob = null;
let previewDataUrl = "";
let previewFilename = "screenshot.png";
let previewMode = "screenshot";

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function setButtonsDisabled(disabled) {
  copyBtn.disabled = disabled;
  downloadBtn.disabled = disabled;
}

function displayNameFromFilename(filename) {
  return String(filename).split("/").pop() || filename;
}

async function getImageBlob() {
  if (cachedBlob) {
    return cachedBlob;
  }

  if (!previewDataUrl) {
    throw new Error("Preview image data is unavailable.");
  }

  const response = await fetch(previewDataUrl);
  cachedBlob = await response.blob();
  return cachedBlob;
}

async function copyImageToClipboard() {
  if (!window.ClipboardItem || !navigator.clipboard?.write) {
    throw new Error("Clipboard image copy is not supported in this browser context.");
  }

  const blob = await getImageBlob();

  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type]: blob
    })
  ]);
}

async function downloadAgain() {
  const response = await chrome.runtime.sendMessage({
    type: "PREVIEW_DOWNLOAD",
    payload: {
      dataUrl: previewDataUrl,
      filename: previewFilename
    }
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Download failed");
  }

  return response;
}

async function onCopyClick() {
  setButtonsDisabled(true);
  setStatus("Copying image...");

  try {
    await copyImageToClipboard();
    setStatus("Image copied to clipboard", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "error");
  } finally {
    setButtonsDisabled(false);
  }
}

async function onDownloadClick() {
  setButtonsDisabled(true);
  setStatus("Downloading...");

  try {
    const response = await downloadAgain();
    setStatus(`Saved ${response.displayName}`, "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "error");
  } finally {
    setButtonsDisabled(false);
  }
}

function onCloseClick() {
  window.close();
}

async function initPreview() {
  if (!previewId) {
    setStatus("Preview id is missing.", "error");
    setButtonsDisabled(true);
    return;
  }

  setStatus("Loading preview...");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_PREVIEW_PAYLOAD",
      payload: { id: previewId }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not load preview payload");
    }

    previewDataUrl = response.dataUrl || "";
    previewFilename = response.filename || previewFilename;
    previewMode = response.mode || previewMode;

    if (!previewDataUrl) {
      throw new Error("Preview image data missing.");
    }

    previewImage.src = previewDataUrl;
    previewImage.onload = () => {
      setStatus("Ready", "ok");
    };
    previewImage.onerror = () => {
      setStatus("Could not load preview image.", "error");
    };

    const displayName = displayNameFromFilename(previewFilename);
    metaEl.textContent = `${displayName} - ${previewFilename}`;
    modeChip.textContent = previewMode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "error");
    setButtonsDisabled(true);
  }
}

copyBtn.addEventListener("click", onCopyClick);
downloadBtn.addEventListener("click", onDownloadClick);
closeBtn.addEventListener("click", onCloseClick);

initPreview();
