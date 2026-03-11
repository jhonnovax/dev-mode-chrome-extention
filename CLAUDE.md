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

**background.js** - Service worker containing extension logic:
- Manages four states: OFF, DEV, PREVIEW, PROD
- Sets/removes cookie `htm-dev-mode=4815162342` on `.on24.com`
- Switches proxy between system and direct modes
- Generates dynamic badge icons using OffscreenCanvas
- Auto-reloads tabs on matching domains when state changes

**popup.html / popup.js** - Dropdown menu UI:
- Styled dark theme dropdown with four options
- Animated entry and click ripple effects
- Communicates with background.js via chrome.runtime.sendMessage

**manifest.json** - Extension configuration (Manifest V3):
- Permissions: `cookies`, `scripting`, `proxy`, `storage`
- Host permissions restricted to `*://*.on24.com/*`

## Key Implementation Details

- Click icon to open dropdown menu with four options
- State is persisted in chrome.storage.local
- Extension initializes on install, startup, and immediately to ensure state persistence

**States:**
| State | Icon | Label | Cookie | Proxy | Cache |
|-------|------|-------|--------|-------|-------|
| OFF | Gray (#757575) | OFF | deleted | system | enabled |
| DEV | Green (#00C853) | DEV | SET (`htm-dev-mode=4815162342`) | fixed (`127.0.0.1:8888`) | disabled |
| PREVIEW | Yellow (#EAB308) | PREV | deleted | fixed (`127.0.0.1:8888`) | disabled |
| PROD | Red (#D32F2F) | PROD | deleted | direct | disabled |

**UI Features:**
- Dark theme popup with animated menu items
- Click ripple effect on selection
- Active state indicator (glowing dot + border)
- Slide-in animation on open
