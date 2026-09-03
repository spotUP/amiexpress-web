import * as fs from 'fs';
import { readTooltypeMap } from '../utils/info-file.util';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';

export interface ConfConfigEntry {
  name: string;
  location: string;
}

export interface ConfConfigData {
  confCount: number;
  entries: ConfConfigEntry[];
}

/**
 * Read ConfConfig.info tooltypes to determine conference count and names.
 * express.e: confNames/confDirs are populated from ConfConfig (NCONFS, NAME.n, LOCATION.n).
 */
export function loadConfConfig(bbsRoot: string): ConfConfigData | null {
  try {
    const confConfigPath = path.join(bbsRoot, 'ConfConfig.info');
    if (!fs.existsSync(confConfigPath)) {
      return null;
    }

    const toolTypes = readTooltypeMap(confConfigPath);

    const countStr = toolTypes.get('NCONFS');
    const confCount = countStr ? parseInt(countStr, 10) || 0 : 0;
    if (!confCount) {
      return null;
    }

    const entries: ConfConfigEntry[] = [];
    for (let i = 1; i <= confCount; i++) {
      const name = toolTypes.get(`NAME.${i}`) || `Conference ${i}`;
      const location = toolTypes.get(`LOCATION.${i}`) || '';
      entries.push({ name, location });
    }

    return { confCount, entries };
  } catch (error) {
console.error('[ConfConfig] Failed to read ConfConfig.info:', error);
    return null;
  }
}

/**
 * Host directory for a conference.
 *
 * A conference does NOT have to live in `Conf<n>` - express.e reads its
 * directory from ConfConfig.info's `LOCATION.n` tooltype, and a sysop is free
 * to point it anywhere ("Work:Confs/General/"). Building `Conf${n}` by hand
 * silently reads the wrong directory on any board that moved one.
 *
 * `LOCATION.n` is an Amiga path, so the assign is substituted the same three
 * ways command LOCATIONs are (see amiga-command-parser.util.ts:679-682, which
 * has these rules inline for `Commands/*.info` - worth folding into one shared
 * helper the next time either side is touched), and the result is
 * case-resolved through amigafs so a differently-cased directory still
 * matches on a case-sensitive host.
 *
 * Falls back to `<bbsRoot>/Conf<n>` when ConfConfig.info is missing or has no
 * LOCATION for this conference - the same default express.e ships with.
 */
export function conferenceDirectory(bbsRoot: string, confNum: number): string {
  const location = loadConfConfig(bbsRoot)?.entries[confNum - 1]?.location ?? '';

  const relative = location
    .replace(/^BBS:/i, '')          // BBS: is the BBS root
    .replace(/^doors:/i, 'Doors/')  // doors: -> Doors/
    .replace(/:/g, '/')             // any remaining volume separator
    .replace(/\/+$/, '');          // LOCATION values carry a trailing slash

  const host = relative
    ? (path.isAbsolute(relative) ? relative : path.join(bbsRoot, relative))
    : path.join(bbsRoot, `Conf${confNum}`);

  return amigafs.resolveExistingAncestors(host);
}
