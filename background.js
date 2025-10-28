/**
 * Background Service Worker
 * Handles extension lifecycle, persistent operations, and camera authentication
 * CRITICAL: Authentication must happen here to prevent browser login popups
 */

// ============================================================================
// MD5 Implementation for Digest Authentication
// ============================================================================

function md5(string) {
  function rotateLeft(value, shift) {
    return (value << shift) | (value >>> (32 - shift));
  }

  function addUnsigned(x, y) {
    const lsw = (x & 0xFFFF) + (y & 0xFFFF);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF);
  }

  function md5cmn(q, a, b, x, s, t) {
    return addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, q), addUnsigned(x, t)), s), b);
  }

  function md5ff(a, b, c, d, x, s, t) {
    return md5cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }

  function md5gg(a, b, c, d, x, s, t) {
    return md5cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }

  function md5hh(a, b, c, d, x, s, t) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function md5ii(a, b, c, d, x, s, t) {
    return md5cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

  function convertToWordArray(string) {
    const wordArray = [];
    for (let i = 0; i < string.length * 8; i += 8) {
      wordArray[i >> 5] |= (string.charCodeAt(i / 8) & 0xFF) << (i % 32);
    }
    return wordArray;
  }

  function wordToHex(value) {
    let hex = '';
    for (let i = 0; i < 4; i++) {
      const byte = (value >>> (i * 8)) & 0xFF;
      hex += ('0' + byte.toString(16)).slice(-2);
    }
    return hex;
  }

  function utf8Encode(string) {
    return unescape(encodeURIComponent(string));
  }

  const x = convertToWordArray(utf8Encode(string));
  let a = 0x67452301;
  let b = 0xEFCDAB89;
  let c = 0x98BADCFE;
  let d = 0x10325476;

  const stringLength = string.length;
  x[stringLength >> 5] |= 0x80 << ((stringLength) % 32);
  x[(((stringLength + 64) >>> 9) << 4) + 14] = stringLength * 8;

  for (let i = 0; i < x.length; i += 16) {
    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;

    a = md5ff(a, b, c, d, x[i + 0], 7, 0xD76AA478);
    d = md5ff(d, a, b, c, x[i + 1], 12, 0xE8C7B756);
    c = md5ff(c, d, a, b, x[i + 2], 17, 0x242070DB);
    b = md5ff(b, c, d, a, x[i + 3], 22, 0xC1BDCEEE);
    a = md5ff(a, b, c, d, x[i + 4], 7, 0xF57C0FAF);
    d = md5ff(d, a, b, c, x[i + 5], 12, 0x4787C62A);
    c = md5ff(c, d, a, b, x[i + 6], 17, 0xA8304613);
    b = md5ff(b, c, d, a, x[i + 7], 22, 0xFD469501);
    a = md5ff(a, b, c, d, x[i + 8], 7, 0x698098D8);
    d = md5ff(d, a, b, c, x[i + 9], 12, 0x8B44F7AF);
    c = md5ff(c, d, a, b, x[i + 10], 17, 0xFFFF5BB1);
    b = md5ff(b, c, d, a, x[i + 11], 22, 0x895CD7BE);
    a = md5ff(a, b, c, d, x[i + 12], 7, 0x6B901122);
    d = md5ff(d, a, b, c, x[i + 13], 12, 0xFD987193);
    c = md5ff(c, d, a, b, x[i + 14], 17, 0xA679438E);
    b = md5ff(b, c, d, a, x[i + 15], 22, 0x49B40821);

    a = md5gg(a, b, c, d, x[i + 1], 5, 0xF61E2562);
    d = md5gg(d, a, b, c, x[i + 6], 9, 0xC040B340);
    c = md5gg(c, d, a, b, x[i + 11], 14, 0x265E5A51);
    b = md5gg(b, c, d, a, x[i + 0], 20, 0xE9B6C7AA);
    a = md5gg(a, b, c, d, x[i + 5], 5, 0xD62F105D);
    d = md5gg(d, a, b, c, x[i + 10], 9, 0x02441453);
    c = md5gg(c, d, a, b, x[i + 15], 14, 0xD8A1E681);
    b = md5gg(b, c, d, a, x[i + 4], 20, 0xE7D3FBC8);
    a = md5gg(a, b, c, d, x[i + 9], 5, 0x21E1CDE6);
    d = md5gg(d, a, b, c, x[i + 14], 9, 0xC33707D6);
    c = md5gg(c, d, a, b, x[i + 3], 14, 0xF4D50D87);
    b = md5gg(b, c, d, a, x[i + 8], 20, 0x455A14ED);
    a = md5gg(a, b, c, d, x[i + 13], 5, 0xA9E3E905);
    d = md5gg(d, a, b, c, x[i + 2], 9, 0xFCEFA3F8);
    c = md5gg(c, d, a, b, x[i + 7], 14, 0x676F02D9);
    b = md5gg(b, c, d, a, x[i + 12], 20, 0x8D2A4C8A);

    a = md5hh(a, b, c, d, x[i + 5], 4, 0xFFFA3942);
    d = md5hh(d, a, b, c, x[i + 8], 11, 0x8771F681);
    c = md5hh(c, d, a, b, x[i + 11], 16, 0x6D9D6122);
    b = md5hh(b, c, d, a, x[i + 14], 23, 0xFDE5380C);
    a = md5hh(a, b, c, d, x[i + 1], 4, 0xA4BEEA44);
    d = md5hh(d, a, b, c, x[i + 4], 11, 0x4BDECFA9);
    c = md5hh(c, d, a, b, x[i + 7], 16, 0xF6BB4B60);
    b = md5hh(b, c, d, a, x[i + 10], 23, 0xBEBFBC70);
    a = md5hh(a, b, c, d, x[i + 13], 4, 0x289B7EC6);
    d = md5hh(d, a, b, c, x[i + 0], 11, 0xEAA127FA);
    c = md5hh(c, d, a, b, x[i + 3], 16, 0xD4EF3085);
    b = md5hh(b, c, d, a, x[i + 6], 23, 0x04881D05);
    a = md5hh(a, b, c, d, x[i + 9], 4, 0xD9D4D039);
    d = md5hh(d, a, b, c, x[i + 12], 11, 0xE6DB99E5);
    c = md5hh(c, d, a, b, x[i + 15], 16, 0x1FA27CF8);
    b = md5hh(b, c, d, a, x[i + 2], 23, 0xC4AC5665);

    a = md5ii(a, b, c, d, x[i + 0], 6, 0xF4292244);
    d = md5ii(d, a, b, c, x[i + 7], 10, 0x432AFF97);
    c = md5ii(c, d, a, b, x[i + 14], 15, 0xAB9423A7);
    b = md5ii(b, c, d, a, x[i + 5], 21, 0xFC93A039);
    a = md5ii(a, b, c, d, x[i + 12], 6, 0x655B59C3);
    d = md5ii(d, a, b, c, x[i + 3], 10, 0x8F0CCC92);
    c = md5ii(c, d, a, b, x[i + 10], 15, 0xFFEFF47D);
    b = md5ii(b, c, d, a, x[i + 1], 21, 0x85845DD1);
    a = md5ii(a, b, c, d, x[i + 8], 6, 0x6FA87E4F);
    d = md5ii(d, a, b, c, x[i + 15], 10, 0xFE2CE6E0);
    c = md5ii(c, d, a, b, x[i + 6], 15, 0xA3014314);
    b = md5ii(b, c, d, a, x[i + 13], 21, 0x4E0811A1);
    a = md5ii(a, b, c, d, x[i + 4], 6, 0xF7537E82);
    d = md5ii(d, a, b, c, x[i + 11], 10, 0xBD3AF235);
    c = md5ii(c, d, a, b, x[i + 2], 15, 0x2AD7D2BB);
    b = md5ii(b, c, d, a, x[i + 9], 21, 0xEB86D391);

    a = addUnsigned(a, oldA);
    b = addUnsigned(b, oldB);
    c = addUnsigned(c, oldC);
    d = addUnsigned(d, oldD);
  }

  return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
}

