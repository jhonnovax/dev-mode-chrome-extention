// Cookie configuration
const COOKIE_CONFIG = {
  name: 'htm-dev-mode',
  value: '4815162342',
  domain: '.on24.com',
  path: '/',
  secure: true,
  sameSite: 'no_restriction'
};

const COOKIE_URL = 'https://on24.com';

// Three states: dev, prod, off
const STATES = {
  DEV: 'dev',
  PROD: 'prod',
  OFF: 'off'
};

// State configurations
const STATE_CONFIG = {
  [STATES.DEV]: {
    color: '#00C853',      // Green
    label: 'DEV',
    title: 'Development Mode',
    cookie: true,          // Cookie is SET
    proxy: 'system',
    disableCache: true     // Cache disabled
  },
  [STATES.PROD]: {
    color: '#D32F2F',      // Red
    label: 'PRO',
    title: 'Production Mode',
    cookie: false,         // Cookie deleted
    proxy: 'system',
    disableCache: true     // Cache disabled
  },
  [STATES.OFF]: {
    color: '#757575',      // Gray
    label: 'OFF',
    title: 'Off',
    cookie: false,         // Cookie deleted
    proxy: 'direct',
    disableCache: false    // Cache enabled (normal)
  }
};

// Rule ID for cache-disabling
const CACHE_RULE_ID = 1;

/**
 * Generate an accessible badge icon using OffscreenCanvas
 * @param {string} color - The fill color for the badge
 * @param {string} label - The text label to display
 * @returns {ImageData} - The icon image data
 */
function generateIcon(color, label) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Clear canvas
  ctx.clearRect(0, 0, size, size);

  // Draw rounded rectangle background
  const radius = 4;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fillStyle = color;
  ctx.fill();

  // Add subtle border for better visibility
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw text with shadow for better readability
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Text shadow for accessibility
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  ctx.fillText(label, size / 2, size / 2 + 1);

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Get the current state from storage
 * @returns {Promise<string>} - Current state
 */
async function getCurrentState() {
  const result = await chrome.storage.local.get('extensionState');
  return result.extensionState || STATES.OFF;
}

/**
 * Save the current state to storage
 * @param {string} state - State to save
 */
async function saveState(state) {
  await chrome.storage.local.set({ extensionState: state });
}

/**
 * Set the extension icon based on state
 * @param {string} state - Current state
 */
async function updateIcon(state) {
  const config = STATE_CONFIG[state];
  const imageData = generateIcon(config.color, config.label);

  await chrome.action.setIcon({
    imageData: { 32: imageData }
  });

  await chrome.action.setTitle({
    title: config.title
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
 * Set proxy mode
 * @param {string} mode - 'system' or 'direct'
 */
async function setProxy(mode) {
  await chrome.proxy.settings.set({
    value: { mode },
    scope: 'regular'
  });
}

/**
 * Enable cache bypass by adding request headers
 */
async function enableCacheBypass() {
  const rule = {
    id: CACHE_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Cache-Control', operation: 'set', value: 'no-cache, no-store, must-revalidate' },
        { header: 'Pragma', operation: 'set', value: 'no-cache' }
      ]
    },
    condition: {
      urlFilter: '*://*.on24.com/*',
      resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'xmlhttprequest', 'other']
    }
  };

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [CACHE_RULE_ID],
    addRules: [rule]
  });
}

/**
 * Disable cache bypass by removing the rule
 */
async function disableCacheBypass() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [CACHE_RULE_ID]
  });
}

/**
 * Apply the configuration for a given state
 * @param {string} state - State to apply
 */
async function applyStateConfig(state) {
  const config = STATE_CONFIG[state];

  // Handle cookie
  if (config.cookie) {
    await setCookie();
  } else {
    await removeCookie();
  }

  // Handle proxy
  await setProxy(config.proxy);

  // Handle cache
  if (config.disableCache) {
    await enableCacheBypass();
  } else {
    await disableCacheBypass();
  }

  // Update icon
  await updateIcon(state);
}

/**
 * Reload the current tab if it matches the cookie domain
 * @param {chrome.tabs.Tab} tab - The tab to potentially reload
 */
function reloadIfMatchingDomain(tab) {
  if (tab.url && tab.url.includes(COOKIE_CONFIG.domain.replace('.', ''))) {
    chrome.tabs.reload(tab.id);
  }
}

/**
 * Initialize extension state
 */
async function initialize() {
  const state = await getCurrentState();
  await applyStateConfig(state);
}

/**
 * Handle state change request from popup
 * @param {string} newState - The state to switch to
 */
async function setState(newState) {
  if (!STATE_CONFIG[newState]) return;

  await saveState(newState);
  await applyStateConfig(newState);

  // Reload matching tabs
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => reloadIfMatchingDomain(tab));
}

// Event Listeners

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'setState') {
    setState(message.state).then(() => sendResponse({ success: true }));
    return true; // Keep channel open for async response
  }
});

// Initialize on install or update
chrome.runtime.onInstalled.addListener(initialize);

// Initialize on browser startup
chrome.runtime.onStartup.addListener(initialize);

// Also initialize immediately when service worker starts
initialize();
