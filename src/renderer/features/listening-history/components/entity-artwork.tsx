import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '../routes/listening-history-route.module.css';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { libraryArtworkQuery } from '/@/renderer/features/listening-history/api/library-artwork-api';
import { useCurrentServerId } from '/@/renderer/store';
import { MalojaEntity } from '/@/shared/api/maloja/maloja-types';
import { ImageUnloader } from '/@/shared/components/image/image';
import { useInViewport } from '/@/shared/hooks/use-in-viewport';
import { LibraryItem } from '/@/shared/types/domain-types';

const Artwork = ({
    entity,
    large,
    serverId,
    size,
    url,
}: {
    entity: MalojaEntity;
    large?: boolean;
    serverId: string;
    size?: number;
    url: string;
}) => {
    const { t } = useTranslation();
    const { inViewport, ref } = useInViewport<HTMLDivElement>();
    const [failedLibraryImages, setFailedLibraryImages] = useState<string[]>([]);
    const [failedMalojaImage, setFailedMalojaImage] = useState(false);
    const query = useQuery({
        ...libraryArtworkQuery(serverId, entity),
        enabled: !!serverId && inViewport,
    });
    const imageIdentity = (item: typeof query.data) =>
        item ? JSON.stringify([item._serverId, item.imageId, item.imageUrl]) : '';
    const needsAlbumArtist =
        entity.kind === 'artists' &&
        query.data?._itemType === LibraryItem.ARTIST &&
        (!(query.data.imageId || query.data.imageUrl) ||
            failedLibraryImages.includes(imageIdentity(query.data)));
    const albumArtistQuery = useQuery({
        ...libraryArtworkQuery(serverId, entity, true),
        enabled: !!serverId && inViewport && needsAlbumArtist,
    });
    const item = needsAlbumArtist ? albumArtistQuery.data : query.data;
    const identity = imageIdentity(item);
    const useLibrary =
        item && (item.imageId || item.imageUrl) && !failedLibraryImages.includes(identity);
    const fallback =
        (!query.isPending && (!needsAlbumArtist || !albumArtistQuery.isPending)) || !serverId;
    return (
        <div
            className={styles.artwork}
            ref={ref}
            style={{ height: size, width: size }}
            title={
                entity.kind === 'artists' && item?._itemType === LibraryItem.SONG
                    ? t('listeningHistory.albumCoverFallback', { album: item.album || item.name })
                    : undefined
            }
        >
            {item && useLibrary ? (
                <ItemImage
                    alt=""
                    blurHash={item.blurHash}
                    containerClassName={styles.artworkImage}
                    dominantColor={item.dominantColor}
                    explicitStatus={'explicitStatus' in item ? item.explicitStatus : undefined}
                    id={item.imageId}
                    itemType={item._itemType}
                    onError={() => setFailedLibraryImages((failed) => [...failed, identity])}
                    serverId={item._serverId}
                    src={item.imageUrl}
                    thumbHash={item.thumbHash}
                    type={large ? 'header' : 'table'}
                />
            ) : fallback && entity.id !== undefined && !failedMalojaImage ? (
                // Public Maloja images can be displayed even when their host does not allow fetch CORS.
                <img
                    alt=""
                    className={styles.artworkImage}
                    loading="lazy"
                    onError={() => setFailedMalojaImage(true)}
                    src={`${url}/image?${{ albums: 'album_id', artists: 'artist_id', tracks: 'track_id' }[entity.kind]}=${encodeURIComponent(entity.id)}`}
                />
            ) : (
                <ImageUnloader
                    icon={
                        {
                            albums: 'emptyAlbumImage',
                            artists: 'emptyArtistImage',
                            tracks: 'emptySongImage',
                        }[entity.kind] as 'emptyAlbumImage' | 'emptyArtistImage' | 'emptySongImage'
                    }
                />
            )}
        </div>
    );
};

export const EntityArtwork = (props: {
    entity: MalojaEntity;
    large?: boolean;
    size?: number;
    url: string;
}) => {
    const serverId = useCurrentServerId();
    return (
        <Artwork
            {...props}
            key={`${serverId}-${props.url}-${JSON.stringify(props.entity)}`}
            serverId={serverId}
        />
    );
};
