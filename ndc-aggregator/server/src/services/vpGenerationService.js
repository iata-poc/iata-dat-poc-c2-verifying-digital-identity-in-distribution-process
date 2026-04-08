import { randomUUID } from 'crypto';
import { vcStore } from '../stores/vcStore.js';
import { hopaeApi } from '../verifiers/hopaeClient.js';
import { AppError } from '../appError.js';

/**
 * Generate VP data (vpToken + agentProfile) from the stored agency VC.
 * Called on each NDC request when the agency flow is used.
 *
 * Flow:
 *   1. Load stored VC from vcStore
 *   2. Generate a random tx_id (used as TrxID in NDC requests)
 *   3. Call Hopae /debug/vcdm/vp to wrap VC into a VP token
 *   4. Extract agentProfile from VC's credentialSubject
 *   5. Return { vpToken, agentProfile, txId } for NDC builders
 *
 * @returns {Promise<{vpToken: string|null, agentProfile: object, txId: string}>}
 */
export const generateVpDataFromStoredVC = async () => {
  const vc = vcStore.getVC();

  if (!vc) {
    throw new AppError({
      statusCode: 400,
      msg: 'No valid credentials to execute aggregation search',
    });
  }

  const txId = String(Math.floor(10000000 + Math.random() * 90000000));

  // Extract agent profile from VC credentialSubject
  const subject = vc.credentialSubject || {};
  const agentProfile = {
    did: subject.id || '',
    name: subject.name || '',
    email: '',
    employeeId: '',
    agency: {
      id: subject.id || '',
      name: subject.name || '',
      iataNumber: subject.iata_number || '',
    },
    roles: [],
  };

  // Generate VP token via Hopae
  let vpToken = null;
  try {
    const vpResult = await hopaeApi.generateVP(vc, txId);
    vpToken = vpResult.vp_token || vpResult.vpToken || vpResult.vp || null;

    console.log('[VPGeneration] VP generated from stored VC:', {
      txId,
      iataNumber: subject.iata_number,
      agencyName: subject.name,
      hasVpToken: !!vpToken,
    });
  } catch (error) {
    console.error('[VPGeneration] Failed to generate VP from Hopae:', error.message);
    // Continue without VP token — agentProfile still available for NDC builders
    console.warn('[VPGeneration] Proceeding without VP token, using VC data directly');
  }

  return {
    vpToken,
    agentProfile,
    txId,
  };
};
