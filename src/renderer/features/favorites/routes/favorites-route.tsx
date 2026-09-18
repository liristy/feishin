import { useMemo, useState } from 'react';

import { ListContext } from '/@/renderer/context/list-context';
import { FavoritesContent } from '/@/renderer/features/favorites/components/favorites-content';
import { FavoritesHeader } from '/@/renderer/features/favorites/components/favorites-header';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { ItemListKey } from '/@/shared/types/types';

const FavoritesRoute = () => {
    const [itemCount, setItemCount] = useState<number | undefined>(undefined);

    const providerValue = useMemo(() => {
        return {
            customFilters: { favorite: true },
            itemCount,
            pageKey: ItemListKey.FAVORITE_SONG,
            setItemCount,
        };
    }, [itemCount]);

    return (
        <AnimatedPage>
            <ListContext.Provider value={providerValue}>
                <FavoritesHeader />
                <FavoritesContent />
            </ListContext.Provider>
        </AnimatedPage>
    );
};

const FavoritesRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <FavoritesRoute />
        </PageErrorBoundary>
    );
};

export default FavoritesRouteWithBoundary;
