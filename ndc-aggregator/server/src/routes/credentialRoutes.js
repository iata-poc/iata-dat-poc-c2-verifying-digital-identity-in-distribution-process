import express from 'express';
import { hopaeApi } from '../verifiers/hopaeClient.js';

const asyncHandler = (func) => (req, res, next) => {
  Promise.resolve(func(req, res, next)).catch(next);
};

export const credentialRouter = express.Router();

/**
 * GET /api/credentials/status
 * Checks whether the credential (listId/index) is currently revoked
 * Query: ?listId=1&index=5
 */
credentialRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const listId = req.query.listId || 1;
    const index = parseInt(req.query.index || 5, 10);

    console.log(`[Credentials] Status check: listId=${listId}, index=${index}`);
    const result = await hopaeApi.getCredentialStatus(listId);
    const isRevoked = Array.isArray(result.revoked) && result.revoked.includes(index);

    res.status(200).json({ revoked: isRevoked });
  })
);

/**
 * PUT /api/credentials/toggle
 * Toggles credential status on HOPAE StatusList
 * Body: { listId, index }
 */
credentialRouter.put(
  '/toggle',
  asyncHandler(async (req, res) => {
    const { listId = 1, index = 5 } = req.body;

    console.log(`[Credentials] Toggle request: listId=${listId}, index=${index}`);
    const result = await hopaeApi.toggleCredentialStatus(listId, index);

    res.status(200).json({ success: true, data: result });
  })
);
