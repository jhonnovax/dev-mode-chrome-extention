// Cookie configuration
const COOKIE_CONFIG = {
  name: 'htm-dev-mode',
  value: '4815162342',
  path: '/',
  secure: true,
  sameSite: 'no_restriction'
};

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

// Store state per domain
const domainStates = new Map();

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
 * Get the state for a domain from the Map
 * @param {string} domain - The domain to get state for
 * @returns {string} - The state or OFF if not set
 */
function getStateForDomain(domain) {
  return domainStates.get(domain) || STATES.OFF;
}

/**
 * Set the state for a domain in the Map
 * @param {string} domain - The domain to set state for
 * @param {string} state - The state to set
 */
function setStateForDomain(domain, state) {
  domainStates.set(domain, state);
}

/**
 * Get the state for a tab based on its domain
 * @param {chrome.tabs.Tab} [tab] - The tab to get state for
 * @returns {string} - The state or OFF if no valid domain
 */
function getStateForTab(tab) {
  if (!tab?.url) return STATES.OFF;
  const domain = extractDomain(tab.url);
  if (!domain) return STATES.OFF;
  return getStateForDomain(domain);
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
 * Extract the root domain from a URL (e.g., "https://www.example.com/path" -> ".example.com")
 * @param {string} url - The URL to extract domain from
 * @returns {string|null} - The root domain with leading dot, or null if invalid
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // Get root domain (last two parts, e.g., "example.com")
      return '.' + parts.slice(-2).join('.');
    }
    return '.' + hostname;
  } catch {
    return null;
  }
}

/**
 * Set the dev mode cookie for the given domain
 * @param {string} domain - The domain to set the cookie on (e.g., ".example.com")
 * @param {string} url - The URL to use for setting the cookie
 */
async function setCookie(domain, url) {
  const oneYearFromNow = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

  await chrome.cookies.set({
    url: url,
    name: COOKIE_CONFIG.name,
    value: COOKIE_CONFIG.value,
    domain: domain,
    path: COOKIE_CONFIG.path,
    secure: COOKIE_CONFIG.secure,
    sameSite: COOKIE_CONFIG.sameSite,
    expirationDate: oneYearFromNow
  });
}

/**
 * Remove the dev mode cookie for the given domain
 * @param {string} url - The URL to use for removing the cookie
 */
async function removeCookie(url) {
  await chrome.cookies.remove({
    url: url,
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
      urlFilter: '*',
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
 * @param {chrome.tabs.Tab} [tab] - Optional tab to use for cookie domain
 */
async function applyStateConfig(state, tab) {
  const config = STATE_CONFIG[state];

  // Handle cookie based on the current tab's domain
  if (tab && tab.url) {
    const domain = extractDomain(tab.url);
    if (domain) {
      if (config.cookie) {
        await setCookie(domain, tab.url);
      } else {
        await removeCookie(tab.url);
      }
    }
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
 * Initialize extension - just update icon for current tab
 */
async function initialize() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const state = getStateForTab(activeTab);
  await updateIcon(state);
}

/**
 * Handle state change request from popup
 * @param {string} newState - The state to switch to
 */
async function setState(newState) {
  if (!STATE_CONFIG[newState]) return;

  // Get the current active tab for cookie domain
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab?.url) {
    const domain = extractDomain(activeTab.url);
    if (domain) {
      // Save state for this domain
      setStateForDomain(domain, newState);
    }
  }

  await applyStateConfig(newState, activeTab);

  // Reload the active tab after state change
  if (activeTab) {
    chrome.tabs.reload(activeTab.id);
  }
}

// Event Listeners

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'setState') {
    setState(message.state).then(() => sendResponse({ success: true }));
    return true; // Keep channel open for async response
  }
  if (message.action === 'getState') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
      const state = getStateForTab(activeTab);
      sendResponse({ state });
    });
    return true; // Keep channel open for async response
  }
});

// Update icon and apply config when tab is activated (user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  const state = getStateForTab(tab);
  await applyStateConfig(state, tab);
});

// Update icon and apply config when tab URL changes (navigation)
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    const state = getStateForTab(tab);
    await applyStateConfig(state, tab);
  }
});

// Initialize on install or update
chrome.runtime.onInstalled.addListener(initialize);

// Initialize on browser startup
chrome.runtime.onStartup.addListener(initialize);

// Also initialize immediately when service worker starts
initialize();
