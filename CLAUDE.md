# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension (Manifest V3) that toggles development mode for on24.com domains by managing a cookie (`htm-dev-mode`) and proxy settings simultaneously.

## Development

No build step required. This is a plain JavaScript extension.

**To test changes:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. After code changes, click the refresh icon on the extension card

## Architecture

**background.js** - Service worker containing all extension logic:
- Listens for extension icon clicks to toggle dev mode
- Sets/removes cookie `htm-dev-mode=4815162342` on `.on24.com`
- Switches proxy between system and direct modes
- Generates dynamic "DEV" badge icon (green=ON, red=OFF) using OffscreenCanvas
- Auto-reloads tabs on matching domains when toggled

**manifest.json** - Extension configuration (Manifest V3):
- Permissions: `cookies`, `scripting`, `proxy`
- Host permissions restricted to `*://*.on24.com/*`

## Key Implementation Details

- Cookie and proxy state are always modified together for consistency
- Extension initializes on install, startup, and immediately to ensure state persistence
- Icon color indicates current state: `#00C853` (green) = ON, `#FF3D00` (red) = OFF
