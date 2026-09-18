import { Suspense } from 'react';

import { useListContext } from '/@/renderer/context/list-context';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { SongListView } from '/@/renderer/features/songs/components/song-list-content';
import { useListSettings } from '/@/renderer/store';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { ItemListKey } from '/@/shared/types/types';

export const FavoritesContent = () => {
    const { display, grid, itemsPerPage, pagination, table } = useListSettings(ItemListKey.SONG);
    const { customFilters } = useListContext();

    return (
        <AnimatedPage>
            <Suspense fallback={<Spinner container />}>
                <SongListView
                    display={display}
                    grid={grid}
                    itemsPerPage={itemsPerPage}
                    overrideQuery={customFilters}
                    pagination={pagination}
                    table={table}
                />
            </Suspense>
        </AnimatedPage>
    );
};
