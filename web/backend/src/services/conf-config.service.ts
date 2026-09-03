import * as fs from 'fs';
import { readTooltypeMap } from '../utils/info-file.util';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { BBSPaths } from '../utils/bbs-paths.util';

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
/**
 * Memo of the last parse per BBS root, keyed on ConfConfig.info's mtime+size.
 * A file-scan door polls DT_NAME on every listing, and each poll used to
 * re-open and re-parse the icon; the sysop's edits still land because any
 * write moves the mtime.
 */
const confConfigCache = new Map<string, { stamp: string; data: ConfConfigData | null }>();

export function loadConfConfig(bbsRoot: string): ConfConfigData | null {
  try {
    const confConfigPath = path.join(bbsRoot, 'ConfConfig.info');
    if (!fs.existsSync(confConfigPath)) {
      confConfigCache.delete(bbsRoot);
      return null;
    }

    const st = fs.statSync(confConfigPath);
    const stamp = `${st.mtimeMs}:${st.size}`;
    const cached = confConfigCache.get(bbsRoot);
    if (cached && cached.stamp === stamp) {
      return cached.data;
    }

    const toolTypes = readTooltypeMap(confConfigPath);

    const countStr = toolTypes.get('NCONFS');
    const confCount = countStr ? parseInt(countStr, 10) || 0 : 0;
    if (!confCount) {
      confConfigCache.set(bbsRoot, { stamp, data: null });
      return null;
    }

    const entries: ConfConfigEntry[] = [];
    for (let i = 1; i <= confCount; i++) {
      const name = toolTypes.get(`NAME.${i}`) || `Conference ${i}`;
      const location = toolTypes.get(`LOCATION.${i}`) || '';
      entries.push({ name, location });
    }

    const data: ConfConfigData = { confCount, entries };
    confConfigCache.set(bbsRoot, { stamp, data });
    return data;
  } catch (error) {
console.error('[ConfConfig] Failed to read ConfConfig.info:', error);
    return null;
  }
}

/**
 * A conference's LOCATION, in Amiga form, for handing to a door.
 *
 * A conference does NOT have to live in `Conf<n>` - express.e reads its
 * directory from ConfConfig.info's `LOCATION.n` tooltype and a sysop is free
 * to point it anywhere ("Work:Confs/Elite/"). Anything that builds the name
 * `Conf${n}` by hand names the wrong directory on a board that moved one.
 *
 * Returns the tooltype verbatim, so what a door is told matches what the sysop
 * configured. Falls back to `BBS:Conf<n>/` - the same default express.e ships
 * with - when ConfConfig.info is missing or carries no LOCATION for this
 * conference.
 */
export function conferenceLocation(bbsRoot: string, confNum: number): string {
  const location = loadConfConfig(bbsRoot)?.entries[confNum - 1]?.location ?? '';
  return location || `BBS:Conf${confNum}/`;
}

/**
 * Host directory for a conference.
 *
 * The Amiga LOCATION above, mapped onto the filesystem. The assign table is
 * NOT re-written here: it is BBSPaths.resolveAmigaPath(), the wider table
 * already on this branch (BBS:, DOORS:, NODE<n>:, PROGDIR:, S:, RAM:, T:,
 * WORK:). The result is then case-resolved through amigafs, because ext4 under
 * the Linux container will not match "conf2/" against "Conf2/".
 */
export function conferenceDirectory(bbsRoot: string, confNum: number): string {
  const location = conferenceLocation(bbsRoot, confNum).replace(/\/+$/, '');
  const mapped = new BBSPaths(bbsRoot).resolveAmigaPath(location);

  // resolveAmigaPath returns an unknown/absent assign untouched; a bare
  // relative LOCATION is relative to the BBS root.
  const host = path.isAbsolute(mapped) ? mapped : path.join(bbsRoot, mapped);

  return amigafs.resolveExistingAncestors(host);
}