// ============================================================================
// Camera Authentication (Prevents Browser Popup)
// ============================================================================

/**
 * Main authentication handler - tries Basic first, then Digest
 */
async function handleAxisAuthRequest({ url, username, password, body }) {
  console.log('🔐 [Background] Attempting Basic auth first...');

  // Try Basic Auth first
  const basicAuthHeader = `Basic ${btoa(username + ':' + password)}`;

  let response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': basicAuthHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  // Success with Basic auth
  if (response.ok) {
    console.log('✅ [Background] Basic auth succeeded');
    return response.json();
  }

  // If 401, try Digest auth
  if (response.status === 401) {
    const wwwAuthenticateHeader = response.headers.get('WWW-Authenticate');

    if (wwwAuthenticateHeader && wwwAuthenticateHeader.toLowerCase().startsWith('digest')) {
      console.log('🔐 [Background] Basic auth failed (401), trying Digest auth...');
      return await performDigestAuth(url, username, password, body, wwwAuthenticateHeader);
    }

    throw new Error('Authentication failed: Invalid credentials');
  }

  throw new Error(`HTTP error! status: ${response.status}`);
}

/**
 * Digest Authentication Implementation (RFC 2617)
 */
async function performDigestAuth(url, username, password, body, wwwAuthHeader) {
  console.log('🔐 [Background] Parsing Digest challenge...');

  // 1. Parse the WWW-Authenticate header
  const digestParams = {};
  wwwAuthHeader.replace(/(\w+)=["']?([^"',]+)["']?/g, (match, key, value) => {
    digestParams[key] = value;
    return '';
  });

  const { realm, qop, nonce, opaque } = digestParams;

  if (!nonce || !realm) {
    throw new Error('Invalid Digest authentication challenge - missing nonce or realm');
  }

  console.log('🔐 [Background] Digest params:', { realm, qop: qop || 'none', nonce: nonce.substring(0, 16) + '...' });

  // 2. Generate client-side values
  const cnonce = Math.random().toString(36).substring(2, 18);
  const nc = '00000001';
  const method = 'POST';
  const uri = new URL(url).pathname;

  // 3. Calculate hashes
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);

  let responseHash;
  let digestAuthHeader;

  if (qop) {
    // RFC 2617 - with qop
    responseHash = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    digestAuthHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${responseHash}"${opaque ? `, opaque="${opaque}"` : ''}`;
  } else {
    // RFC 2069 - without qop (legacy)
    responseHash = md5(`${ha1}:${nonce}:${ha2}`);
    digestAuthHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${responseHash}"${opaque ? `, opaque="${opaque}"` : ''}`;
  }

  console.log('🔐 [Background] Sending Digest auth request...');

  // 4. Retry the request with Digest auth
  const finalResponse = await fetch(url, {
    method: method,
    headers: {
      'Authorization': digestAuthHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!finalResponse.ok) {
    throw new Error(`Digest authentication failed! status: ${finalResponse.status}`);
  }

  console.log('✅ [Background] Digest auth succeeded');
  return finalResponse.json();
}

// ============================================================================
// Extension Lifecycle
// ============================================================================

// Extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Anava Camera Extension installed');

    // Set default settings
    chrome.storage.local.set({
      settings: {
        autoSaveCredentials: false,
        filterUnsupported: true,
        defaultNetwork: ''
      }
    });

    // Open welcome page
    chrome.tabs.create({
      url: 'popup.html'
    });
  } else if (details.reason === 'update') {
    console.log('Anava Camera Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  switch (message.type) {
    case 'PING':
      // Keep-alive ping to wake up service worker
      console.log('🏓 [Background] PING received, worker is awake');
      sendResponse({ pong: true });
      return true;

    case 'AXIS_AUTH_REQUEST':
      console.log('🔧 [Background] Received auth request:', message.payload?.url);
      // Handle authentication request
      handleAxisAuthRequest(message.payload)
        .then(result => {
          console.log('✅ [Background] Auth successful');
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          console.error('❌ [Background] Auth failed:', error.message);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response

    case 'scan-network':
      // Forward to appropriate handler
      handleNetworkScan(message.data)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true; // Keep channel open for async response

    case 'deploy-acap':
      handleAcapDeployment(message.data)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

/**
 * Handle network scan request
 */
async function handleNetworkScan(data) {
  const { networkRange, username, password, intensity } = data;

  // This would coordinate with the discovery service
  // For now, just acknowledge
  return {
    success: true,
    message: 'Network scan initiated'
  };
}

/**
 * Handle ACAP deployment request
 */
async function handleAcapDeployment(data) {
  const { cameras, acapFile, licenseKey } = data;

  // This would coordinate with the deployment service
  // For now, just acknowledge
  return {
    success: true,
    message: 'ACAP deployment initiated'
  };
}

// Keep service worker alive (optional, for long-running operations)
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Do nothing, just prevents service worker from sleeping
    console.log('Service worker keepalive');
  }
});
