import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * White-List Agent
 *
 * Provides on-chain access control with rivet delegation.
 * Integrates with epistery's whitelist functionality from Utils.
 */
export function createWhiteListAgent(epistery) {
  const router = express.Router();

  /**
   * Verify delegation token
   * Returns { valid: boolean, rivetAddress: string, domain: string }
   */
  async function verifyDelegationToken(req) {
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
      // For now, we'll validate structure
      if (!delegation.subject || !signature) {
        return { valid: false, error: 'Invalid token structure' };
      }

      // 4. Verify domain is in delegated Merkle tree (on-chain)
      // TODO: Call smart contract to verify Merkle proof
      // const isValidDelegation = await verifyMerkleProof(
      //   delegation.subject,
      //   delegation.audience,
      //   token.merkleProof
      // );

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
   * GET /check
   * Check if current rivet is whitelisted
   */
  router.get('/check', async (req, res) => {
    try {
      // Verify delegation token
      const verification = await verifyDelegationToken(req);

      if (!verification.valid) {
        return res.status(401).json({
          allowed: false,
          error: verification.error
        });
      }

      // Check if rivet is whitelisted using epistery's whitelist functionality
      const isWhitelisted = await epistery.isWhitelisted(verification.rivetAddress);

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

  /**
   * GET /list
   * Get all whitelisted addresses (admin only)
   */
  router.get('/list', async (req, res) => {
    try {
      // Verify delegation token
      const verification = await verifyDelegationToken(req);

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

      // Get whitelist using epistery's getWhitelist functionality
      const whitelist = await epistery.getWhitelist();

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

  /**
   * POST /delegate
   * Create delegation token for a domain
   *
   * This endpoint is called by epistery.mydomain.com after user approval
   */
  router.post('/delegate', async (req, res) => {
    try {
      const { domain, scope, durationDays = 30 } = req.body;

      if (!domain) {
        return res.status(400).json({
          error: 'Domain is required'
        });
      }

      // Get rivet address from authenticated session
      // TODO: Get from epistery session/auth
      const rivetAddress = req.session?.rivetAddress || req.body.rivetAddress;

      if (!rivetAddress) {
        return res.status(401).json({
          error: 'Not authenticated - rivet address required'
        });
      }

      // Create delegation object
      const delegation = {
        issuer: req.hostname, // epistery.mydomain.com
        subject: rivetAddress,
        audience: domain,
        scope: scope || ['whitelist:read'],
        expires: Date.now() + (durationDays * 24 * 60 * 60 * 1000),
        nonce: crypto.randomUUID(),
        createdAt: Date.now()
      };

      // TODO: Sign with rivet private key
      // For now, create placeholder signature
      const delegationString = JSON.stringify(delegation);
      const signature = crypto.createHash('sha256')
        .update(delegationString)
        .digest('hex');

      // TODO: Update Merkle tree on-chain
      // const merkleProof = await updateDelegationTree(rivetAddress, domain);

      const token = {
        delegation,
        signature,
        // merkleProof: merkleProof
      };

      res.json(token);
    } catch (error) {
      console.error('[white-list] Delegation error:', error);
      res.status(500).json({
        error: error.message
      });
    }
  });

  /**
   * GET /status
   * Get agent status and configuration
   */
  router.get('/status', async (req, res) => {
    try {
      const whitelist = await epistery.getWhitelist();

      res.json({
        agent: 'white-list',
        version: '0.1.0',
        whitelistCount: whitelist.length,
        delegationSupported: true,
        merkleTreeEnabled: false // TODO: Enable when contract is deployed
      });
    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  });

  return router;
}

// Export for use as epistery agent
export default createWhiteListAgent;
