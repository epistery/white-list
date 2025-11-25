import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * White-List Agent
 *
 * Provides on-chain access control with rivet delegation.
 * This is the main entry point loaded by AgentManager.
 */
export default class WhiteListAgent {
  constructor(config = {}) {
    this.config = config;
    this.epistery = null;
  }

  /**
   * Attach the agent to an Express router
   * Called by AgentManager after instantiation
   *
   * @param {express.Router} router - Express router instance
   */
  attach(router) {
    // Store epistery instance from app.locals if available
    router.use((req, res, next) => {
      if (!this.epistery && req.app.locals.epistery) {
        this.epistery = req.app.locals.epistery;
      }
      next();
    });

    // Serve icon
    router.get('/icon.svg', (req, res) => {
      const iconPath = path.join(__dirname, 'icon.svg');
      if (!existsSync(iconPath)) {
        return res.status(404).send('Icon not found');
      }
      res.set('Content-Type', 'image/svg+xml');
      res.sendFile(iconPath);
    });

    // Serve widget (for agent box)
    router.get('/widget', (req, res) => {
      const widgetPath = path.join(__dirname, 'client/widget.html');
      if (!existsSync(widgetPath)) {
        return res.status(404).send('Widget not found');
      }
      res.sendFile(widgetPath);
    });

    // Serve admin page
    router.get('/admin', (req, res) => {
      const adminPath = path.join(__dirname, 'client/admin.html');
      if (!existsSync(adminPath)) {
        return res.status(404).send('Admin page not found');
      }
      res.sendFile(adminPath);
    });

    // Serve client.js for publishers
    router.get('/client.js', (req, res) => {
      const clientPath = path.join(__dirname, 'client/client.js');
      if (!existsSync(clientPath)) {
        return res.status(404).send('Client script not found');
      }
      res.set('Content-Type', 'text/javascript');
      res.sendFile(clientPath);
    });

    // Check endpoint - verify whitelist with delegation token
    router.get('/check', async (req, res) => {
      try {
        const verification = await this.verifyDelegationToken(req);

        if (!verification.valid) {
          return res.status(401).json({
            allowed: false,
            error: verification.error
          });
        }

        // Check if rivet is whitelisted using epistery's whitelist functionality
        if (!this.epistery) {
          return res.status(500).json({
            allowed: false,
            error: 'Epistery not initialized'
          });
        }

        const isWhitelisted = await this.epistery.isWhitelisted(verification.rivetAddress);

        res.json({
          allowed: isWhitelisted,
          address: verification.rivetAddress,
          domain: verification.domain
        });
      } catch (error) {
        console.error('[white-list] Check error:', error);
        res.status(500).json({
          allowed: false,
          error: error.message
        });
      }
    });

    // List endpoint - get all whitelisted addresses (admin only)
    router.get('/list', async (req, res) => {
      try {
        const verification = await this.verifyDelegationToken(req);

        if (!verification.valid) {
          return res.status(401).json({
            error: verification.error
          });
        }

        // Check if user has admin scope
        if (!verification.scope?.includes('whitelist:admin')) {
          return res.status(403).json({
            error: 'Insufficient permissions - requires whitelist:admin scope'
          });
        }

        if (!this.epistery) {
          return res.status(500).json({
            error: 'Epistery not initialized'
          });
        }

        const whitelist = await this.epistery.getWhitelist();

        res.json({
          whitelist: whitelist,
          count: whitelist.length
        });
      } catch (error) {
        console.error('[white-list] List error:', error);
        res.status(500).json({
          error: error.message
        });
      }
    });

    // Add member endpoint (admin only)
    router.post('/add', async (req, res) => {
      try {
        const verification = await this.verifyDelegationToken(req);

        if (!verification.valid) {
          return res.status(401).json({
            success: false,
            error: verification.error
          });
        }

        // Check if user has admin scope
        if (!verification.scope?.includes('whitelist:admin')) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions - requires whitelist:admin scope'
          });
        }

        const { address } = req.body;

        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid Ethereum address'
          });
        }

        if (!this.epistery) {
          return res.status(500).json({
            success: false,
            error: 'Epistery not initialized'
          });
        }

        await this.epistery.addToWhitelist(address);

        res.json({
          success: true,
          address: address
        });
      } catch (error) {
        console.error('[white-list] Add error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Remove member endpoint (admin only)
    router.post('/remove', async (req, res) => {
      try {
        const verification = await this.verifyDelegationToken(req);

        if (!verification.valid) {
          return res.status(401).json({
            success: false,
            error: verification.error
          });
        }

        // Check if user has admin scope
        if (!verification.scope?.includes('whitelist:admin')) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions - requires whitelist:admin scope'
          });
        }

        const { address } = req.body;

        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid Ethereum address'
          });
        }

        if (!this.epistery) {
          return res.status(500).json({
            success: false,
            error: 'Epistery not initialized'
          });
        }

        await this.epistery.removeFromWhitelist(address);

        res.json({
          success: true,
          address: address
        });
      } catch (error) {
        console.error('[white-list] Remove error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Status endpoint
    router.get('/status', async (req, res) => {
      try {
        let whitelistCount = 0;

        if (this.epistery) {
          try {
            const whitelist = await this.epistery.getWhitelist();
            whitelistCount = whitelist.length;
          } catch (e) {
            // Ignore errors for status check
          }
        }

        res.json({
          agent: 'white-list',
          version: '0.1.0',
          whitelistCount: whitelistCount,
          delegationSupported: true,
          merkleTreeEnabled: false, // TODO: Enable when contract is deployed
          config: this.config
        });
      } catch (error) {
        res.status(500).json({
          error: error.message
        });
      }
    });

    console.log('[white-list] Agent routes attached');
  }

  /**
   * Verify delegation token from request
   * @param {express.Request} req
   * @returns {Promise<Object>} Verification result
   */
  async verifyDelegationToken(req) {
    const delegationHeader = req.headers['x-epistery-delegation'];
    const delegationCookie = req.cookies?.epistery_delegation;

    const tokenData = delegationHeader || delegationCookie;

    if (!tokenData) {
      return { valid: false, error: 'No delegation token provided' };
    }

    try {
      const token = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
      const { delegation, signature } = token;

      // 1. Check expiration
      if (Date.now() > delegation.expires) {
        return { valid: false, error: 'Token expired' };
      }

      // 2. Verify domain matches request origin
      const requestDomain = req.hostname || req.get('host')?.split(':')[0];
      if (delegation.audience !== requestDomain) {
        return { valid: false, error: 'Token audience mismatch' };
      }

      // 3. Verify signature
      // TODO: Implement actual signature verification with rivet public key
      if (!delegation.subject || !signature) {
        return { valid: false, error: 'Invalid token structure' };
      }

      // 4. Verify domain is in delegated Merkle tree (on-chain)
      // TODO: Call smart contract to verify Merkle proof

      return {
        valid: true,
        rivetAddress: delegation.subject,
        domain: delegation.audience,
        scope: delegation.scope
      };
    } catch (error) {
      return { valid: false, error: `Token verification failed: ${error.message}` };
    }
  }

  /**
   * Cleanup on shutdown (optional)
   */
  async cleanup() {
    console.log('[white-list] Agent cleanup');
  }
}
