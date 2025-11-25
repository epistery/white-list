# Epistery White-List Agent

On-chain access control for websites using Ethereum addresses and rivet delegation.

## Overview

The white-list agent allows publishers to restrict access to their sites based on an on-chain list of approved Ethereum addresses. It uses **delegated signing** to work seamlessly across subdomains without exposing private keys.

**Key Innovation:** Your rivet wallet (with non-extractable private key) stays locked to `epistery.yourdomain.com`, but sister domains like `yourdomain.com` can authenticate using cryptographically signed delegation tokens. No passwords, no tracking, just cryptographic proofs.

## Architecture

```
Publisher's Site (mydomain.com)
    ↓ loads client.js
    ↓ checks for delegation token
    ↓ (if none) redirects to →

Epistery Subdomain (epistery.mydomain.com)
    ↓ rivet wallet lives here (non-extractable key)
    ↓ user approves delegation
    ↓ creates signed delegation token
    ↓ updates Merkle tree on-chain
    ↓ sets cookie for .mydomain.com
    ↓ redirects back →

Publisher's Site (mydomain.com)
    ↓ has delegation token
    ↓ calls white-list agent API
    ↓ agent verifies:
        - Token signature (signed by rivet)
        - Domain in Merkle tree (on-chain)
        - Rivet in whitelist (on-chain)
    ↓ grants or denies access
```

## Publisher Integration

### Pattern 1: Ad-Supported Site (Passive Mode)

**Use case:** Free content with ads, no login required, delegation only when accessing premium features.

```html
<!-- In your site's <head> -->
<script src="https://epistery.yourdomain.com/agent/white-list/client.js"></script>

<!-- Page loads normally, no prompts -->
```

```javascript
// Optional: Add "Sign In" button for premium content
document.getElementById('premium-article-btn').onclick = async () => {
  // This triggers delegation if needed
  await window.episteryWhiteList.requestDelegation();
};

// Listen for delegation events
window.addEventListener('epistery:passive-mode', (e) => {
  console.log('Running in passive mode - no identity delegation');
  // Show ads, free content
});

window.addEventListener('epistery:access-granted', (e) => {
  console.log('Access granted:', e.detail.address);
  // Show premium content
  document.querySelector('.premium-content').style.display = 'block';
});
```

### Pattern 2: Members-Only Site (Required Mode)

**Use case:** Private site, all content requires whitelist membership.

```html
<!-- In your site's <head> -->
<meta name="epistery-access" content="required">
<script src="https://epistery.yourdomain.com/agent/white-list/client.js"></script>
```

That's it! The client will:
- Check for existing delegation token
- Redirect to epistery subdomain if needed for approval
- Automatically verify whitelist membership
- Show access denied page if not whitelisted
- Block page load until access is verified

## Features

- ✅ **Non-extractable keys** - Rivet stays locked to epistery subdomain
- ✅ **Delegated signing** - Sister domains get scoped tokens
- ✅ **On-chain verification** - Merkle tree in smart contract
- ✅ **User consent** - Explicit approval dialog
- ✅ **Revocable** - Publisher can remove domains anytime
- ✅ **Time-limited** - Tokens expire and renew silently
- ✅ **TPM compatible** - Works with hardware-backed keys

## API

### `GET /agent/white-list/check`

Check if current rivet is whitelisted.

**Headers:**
- `X-Epistery-Delegation`: Delegation token (JSON)

**Response:**
```json
{
  "allowed": true,
  "address": "0x742d35Cc6...",
  "expires": "2024-12-01T00:00:00Z"
}
```

### `GET /agent/white-list/list` (Admin only)

Get all whitelisted addresses.

**Response:**
```json
{
  "whitelist": ["0x742d35...", "0x8f3ba2..."],
  "count": 2
}
```

### `POST /agent/white-list/delegate`

Create delegation token for a domain.

**Body:**
```json
{
  "domain": "mydomain.com",
  "scope": ["whitelist:read"],
  "durationDays": 30
}
```

**Response:**
```json
{
  "delegation": {
    "issuer": "epistery.mydomain.com",
    "subject": "0x742d35Cc6...",
    "audience": "mydomain.com",
    "scope": ["whitelist:read"],
    "expires": 1733097600000,
    "nonce": "550e8400-..."
  },
  "signature": "0x3045022100...",
  "merkleProof": ["0xabcd...", "0xef01..."]
}
```

## Installation (Agent Host)

To install the white-list agent on an epistery-host server:

```bash
# Clone the repository
cd ~/.epistery/.agents
git clone https://github.com/epistery/white-list.git

# Install dependencies
cd white-list
npm install

# Restart epistery-host to load the agent
# Agent will be auto-discovered and mounted at /agent/epistery/white-list/*
```

The agent will be automatically discovered by the AgentManager and mounted at:
- `/.well-known/epistery/agent/epistery/white-list/*`
- `/agent/epistery/white-list/*`

## Development

```bash
# Install dependencies
npm install

# Run agent locally (requires epistery-host)
# The agent is loaded by epistery-host's AgentManager

# Run tests
npm test
```

## Security Model

1. **Non-extractable Keys**: Rivet private keys are created with `extractable: false` in Web Crypto API, locked to the epistery subdomain origin
2. **Delegated Signing**: Sister domains receive signed tokens, not keys
3. **Scoped Permissions**: Tokens specify exact permissions (e.g., `whitelist:read`)
4. **Time-Limited**: Delegation tokens expire (default: 30 days)
5. **On-Chain Verification**: Merkle tree of delegated domains stored in smart contract
6. **Revocable**: Users can revoke delegation at any time

## Repository

- GitHub: [github.com/epistery/white-list](https://github.com/epistery/white-list)
- Issues: [github.com/epistery/white-list/issues](https://github.com/epistery/white-list/issues)

## License

MIT
