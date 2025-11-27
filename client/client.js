/**
 * Epistery White-List Agent - Client Script
 *
 * This script is loaded by publisher sites to enforce access control.
 * It checks for delegation tokens and verifies whitelist status.
 *
 * Usage:
 *   <script src="https://epistery.yourdomain.com/agent/white-list/client.js"></script>
 */

(function() {
  'use strict';

  const EPISTERY_SUBDOMAIN = getEpisterySubdomain();
  const DELEGATION_COOKIE_NAME = 'epistery_delegation';
  const ACCESS_DENIED_HTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Access Denied</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 3rem;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          text-align: center;
        }
        h1 {
          color: #2d3748;
          margin: 0 0 1rem 0;
          font-size: 2rem;
        }
        p {
          color: #4a5568;
          line-height: 1.6;
          margin: 0 0 2rem 0;
        }
        .icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }
        .address {
          background: #f7fafc;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-family: monospace;
          font-size: 0.875rem;
          margin: 1rem 0;
          word-break: break-all;
        }
        .button {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 0.75rem 2rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.2s;
        }
        .button:hover {
          background: #5a67d8;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">🔒</div>
        <h1>Access Denied</h1>
        <p>Your wallet address is not authorized to access this site.</p>
        <div class="address" id="currentAddress">Loading...</div>
        <p>If you believe this is an error, please contact the site administrator.</p>
        <a href="https://${EPISTERY_SUBDOMAIN}/status" class="button">View Epistery Status</a>
      </div>
      <script>
        // Display current rivet address if available
        const urlParams = new URLSearchParams(window.location.search);
        const address = urlParams.get('address');
        if (address) {
          document.getElementById('currentAddress').textContent = address;
        }
      </script>
    </body>
    </html>
  `;

  /**
   * Get epistery subdomain from current hostname
   * e.g., mydomain.com → epistery.mydomain.com
   * For localhost, use the host running epistery-host
   */
  function getEpisterySubdomain() {
    const hostname = window.location.hostname;

    // For localhost development, use the epistery-host directly
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Extract port from the script src that loaded this file
      const scripts = document.getElementsByTagName('script');
      for (let script of scripts) {
        if (script.src && script.src.includes('/agent/epistery/white-list/client.js')) {
          const url = new URL(script.src);
          return url.host; // e.g., 'localhost:4080'
        }
      }
      // Fallback to default epistery-host port
      return 'localhost:4080';
    }

    // If already on epistery subdomain, return as-is
    if (hostname.startsWith('epistery.')) {
      return hostname;
    }

    // Add epistery subdomain
    return 'epistery.' + hostname;
  }

  /**
   * Get delegation token from cookie or localStorage
   */
  function getDelegationToken() {
    // Try cookie first (set by epistery subdomain)
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === DELEGATION_COOKIE_NAME) {
        try {
          return JSON.parse(decodeURIComponent(value));
        } catch (e) {
          console.error('[white-list] Invalid delegation cookie:', e);
        }
      }
    }

    // Fallback to localStorage (same-origin only)
    try {
      const stored = localStorage.getItem(DELEGATION_COOKIE_NAME);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if delegation token is valid and not expired
   */
  function isTokenValid(token) {
    if (!token || !token.delegation) {
      return false;
    }

    // Check expiration
    if (Date.now() > token.delegation.expires) {
      return false;
    }

    // Check audience matches current domain
    if (token.delegation.audience !== window.location.hostname) {
      return false;
    }

    return true;
  }

  /**
   * Redirect to epistery subdomain for delegation approval
   */
  function requestDelegation() {
    const returnUrl = encodeURIComponent(window.location.href);
    const scope = encodeURIComponent(JSON.stringify(['whitelist:read']));
    const domain = encodeURIComponent(window.location.hostname);

    // Use http for localhost, https for production
    const protocol = EPISTERY_SUBDOMAIN.includes('localhost') ? 'http' : 'https';

    const delegationUrl =
      `${protocol}://${EPISTERY_SUBDOMAIN}/delegate?` +
      `return=${returnUrl}&` +
      `scope=${scope}&` +
      `domain=${domain}`;

    console.log('[white-list] Redirecting to epistery for delegation:', delegationUrl);
    window.location.href = delegationUrl;
  }

  /**
   * Check whitelist access with delegation token
   */
  async function checkAccess(token) {
    try {
      // Use http for localhost, https for production
      const protocol = EPISTERY_SUBDOMAIN.includes('localhost') ? 'http' : 'https';

      const response = await fetch(
        `${protocol}://${EPISTERY_SUBDOMAIN}/agent/epistery/white-list/check`,
        {
          method: 'GET',
          headers: {
            'X-Epistery-Delegation': JSON.stringify(token)
          },
          credentials: 'include'
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('[white-list] Access check failed:', error);
      return {
        allowed: false,
        error: error.message
      };
    }
  }

  /**
   * Show access denied page
   */
  function showAccessDenied(address) {
    // Replace entire page with access denied message
    document.open();
    document.write(ACCESS_DENIED_HTML);
    document.close();

    // Update address in URL for display
    if (address) {
      const url = new URL(window.location.href);
      url.searchParams.set('address', address);
      window.history.replaceState({}, '', url);
    }
  }

  /**
   * Check if site requires access control
   * Reads from meta tag: <meta name="epistery-access" content="required|optional">
   */
  function isAccessControlRequired() {
    const meta = document.querySelector('meta[name="epistery-access"]');
    const mode = meta ? meta.getAttribute('content') : 'optional';
    return mode === 'required';
  }

  /**
   * Lazy check - only verify if token exists
   * Don't request delegation unless required
   */
  async function lazyCheck() {
    const token = getDelegationToken();

    if (!isTokenValid(token)) {
      // No valid token, but that's OK for optional access
      console.log('[white-list] No delegation token - running in passive mode');

      window.episteryAccess = {
        allowed: false,
        mode: 'passive',
        message: 'No identity delegation. Access may be restricted.'
      };

      window.dispatchEvent(new CustomEvent('epistery:passive-mode', {
        detail: window.episteryAccess
      }));

      return false;
    }

    // Have token, check access
    const result = await checkAccess(token);

    window.episteryAccess = {
      allowed: result.allowed,
      address: result.address,
      domain: result.domain,
      mode: 'delegated'
    };

    if (result.allowed) {
      console.log('[white-list] Access granted for:', result.address);
      window.dispatchEvent(new CustomEvent('epistery:access-granted', {
        detail: window.episteryAccess
      }));
    } else {
      console.log('[white-list] Access denied:', result.error || 'Not whitelisted');
      window.dispatchEvent(new CustomEvent('epistery:access-denied', {
        detail: window.episteryAccess
      }));
    }

    return result.allowed;
  }

  /**
   * Main initialization
   */
  async function init() {
    console.log('[white-list] Initializing access control...');

    const required = isAccessControlRequired();

    if (!required) {
      // Optional mode - don't block page load
      // Just check passively and let page decide what to do
      await lazyCheck();
      return;
    }

    // Required mode - enforce access control
    console.log('[white-list] Access control REQUIRED for this page');

    const token = getDelegationToken();

    if (!isTokenValid(token)) {
      console.log('[white-list] No valid delegation token - requesting...');
      requestDelegation();
      return;
    }

    console.log('[white-list] Valid delegation token found - checking access...');

    const result = await checkAccess(token);

    if (!result.allowed) {
      console.log('[white-list] Access denied:', result.error || 'Not whitelisted');
      showAccessDenied(result.address || token.delegation.subject);
      return;
    }

    console.log('[white-list] Access granted for:', result.address);

    window.episteryAccess = {
      allowed: true,
      address: result.address,
      domain: result.domain,
      mode: 'required'
    };

    window.dispatchEvent(new CustomEvent('epistery:access-granted', {
      detail: window.episteryAccess
    }));
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export public API
  window.episteryWhiteList = {
    // Passive check - doesn't request delegation
    check: lazyCheck,

    // Force delegation request (for "Sign In" buttons)
    requestDelegation: requestDelegation,

    // Get current status without making requests
    getStatus: () => window.episteryAccess,

    // Low-level API
    checkAccess: checkAccess,
    getDelegationToken: getDelegationToken,
    isTokenValid: isTokenValid,

    version: '0.1.0'
  };

})();
