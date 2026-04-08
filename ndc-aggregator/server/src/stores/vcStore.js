import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const VC_FILE_PATH = path.join(DATA_DIR, 'agency-vc.json');

// In-memory cache
let cachedVC = null;

/**
 * Ensure the data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load VC from disk into memory cache (called on startup)
 * @returns {object|null} The stored VC or null
 */
const loadFromDisk = () => {
  try {
    if (fs.existsSync(VC_FILE_PATH)) {
      const data = fs.readFileSync(VC_FILE_PATH, 'utf-8');
      cachedVC = JSON.parse(data);
      console.log('[VCStore] Loaded agency VC from disk:', {
        id: cachedVC?.id,
        subject: cachedVC?.credentialSubject?.name,
        iataNumber: cachedVC?.credentialSubject?.iata_number,
      });
      return cachedVC;
    }
  } catch (error) {
    console.error('[VCStore] Failed to load VC from disk:', error.message);
  }
  return null;
};

/**
 * Store a VC (persists to disk + updates memory cache)
 * @param {object} vc - The VCDM Verifiable Credential object
 */
const storeVC = (vc) => {
  ensureDataDir();
  cachedVC = vc;
  fs.writeFileSync(VC_FILE_PATH, JSON.stringify(vc, null, 2), 'utf-8');
  console.log('[VCStore] Agency VC stored:', {
    id: vc?.id,
    subject: vc?.credentialSubject?.name,
    iataNumber: vc?.credentialSubject?.iata_number,
  });
};

/**
 * Get the stored VC (from memory cache)
 * @returns {object|null} The stored VC or null
 */
const getVC = () => {
  return cachedVC;
};

/**
 * Get summary info about the stored VC (safe for API responses)
 * @returns {object|null} Summary or null if no VC stored
 */
const getVCInfo = () => {
  if (!cachedVC) return null;

  return {
    id: cachedVC.id,
    type: cachedVC.type,
    issuer: cachedVC.issuer,
    validFrom: cachedVC.validFrom,
    validUntil: cachedVC.validUntil,
    subject: {
      id: cachedVC.credentialSubject?.id,
      name: cachedVC.credentialSubject?.name,
      iataNumber: cachedVC.credentialSubject?.iata_number,
    },
    hasProof: !!cachedVC.proof,
  };
};

/**
 * Delete the stored VC (removes from disk + clears memory cache)
 * @returns {boolean} true if a VC was deleted, false if none existed
 */
const deleteVC = () => {
  const existed = cachedVC !== null;
  cachedVC = null;

  try {
    if (fs.existsSync(VC_FILE_PATH)) {
      fs.unlinkSync(VC_FILE_PATH);
    }
  } catch (error) {
    console.error('[VCStore] Failed to delete VC file:', error.message);
  }

  if (existed) {
    console.log('[VCStore] Agency VC deleted');
  }
  return existed;
};

/**
 * Check if a VC is currently stored
 * @returns {boolean}
 */
const hasVC = () => {
  return cachedVC !== null;
};

// Load from disk on module initialization
loadFromDisk();

export const vcStore = {
  storeVC,
  getVC,
  getVCInfo,
  deleteVC,
  hasVC,
  loadFromDisk,
};
