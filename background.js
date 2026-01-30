// Cookie configuration
const COOKIE_CONFIG = {
  name: 'htm-dev-mode',
  value: '4815162342',
  domain: '.on24.com',
  path: '/',
  secure: true,
  sameSite: 'no_restriction'
};

const DOMAIN_PATTERN = '*://*.on24.com/*';
const COOKIE_URL = 'https://on24.com';

// Colors for icon states
const COLOR_ON = '#00C853';  // Green - Dev Mode ON
const COLOR_OFF = '#FF3D00'; // Red - Dev Mode OFF

/**
 * Generate a DEV badge icon using OffscreenCanvas
 * @param {string} color - The fill color for the badge
 * @returns {ImageData} - The icon image data
 */
function generateDevIcon(color) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Clear canvas
  ctx.clearRect(0, 0, size, size);

  // Draw rounded square background - fill entire canvas
  const radius = 4;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fillStyle = color;
  ctx.fill();

  // Draw "DEV" text - larger and bolder
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DEV', size / 2, size / 2 + 1);

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Adjust color brightness
 * @param {string} hex - Hex color string
 * @param {number} amount - Amount to adjust (-255 to 255)
 * @returns {string} - Adjusted hex color
 */
function adjustBrightness(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Check if the dev mode cookie exists
 * @returns {Promise<boolean>}
 */
async function isCookiePresent() {
  const cookie = await chrome.cookies.get({
    url: COOKIE_URL,
    name: COOKIE_CONFIG.name
  });
  return cookie !== null;
}

/**
 * Set the extension icon based on cookie state
 * @param {boolean} isOn - Whether dev mode is on
 */
async function updateIcon(isOn) {
  const color = isOn ? COLOR_ON : COLOR_OFF;
  const imageData = generateDevIcon(color);

  await chrome.action.setIcon({
    imageData: { 32: imageData }
  });

  await chrome.action.setTitle({
    title: isOn ? 'Dev Mode: ON (Click to disable)' : 'Dev Mode: OFF (Click to enable)'
  });
}

/**
 * Set the dev mode cookie
 */
async function setCookie() {
  const oneYearFromNow = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

  await chrome.cookies.set({
    url: COOKIE_URL,
    name: COOKIE_CONFIG.name,
    value: COOKIE_CONFIG.value,
    domain: COOKIE_CONFIG.domain,
    path: COOKIE_CONFIG.path,
    secure: COOKIE_CONFIG.secure,
    sameSite: COOKIE_CONFIG.sameSite,
    expirationDate: oneYearFromNow
  });
}

/**
 * Remove the dev mode cookie
 */
async function removeCookie() {
  await chrome.cookies.remove({
    url: COOKIE_URL,
    name: COOKIE_CONFIG.name
  });
}

/**
 * Set proxy mode to system (uses system proxy settings)
 */
async function setProxyToSystem() {
  await chrome.proxy.settings.set({
    value: { mode: 'system' },
    scope: 'regular'
  });
}

/**
 * Set proxy mode to direct (no proxy)
 */
async function setProxyToDirect() {
  await chrome.proxy.settings.set({
    value: { mode: 'direct' },
    scope: 'regular'
  });
}

/**
 * Reload the current tab if it matches the cookie domain
 * @param {chrome.tabs.Tab} tab - The tab to potentially reload
 */
function reloadIfMatchingDomain(tab) {
  if (tab.url && tab.url.includes(COOKIE_CONFIG.domain)) {
    chrome.tabs.reload(tab.id);
  }
}

/**
 * Toggle the cookie state and proxy mode
 * @param {chrome.tabs.Tab} tab - The tab that triggered the action
 */
async function toggleCookie(tab) {
  const isCurrentlyOn = await isCookiePresent();

  if (isCurrentlyOn) {
    await removeCookie();
    await setProxyToDirect();
  } else {
    await setCookie();
    await setProxyToSystem();
  }

  const newState = !isCurrentlyOn;
  await updateIcon(newState);
  reloadIfMatchingDomain(tab);
}

/**
 * Initialize extension state
 */
async function initialize() {
  const isOn = await isCookiePresent();
  await updateIcon(isOn);

  if (isOn) {
    await setProxyToSystem();
  } else {
    await setProxyToDirect();
  }
}

// Event Listeners

// Handle extension icon click
chrome.action.onClicked.addListener(toggleCookie);

// Initialize on install or update
chrome.runtime.onInstalled.addListener(initialize);

// Initialize on browser startup
chrome.runtime.onStartup.addListener(initialize);

// Also initialize immediately when service worker starts
initialize();
