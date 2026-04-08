import { sessionStore } from '../sessionStore.js';
import { constants } from '../constants.js';
import { AppError } from '../appError.js';
import { validateAgencyToken } from '../routes/authRoutes.js';
import { generateVpDataFromStoredVC } from '../services/vpGenerationService.js';

/**
 * Verify session is valid and not expired
 */
const isSessionValid = (session) => {
  return (
    session &&
    session.state === constants.sessionStates.VERIFIED &&
    session.expiresAt > new Date()
  );
};

/**
 * Stateful authentication using X-Verification-Id header
 * Validates session exists, is verified, and not expired
 * Attaches session and agent profile to req.session
 */
export const verificationIdAuthenticator = (req, _res, next) => {
  const verificationId = req.headers['x-verification-id'];

  if (!verificationId) {
    throw new AppError({
      statusCode: 401,
      msg: 'Missing X-Verification-Id header',
    });
  }

  const session = sessionStore.getSessionWithProfile(verificationId);

  if (!session) {
    throw new AppError({
      statusCode: 401,
      msg: 'Invalid verification ID',
    });
  }

  if (!isSessionValid(session)) {
    throw new AppError({
      statusCode: 401,
      msg: 'Session is not verified or has expired',
    });
  }

  // Attach session to request for downstream handlers
  req.session = session;
  req.agentProfile = session.agentProfile;
  req.vpToken = session.vpToken;

  next();
};

/**
 * Agency token authenticator (UC1 - admin panel flow)
 * Validates X-Agency-Token and generates VP from stored VC via Hopae
 */
export const agencyTokenAuthenticator = async (req, _res, next) => {
  const token = req.headers['x-agency-token'];
  const session = validateAgencyToken(token);

  if (!session) {
    throw new AppError({
      statusCode: 401,
      msg: 'Invalid or expired agency token',
    });
  }

  try {
    const vpData = await generateVpDataFromStoredVC();

    req.agentProfile = vpData.agentProfile;
    req.vpToken = vpData.vpToken;
    req.vpTxId = vpData.txId;
    req.agencySession = session;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError({
      statusCode: 500,
      msg: `Failed to generate VP from stored VC: ${error.message}`,
    });
  }
};

/**
 * Hybrid authenticator supporting agency token and verification ID patterns
 * Priority: X-Agency-Token > X-Verification-Id
 * Wrapped to properly handle async errors from agencyTokenAuthenticator
 */
export const hybridAuthenticator = (req, res, next) => {
  const agencyToken = req.headers['x-agency-token'];
  const verificationId = req.headers['x-verification-id'];

  // Agency token (UC1 admin panel — generates VP from stored VC, async)
  if (agencyToken) {
    return Promise.resolve(agencyTokenAuthenticator(req, res, next)).catch(next);
  }

  // Verification ID (UC2 QR scan — stateful session)
  if (verificationId) {
    return verificationIdAuthenticator(req, res, next);
  }

  // No authentication provided
  throw new AppError({
    statusCode: 401,
    msg: 'Authentication required: provide X-Agency-Token or X-Verification-Id header',
  });
};
