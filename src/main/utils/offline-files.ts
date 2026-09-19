import type { Song } from '/@/shared/types/domain-types';

import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export const offlineKey = (serverId: string, songId: string) =>
    createHash('sha256')
        .update(JSON.stringify([serverId, songId]))
        .digest('hex');

export const offlineFilename = (name: string, key: string, container: null | string) => {
    const title = name
        // Filenames must not contain control characters, including NUL.
        // eslint-disable-next-line no-control-regex
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 100);
    const extension = container?.toLowerCase().replace(/^\./, '');
    return `${title || 'Track'}-${key.slice(0, 16)}.${extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'audio'}`;
};

export const offlineRelativePath = (song: Song, key: string) => {
    const source = (song.relativePath || song.path || '').replace(/\\/g, '/');
    const relative = source && !source.startsWith('/') && !/^[a-z]:/i.test(source);
    const parts = source.split('/');
    const safe = (part: string) => {
        const name = part
            // eslint-disable-next-line no-control-regex
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .replace(/[. ]+$/g, '')
            .slice(0, 180);
        return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
            ? `_${name}`
            : name || '_';
    };
    const filename = posix.basename(source) || offlineFilename(song.name, key, song.container);
    const directories =
        relative && parts.every((part) => part && part !== '.' && part !== '..')
            ? parts.slice(0, -1)
            : [
                  song.albumArtistName || song.artistName || 'Unknown Artist',
                  song.album || 'Unknown Album',
              ];
    const extension = song.container?.toLowerCase().replace(/^\./, '');
    // A Navidrome .strm entry contains a URL, but the downloaded file contains actual audio.
    const audioFilename = /\.strm$/i.test(filename)
        ? `${filename.slice(0, -5)}.${extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'audio'}`
        : filename;
    return [...directories, audioFilename].map(safe).join('/');
};

// A single byte range is sufficient for HTML audio seeking. Reject malformed/multiple ranges.
export const offlineRange = (header: null | string, size: number) => {
    if (!header) return { end: size - 1, start: 0 };
    const match = /^bytes=(\d*)-(\d*)$/.exec(header);
    if (!match || (!match[1] && !match[2])) return null;
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
        return null;
    return { end, start };
};
