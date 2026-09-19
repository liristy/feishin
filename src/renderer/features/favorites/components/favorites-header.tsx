import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '/@/renderer/components/page-header/page-header';
import { useListContext } from '/@/renderer/context/list-context';
import { FilterBar } from '/@/renderer/features/shared/components/filter-bar';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { SongListHeaderFilters } from '/@/renderer/features/songs/components/song-list-header-filters';
import { useSongListFilters } from '/@/renderer/features/songs/hooks/use-song-list-filters';
import { Flex } from '/@/shared/components/flex/flex';
import { Stack } from '/@/shared/components/stack/stack';
import { LibraryItem } from '/@/shared/types/domain-types';
import { ItemListKey } from '/@/shared/types/types';

export const FavoritesHeader = () => {
    const { t } = useTranslation();
    const { customFilters, itemCount, pageKey } = useListContext();
    const { query } = useSongListFilters(pageKey as ItemListKey);

    const playQuery = useMemo(() => ({ ...query, ...customFilters }), [query, customFilters]);

    return (
        <Stack gap={0}>
            <PageHeader withTopSpacing>
                <Flex justify="space-between" w="100%">
                    <LibraryHeaderBar ignoreMaxWidth>
                        <LibraryHeaderBar.PlayButton
                            itemType={LibraryItem.SONG}
                            listQuery={playQuery}
                            variant="filled"
                        />
                        <LibraryHeaderBar.Title>{t('page.favorites.title')}</LibraryHeaderBar.Title>
                        <LibraryHeaderBar.Badge isLoading={itemCount === undefined}>
                            {itemCount}
                        </LibraryHeaderBar.Badge>
                    </LibraryHeaderBar>
                </Flex>
            </PageHeader>
            <FilterBar>
                <SongListHeaderFilters />
            </FilterBar>
        </Stack>
    );
};
