// Constants
const COOKIE_NAME = 'htm-dev-mode';
const COOKIE_VALUE = '4815162342';
const CACHE_RULE_ID = 1;
const STORAGE_KEY = 'domainStates';

const STATES = { DEV: 'dev', PROD: 'prod', OFF: 'off' };

const STATE_CONFIG = {
  [STATES.DEV]:  { color: '#00C853', label: 'DEV', title: 'Development Mode', cookie: true,  proxy: 'system', cache: false },
  [STATES.PROD]: { color: '#D32F2F', label: 'PRO', title: 'Production Mode',  cookie: false, proxy: 'system', cache: false },
  [STATES.OFF]:  { color: '#757575', label: 'OFF', title: 'Off',              cookie: false, proxy: null,     cache: true }
};

// Generate badge icon
function generateIcon(color, label) {
  const canvas = new OffscreenCanvas(32, 32);
  const ctx = canvas.getContext('2d');

  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 4);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.stroke();

  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillText(label, 16, 17);

  return ctx.getImageData(0, 0, 32, 32);
}

// Extract root domain from URL
function extractDomain(url) {
  try {
    const parts = new URL(url).hostname.split('.');
    return '.' + parts.slice(-2).join('.');
  } catch {
    return null;
  }
}

// Get state for a domain
async function getState(domain) {
  const { [STORAGE_KEY]: states = {} } = await chrome.storage.local.get(STORAGE_KEY);
  return states[domain] || STATES.OFF;
}

// Save state for a domain
async function saveState(domain, state) {
  const { [STORAGE_KEY]: states = {} } = await chrome.storage.local.get(STORAGE_KEY);
  states[domain] = state;
  await chrome.storage.local.set({ [STORAGE_KEY]: states });
}

// Update extension icon
function updateIcon(state) {
  const { color, label, title } = STATE_CONFIG[state];
  chrome.action.setIcon({ imageData: { 32: generateIcon(color, label) } });
  chrome.action.setTitle({ title });
}

// Apply state configuration (cookie, proxy, cache)
async function applyConfig(state, url) {
  const config = STATE_CONFIG[state];
  const domain = url ? extractDomain(url) : null;

  // Cookie
  if (domain) {
    if (config.cookie) {
      await chrome.cookies.set({
        url, domain,
        name: COOKIE_NAME,
        value: COOKIE_VALUE,
        path: '/',
        secure: true,
        sameSite: 'no_restriction',
        expirationDate: Math.floor(Date.now() / 1000) + 31536000
      });
    } else {
      await chrome.cookies.remove({ url, name: COOKIE_NAME }).catch(() => {});
    }
  }

  // Proxy
  if (config.proxy) {
    await chrome.proxy.settings.set({ value: { mode: config.proxy }, scope: 'regular' });
  } else {
    await chrome.proxy.settings.clear({ scope: 'regular' });
  }

  // Cache
  if (config.cache) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [CACHE_RULE_ID] });
  } else {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [CACHE_RULE_ID],
      addRules: [{
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
      }]
    });
  }
}

// Get active tab's state and update icon
async function updateIconForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = tab?.url ? extractDomain(tab.url) : null;
  const state = domain ? await getState(domain) : STATES.OFF;
  updateIcon(state);
}

// Handle state change from popup
async function setState(newState) {
  if (!STATE_CONFIG[newState]) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = tab?.url ? extractDomain(tab.url) : null;

  if (domain) {
    await saveState(domain, newState);
    await applyConfig(newState, tab.url);
    updateIcon(newState);
    chrome.tabs.reload(tab.id);
  }
}

// Message handler
chrome.runtime.onMessage.addListener((msg, _, respond) => {
  if (msg.action === 'setState') {
    setState(msg.state).then(() => respond({ success: true }));
    return true;
  }
  if (msg.action === 'getState') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      const domain = tab?.url ? extractDomain(tab.url) : null;
      respond({ state: domain ? await getState(domain) : STATES.OFF });
    });
    return true;
  }
});

// Apply config at multiple points to ensure it's set before request goes out

// 1. Before navigation starts (earliest possible)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const domain = extractDomain(details.url);
  if (!domain) return;

  const state = await getState(domain);
  await applyConfig(state, details.url);
});

// 2. When tab URL changes (catches new tabs)
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  const domain = extractDomain(changeInfo.url);
  if (!domain) return;

  const state = await getState(domain);
  await applyConfig(state, changeInfo.url);

  if (tab.active) updateIcon(state);
});

// 3. When navigation commits (ensures config is applied)
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const domain = extractDomain(details.url);
  if (!domain) return;

  const state = await getState(domain);
  await applyConfig(state, details.url);

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id === details.tabId) updateIcon(state);
});

// Update icon when switching tabs
chrome.tabs.onActivated.addListener(() => updateIconForActiveTab());

// Initialize
chrome.runtime.onInstalled.addListener(updateIconForActiveTab);
chrome.runtime.onStartup.addListener(updateIconForActiveTab);
updateIconForActiveTab();
