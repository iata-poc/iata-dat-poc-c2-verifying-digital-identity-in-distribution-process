import fs from 'fs';
import path from 'path';

const DEBUG_DIR = path.resolve('debug-logs');

/**
 * Write an NDC request or response XML to a debug file.
 * Files are stored under /debug-logs/<airlineCode>/<operation>-<type>-<timestamp>.xml
 *
 * @param {string} airlineCode - IATA airline code
 * @param {string} operation   - e.g. 'AirShopping', 'OfferPrice'
 * @param {'request'|'response'} type
 * @param {string} content     - XML string
 * @returns {string} The file path written to
 */
export const writeDebugXml = (airlineCode, operation, type, content) => {
  if (process.env.DEBUG_LOGS_ENABLED !== 'true') return null;
  try {
    const airlineDir = path.join(DEBUG_DIR, airlineCode);
    if (!fs.existsSync(airlineDir)) {
      fs.mkdirSync(airlineDir, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${operation}-${type}-${ts}.xml`;
    const filePath = path.join(airlineDir, filename);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[DEBUGGING] ${airlineCode} ${operation} ${type} written to ${filePath} (${content.length} bytes)`);
    return filePath;
  } catch (err) {
    console.error(`[DEBUGGING] Failed to write debug file for ${airlineCode} ${operation} ${type}:`, err.message);
    return null;
  }
};
