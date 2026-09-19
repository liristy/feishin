import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { api } from '/@/renderer/api';
import { localSongUrl, OfflineSongUnavailableError } from '/@/renderer/features/offline/offline';
import { useOfflineStatus } from '/@/renderer/features/offline/offline-store';
import { TranscodingConfig, useSettingsStore } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { QueueSong } from '/@/shared/types/domain-types';
import { PlayerType } from '/@/shared/types/types';

export function useSongUrl(
    song: QueueSong | undefined,
    current: boolean,
    transcode: Partial<TranscodingConfig>,
): string | undefined {
    const offline = useOfflineStatus();
    const identity = `${song?._uniqueId}:${offline}`;
    const prior = useRef(['', '']);
    const shouldReusePrior = Boolean(
        song?._serverId && current && prior.current[0] === identity && prior.current[1],
    );

    const { data: queryStreamUrl, error } = useQuery({
        enabled: Boolean(song?._serverId) && !shouldReusePrior,
        networkMode: 'always',
        queryFn: async () =>
            (await localSongUrl(song!, true)) ||
            api.controller.getStreamUrl({
                apiClientProps: { serverId: song!._serverId },
                query: {
                    bitrate: transcode.bitrate,
                    format: transcode.format,
                    id: song!.id,
                    maxSampleRate: transcode.maxSampleRate,
                    transcode: transcode.enabled ?? false,
                },
            }),
        queryKey: [
            song?._serverId,
            'stream-url',
            song?.id,
            identity,
            shouldReusePrior ? 'reuse-prior' : transcode.bitrate,
            shouldReusePrior ? 'reuse-prior' : transcode.format,
            shouldReusePrior ? 'reuse-prior' : transcode.maxSampleRate,
            shouldReusePrior ? 'reuse-prior' : transcode.enabled,
        ] as const,
        staleTime: 60 * 1000,
    });

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = ['', ''];
            return;
        }

        if (!queryStreamUrl) {
            return;
        }

        // Save resolved URL to avoid restarting current track on transcode setting changes.
        prior.current = [identity, queryStreamUrl];
    }, [song?._serverId, identity, queryStreamUrl]);

    useEffect(() => {
        if (current && error && !(error instanceof OfflineSongUnavailableError))
            toast.error({ message: error.message });
    }, [current, error]);

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = ['', ''];
        }
    }, [song?._serverId]);

    return shouldReusePrior ? prior.current[1] : queryStreamUrl;
}

export const getSongUrl = async (
    song: QueueSong,
    transcode: Partial<TranscodingConfig>,
    skipAutoTranscode?: boolean,
    forRenderer?: boolean,
    startTime?: number,
) => {
    // DLNA devices cannot access this computer's filesystem or Electron protocol.
    if (useSettingsStore.getState().playback.type !== PlayerType.DLNA) {
        const local = await localSongUrl(song, false);
        if (local) return local;
    }
    const url = await api.controller.getStreamUrl({
        apiClientProps: { serverId: song._serverId },
        query: {
            bitrate: transcode.bitrate,
            container: song.container,
            format: transcode.format,
            forRenderer,
            id: song.id,
            maxSampleRate: transcode.maxSampleRate,
            sampleRate: song.sampleRate,
            skipAutoTranscode,
            startTime,
            transcode: transcode.enabled ?? false,
        },
    });

    return url;
};
