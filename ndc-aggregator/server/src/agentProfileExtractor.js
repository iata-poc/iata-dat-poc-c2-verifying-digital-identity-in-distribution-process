import { jwtDecode } from 'jwt-decode';

/**
 * Extract agent profile from VP token
 * @param {string} vpToken - The VP token (JWT)
 * @returns {object} Agent profile with DID, name, email, agency details, roles
 */
export const extractAgentProfile = (vpToken) => {
  if (!vpToken) {
    return null;
  }

  try {
    const decoded = jwtDecode(vpToken);
    
    // Extract VP payload - structure depends on verifier implementation
    const vp = decoded.vp || decoded;
    const verifiableCredential = Array.isArray(vp.verifiableCredential) 
      ? vp.verifiableCredential[0] 
      : vp.verifiableCredential;

    const credentialSubject = verifiableCredential?.credentialSubject || {};
    
    // Extract agent DID from issuer or subject
    const agentDid = decoded.iss || credentialSubject.id || '';
    
    // Extract agency information
    const agencyInfo = credentialSubject.agency || credentialSubject.organization || {};
    
    const profile = {
      did: agentDid,
      name: credentialSubject.name || credentialSubject.givenName || '',
      email: credentialSubject.email || '',
      agency: {
        id: agencyInfo.id || agencyInfo.organizationId || '',
        name: agencyInfo.name || agencyInfo.organizationName || '',
        iataNumber: agencyInfo.iataNumber || agencyInfo.iataCode || '',
      },
      roles: credentialSubject.roles || credentialSubject.permissions || [],
    };

    return profile;
  } catch (error) {
    console.error('Error extracting agent profile from VP token:', error);
    return null;
  }
};

/**
 * Extract agent profile from Hopae verification claims and metadata
 * @param {object} claims - Claims object from Hopae completed status
 * @param {object} [metadata] - Metadata object from Hopae response (contains iata_number)
 * @param {string} [vpToken] - VP token JWT (used to extract DID from iss when claims lack it)
 * @returns {object} Agent profile
 */
export const extractAgentProfileFromHopaeClaims = (claims, metadata, vpToken) => {
  if (!claims) {
    console.warn('[Hopae] No claims provided');
    return null;
  }

  try {
    console.log('[Hopae] Extracting agent profile from claims:', JSON.stringify(claims));
    if (metadata) {
      console.log('[Hopae] Metadata:', JSON.stringify(metadata));
    }

    // DID resolution: claims first, then VP token JWT issuer
    let did = claims.did || claims.sub || '';
    if (!did && vpToken) {
      try {
        did = jwtDecode(vpToken)?.iss || '';
        if (did) {
          console.log(`[Hopae] DID extracted from VP token iss: ${did}`);
        }
      } catch (e) {
        console.warn('[Hopae] Could not extract DID from VP token:', e.message);
      }
    }

    const profile = {
      did,
      name: [claims.givenName, claims.surname].filter(Boolean).join(' ') || claims.name || [claims.firstName, claims.lastName].filter(Boolean).join(' ') || '',
      email: claims.email || '',
      employeeId: claims.employeeID || claims.employeeId || '',
      agency: {
        id: claims.organizationId || claims.agency?.id || '',
        name: claims.organizationName || claims.agency?.name || '',
        iataNumber: metadata?.iata_number || claims.iataNumber || claims.iataCode || '',
      },
      roles: claims.roles || [],
    };

    return profile;
  } catch (error) {
    console.error('[Hopae] Error extracting agent profile from claims:', error);
    return null;
  }
};

