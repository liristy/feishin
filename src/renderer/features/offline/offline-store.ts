import { useSyncExternalStore } from 'react';
import { persist } from 'zustand/middleware';
import { createWithEqualityFn } from 'zustand/traditional';

import { Song } from '/@/shared/types/domain-types';
import { OfflineJob, OfflineSnapshot } from '/@/shared/types/offline';

type DownloadStatus = 'downloaded' | OfflineJob['status'];
const songKey = (song: Pick<Song, '_serverId' | 'id'>) => JSON.stringify([song._serverId, song.id]);

export const useOfflineStore = createWithEqualityFn<{
    cacheWhileListening: boolean;
    downloads: Record<string, DownloadStatus>;
    setCacheWhileListening: (value: boolean) => void;
    setDownloads: (snapshot: OfflineSnapshot) => void;
}>()(
    persist(
        (set) => ({
            cacheWhileListening: true,
            downloads: {},
            setCacheWhileListening: (cacheWhileListening) => set({ cacheWhileListening }),
            setDownloads: ({ entries, jobs }) => {
                const downloads: Record<string, DownloadStatus> = {};
                for (const job of jobs) downloads[songKey(job.song)] = job.status;
                for (const entry of entries) downloads[songKey(entry.song)] = 'downloaded';
                set({ downloads });
            },
        }),
        {
            // Preserve the listening preference, discard the obsolete manual offline flag.
            migrate: (persisted) => ({
                cacheWhileListening:
                    (persisted as { cacheWhileListening?: boolean })?.cacheWhileListening ?? true,
            }),
            name: 'offline-settings',
            partialize: ({ cacheWhileListening }) => ({ cacheWhileListening }),
            version: 1,
        },
    ),
);

export const useSongDownloadStatus = (song?: Pick<Song, '_serverId' | 'id'>) =>
    useOfflineStore((state) => (song ? state.downloads[songKey(song)] : undefined));

const subscribeNetwork = (notify: () => void) => {
    window.addEventListener('online', notify);
    window.addEventListener('offline', notify);
    return () => {
        window.removeEventListener('online', notify);
        window.removeEventListener('offline', notify);
    };
};

export const useOfflineStatus = () =>
    !useSyncExternalStore(subscribeNetwork, () => navigator.onLine);
