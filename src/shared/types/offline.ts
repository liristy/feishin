import type { Song } from './domain-types';

export type OfflineEntry = {
    key: string;
    path: string;
    savedAt: number;
    size: number;
    song: Song;
};

export type OfflineJob = {
    key: string;
    received: number;
    song: Song;
    status: 'cancelled' | 'downloading' | 'failed' | 'queued';
    total: number;
};

export type OfflineSnapshot = {
    directory: string;
    entries: OfflineEntry[];
    jobs: OfflineJob[];
};
