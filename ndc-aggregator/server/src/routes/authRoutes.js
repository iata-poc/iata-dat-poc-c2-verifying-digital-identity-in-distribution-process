import express from 'express';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { AppError } from '../appError.js';
import { vcStore } from '../stores/vcStore.js';

// In-memory session token store
const agencyTokens = new Map();

const TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

export const authRouter = express.Router();

/**
 * POST /auth/login
 * Validates agency credentials and returns a session token
 */
authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new AppError({ statusCode: 400, msg: 'Username and password are required' });
  }

  if (
    username !== config.agencyLogin.username ||
    password !== config.agencyLogin.password
  ) {
    throw new AppError({ statusCode: 401, msg: 'Wrong credentials' });
  }

  const token = randomUUID();
  agencyTokens.set(token, {
    username,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
  });

  console.log(`[Auth] Agency login successful for user: ${username}`);

  res.status(200).json({ token });
});

/**
 * Validate an agency session token
 * @param {string} token
 * @returns {object|null} Session data or null if invalid/expired
 */
export const validateAgencyToken = (token) => {
  if (!token) return null;

  const session = agencyTokens.get(token);
  if (!session) return null;

  if (new Date() > session.expiresAt) {
    agencyTokens.delete(token);
    return null;
  }

  return session;
};

/**
 * Middleware: require a valid agency token via X-Agency-Token header
 */
const requireAgencyToken = (req, _res, next) => {
  const token = req.headers['x-agency-token'];
  const session = validateAgencyToken(token);

  if (!session) {
    throw new AppError({ statusCode: 401, msg: 'Invalid or expired agency token' });
  }

  req.agencySession = session;
  next();
};

/**
 * POST /auth/vc
 * Upload and store the agency VCDM Verifiable Credential
 */
authRouter.post('/vc', requireAgencyToken, (req, res) => {
  const vc = req.body;

  if (!vc || !vc.type || !vc.credentialSubject) {
    throw new AppError({ statusCode: 400, msg: 'Invalid VC: must include type and credentialSubject' });
  }

  if (!vc.credentialSubject.iata_number) {
    throw new AppError({ statusCode: 400, msg: 'Invalid VC: credentialSubject must include iata_number' });
  }

  vcStore.storeVC(vc);

  console.log(`[Auth] Agency VC uploaded by ${req.agencySession.username}`);

  res.status(200).json({
    message: 'VC stored successfully',
    vc: vcStore.getVCInfo(),
  });
});

/**
 * GET /auth/vc
 * Get stored VC status/info
 */
authRouter.get('/vc', requireAgencyToken, (_req, res) => {
  const info = vcStore.getVCInfo();

  res.status(200).json({
    hasVC: vcStore.hasVC(),
    vc: info,
  });
});

/**
 * DELETE /auth/vc
 * Delete/revoke the stored agency VC
 */
authRouter.delete('/vc', requireAgencyToken, (req, res) => {
  const deleted = vcStore.deleteVC();

  console.log(`[Auth] Agency VC delete requested by ${req.agencySession.username}, existed: ${deleted}`);

  res.status(200).json({
    deleted,
    message: deleted ? 'VC deleted successfully' : 'No VC was stored',
  });
});
