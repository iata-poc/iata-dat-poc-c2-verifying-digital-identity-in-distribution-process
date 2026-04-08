import express from 'express';
import { randomUUID as uuidv4 } from 'crypto';

import { AppError } from '../appError.js';
import { sessionStore } from '../sessionStore.js';
import { hopaeApi } from '../verifiers/hopaeClient.js';
import { constants, verifiers } from '../constants.js';
import { extractAgentProfileFromHopaeClaims } from '../agentProfileExtractor.js';

// Session timeout in milliseconds
const SESSION_TIMEOUT_IN_MILLIS = 30 * 60 * 1000; // 30 minutes

const asyncHandler = (func) => (req, res, next) => {
  Promise.resolve(func(req, res, next)).catch(next);
};

// ─────────────────────────────────────────────────────────────
// Public routes (no authentication required)
// ─────────────────────────────────────────────────────────────
export const verificationPublicRouter = express.Router();

verificationPublicRouter.get('/ping', (_req, res) => {
  res.status(200).json({ msg: 'pong' });
});

//Creates a verification request for agency desktop flow
verificationPublicRouter.post(
  '/verifications',
  asyncHandler(async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ipv4 = ip.includes(':') ? ip.split(':').pop() : ip;

    const { flow: flowType } = req.body;
    if (
      !Object.values(constants.flows)
        .map((f) => f.type)
        .includes(flowType)
    ) {
      throw new AppError({
        statusCode: 400,
        msg: `You must specify a valid flow: ${Object.values(constants.flows)
          .map((f) => f.type)
          .join(', ')}`,
      });
    }

    const verificationId = uuidv4();
    const flow = Object.values(constants.flows).find(
      (flow) => flow.type === flowType
    );

    // ── Hopae verifier ──
    if (flow.verifier === verifiers.HOPAE) {
      const hopaeResult = await hopaeApi.startQrSession();

      const session = {
        id: verificationId,
        ip: ipv4,
        hopaeSessionId: hopaeResult.sessionId,
        verifier: verifiers.HOPAE,
        state: constants.sessionStates.REQUESTED,
        flowType: flow.type,
      };
      sessionStore.addSession(session);

      console.log(
        `[Hopae] Verification state[${session.state}] for verificationId[${session.id}] hopaeSessionId[${session.hopaeSessionId}]`
      );

      return res.status(201).json({
        id: verificationId,
        qrContent: hopaeResult.requestUri,
        state: session.state,
      });
    }

    throw new AppError({
      statusCode: 400,
      msg: 'Unsupported verifier',
    });
  })
);

//Checks verification request state. It is polled from frontend app
verificationPublicRouter.get(
  '/verifications/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const session = sessionStore.getSessionById(id);
    if (!session) {
      throw new AppError({
        statusCode: 404,
        msg: 'Verification not found!',
      });
    }

    // If already verified, return immediately
    if (session.state === constants.sessionStates.VERIFIED) {
      return res.status(200).json({ id: session.id, state: session.state });
    }

    // ── Hopae: poll their status endpoint ──
    if (session.verifier === verifiers.HOPAE && session.hopaeSessionId) {
      try {
        const hopaeStatus = await hopaeApi.getSessionStatus(session.hopaeSessionId);
        console.log(`[Hopae] Status for ${session.hopaeSessionId}:`, hopaeStatus.status);

        if (hopaeStatus.status === 'completed' && hopaeStatus.verified) {
          const currentTime = new Date();
          const expiresAt = new Date();
          expiresAt.setMilliseconds(
            expiresAt.getMilliseconds() + SESSION_TIMEOUT_IN_MILLIS
          );

          console.log('[HOPAE] Hopae return ', hopaeStatus);

          const agentProfile = extractAgentProfileFromHopaeClaims(hopaeStatus.claims, hopaeStatus.metadata, hopaeStatus.payload);

          const updatedSession = {
            ...session,
            state: constants.sessionStates.VERIFIED,
            createdAt: currentTime,
            expiresAt: expiresAt,
            vpToken: hopaeStatus.payload || null,
            agentProfile: agentProfile,
            agencyIataNumber: agentProfile?.agency?.iataNumber || null,
            hopaeClaims: hopaeStatus.claims,
            hopaeMetadata: hopaeStatus.metadata,
          };
          sessionStore.updateSession(updatedSession);
          console.log('[Hopae] Session verified and updated:', updatedSession.id);

          return res.status(200).json({ id: updatedSession.id, state: updatedSession.state });
        }

        // Credential revoked (status: "revoked", verified: false)
        if (hopaeStatus.status === 'revoked' || (hopaeStatus.status === 'completed' && !hopaeStatus.verified)) {
          console.log(`[Hopae] Credential verification failed (${hopaeStatus.status}):`, session.id);
          return res.status(200).json({ id: session.id, state: 'FAILED', reason: 'Credential verification failed. The credential may be revoked or invalid.' });
        }

        if (hopaeStatus.status === 'error' || hopaeStatus.status === 'failed' || hopaeStatus.status === 'expired') {
          console.log(`[Hopae] Session ${hopaeStatus.status}:`, session.id);
          return res.status(200).json({ id: session.id, state: 'ERROR', reason: `Verification ${hopaeStatus.status}` });
        }
      } catch (error) {
        console.error('[Hopae] Error checking status:', error.message);
      }

      return res.status(200).json({ id: session.id, state: session.state });
    }

    // Non-Hopae session: return stored state
    res.status(200).json({ id: session.id, state: session.state });
  })
);

verificationPublicRouter.get('/configuration', (req, res) => {
  res.status(200).json(constants.flows);
});
