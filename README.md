# Instant Tab Screenshot (Chrome Extension)

Chrome Manifest V3 extension for fast screenshots with instant preview.

## Features

- Visible capture: click once -> open preview
- Delayed visible capture (3 seconds): reopen dropdown/menu, then capture
- Area capture: drag to select region -> open preview
- Full-page capture: auto scroll + stitch -> open preview
- Extended capture mode: manual scroll + auto frame capture -> stitch -> open preview
- Preview page actions: copy image, download, close
- Downloads (from preview) are categorized under `Downloads/Screenshots/...`
- Keyboard shortcuts
  - Windows/Linux: `Ctrl + Shift + S` (visible)
  - macOS: `Command + Shift + S` (visible)
  - Windows/Linux: `Ctrl + Shift + F` (full page)
  - macOS: `Command + Shift + F` (full page)
- PNG and JPEG output

## Extended Capture Workflow

1. Open popup and click `Extended: Start`
2. Scroll manually through the part you want
3. Open popup again and click `Extended: Finish`

The extension records viewport frames while you scroll, then stitches them into one long screenshot.

## Project Structure

- `manifest.json` - extension manifest and permissions
- `src/background.js` - capture, stitching, preview, and session state logic
- `src/area-selector.js` - injected drag selector for area capture
- `src/extended-tracker.js` - injected scroll tracker for extended mode
- `src/popup/popup.html` - popup markup
- `src/popup/popup.css` - popup styles
- `src/popup/popup.js` - popup interactions
- `src/preview/preview.html` - capture preview screen
- `src/preview/preview.css` - preview styles
- `src/preview/preview.js` - preview actions (copy/download)

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `/Users/shivat/Documents/screenshot`

## Permissions

- `activeTab`
- `tabs`
- `downloads`
- `scripting`
- `clipboardWrite`
- `storage` (reserved for future settings persistence)

## Notes and Limits

- Delayed mode helps capture menus/dropdowns that close when extension popup opens.
- Area mode captures a selected rectangle from the visible viewport.
- Full-page mode captures by automatic vertical scrolling.
- Extended mode captures only positions you manually scrolled to.
- Some pages with sticky/fixed elements may show repeated headers.
- Very tall captures can exceed canvas limits and return an error.
- It does not capture browser UI, desktop, or other apps.
