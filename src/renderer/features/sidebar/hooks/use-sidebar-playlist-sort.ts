import { useMatch, useSearchParams } from 'react-router';

import { useListFilterPersistence } from '/@/renderer/features/shared/hooks/use-list-filter-persistence';
import { FILTER_KEYS } from '/@/renderer/features/shared/utils';
import { AppRoute } from '/@/renderer/router/routes';
import { useCurrentServer } from '/@/renderer/store';
import { PlaylistListSort, SortOrder } from '/@/shared/types/domain-types';
import { ItemListKey } from '/@/shared/types/types';

export const useSidebarPlaylistSort = () => {
    const server = useCurrentServer();
    const { getFilter } = useListFilterPersistence(server.id, ItemListKey.PLAYLIST);
    const isPlaylistList = useMatch(AppRoute.PLAYLISTS);
    const [searchParams] = useSearchParams();
    // Other pages use the same URL keys for songs, albums, etc.
    const getSort = (key: string) =>
        (isPlaylistList ? searchParams.get(key) : undefined) ?? getFilter(key);

    return {
        sortBy: (getSort(FILTER_KEYS.SHARED.SORT_BY) ?? PlaylistListSort.NAME) as PlaylistListSort,
        sortOrder: (getSort(FILTER_KEYS.SHARED.SORT_ORDER) ?? SortOrder.ASC) as SortOrder,
    };
};
