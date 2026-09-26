import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { libraryArtworkQuery } from '/@/renderer/features/listening-history/api/library-artwork-api';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { useAuthStore, useCurrentServerId } from '/@/renderer/store';
import { MalojaEntity } from '/@/shared/api/maloja/maloja-types';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

export const TrackPlayButton = ({ entity }: { entity: MalojaEntity }) => {
    const { t } = useTranslation();
    const client = useQueryClient();
    const player = usePlayer();
    const serverId = useCurrentServerId();
    const play = useMutation({
        mutationFn: async () => {
            if (!serverId || entity.kind !== 'tracks') return;
            const song = await client.fetchQuery(libraryArtworkQuery(serverId, entity));
            if (useAuthStore.getState().currentServer?.id !== serverId) return;
            if (!song || song._itemType !== LibraryItem.SONG) {
                toast.info({ message: t('listeningHistory.trackNotFound') });
                return;
            }
            player.addToQueueByData([song], Play.NOW);
        },
        onError: () => toast.error({ message: t('listeningHistory.playError') }),
    });
    if (entity.kind !== 'tracks') return null;
    const label = `${t('player.play')} · ${entity.name}`;
    return (
        <ActionIcon
            aria-label={label}
            disabled={!serverId}
            icon="mediaPlay"
            loading={play.isPending}
            onClick={() => play.mutate()}
            size="sm"
            tooltip={{ label: serverId ? label : t('listeningHistory.playRequiresLibrary') }}
            variant="subtle"
        />
    );
};
