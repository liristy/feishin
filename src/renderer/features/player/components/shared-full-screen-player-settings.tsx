import { useTranslation } from 'react-i18next';

import { SONG_TABLE_COLUMNS } from '/@/renderer/components/item-list/item-table-list/default-columns';
import { openLyricsSettingsModal } from '/@/renderer/features/lyrics/utils/open-lyrics-settings-modal';
import { openFullScreenPlayerSettingsModal } from '/@/renderer/features/player/utils/open-full-screen-player-settings-modal';
import {
    ListConfigMenu,
    SONG_DISPLAY_TYPES,
} from '/@/renderer/features/shared/components/list-config-menu';
import { useHotkeys } from '/@/renderer/hooks/use-hotkeys';
import { useFullScreenPlayerStore, useFullScreenPlayerStoreActions } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { ItemListKey, ListDisplayType } from '/@/shared/types/types';

export const SharedFullscreenPlayerSettings = ({
    showLyricsSettings = false,
}: {
    showLyricsSettings?: boolean;
}) => {
    const { t } = useTranslation();
    const { activeTab, expanded } = useFullScreenPlayerStore();
    const { setStore } = useFullScreenPlayerStoreActions();
    const lyricsSettingsLabel =
        t('page.fullscreenPlayer.lyrics') + ' · ' + t('common.setting', { count: 2 });

    const handleToggleFullScreenPlayer = () => {
        setStore({
            expanded: !expanded,
            visualizerExpanded: false,
            visualizerReturnToPlayer: false,
        });
    };

    useHotkeys([['Escape', handleToggleFullScreenPlayer]]);

    return (
        <>
            <ActionIcon
                icon="arrowDownS"
                iconProps={{ size: 'lg' }}
                onClick={handleToggleFullScreenPlayer}
                tooltip={{ label: t('common.minimize') }}
                variant="subtle"
            />
            <ActionIcon
                icon="settings2"
                iconProps={{ size: 'lg' }}
                onClick={openFullScreenPlayerSettingsModal}
                tooltip={{ label: t('common.configure') }}
                variant="subtle"
            />
            {showLyricsSettings && activeTab === 'lyrics' ? (
                <ActionIcon
                    aria-label={lyricsSettingsLabel}
                    icon="lyrics"
                    onClick={() => openLyricsSettingsModal()}
                    tooltip={{ label: lyricsSettingsLabel }}
                    variant="subtle"
                />
            ) : (
                <ListConfigMenu
                    buttonProps={{
                        variant: 'subtle',
                    }}
                    displayTypes={[
                        { hidden: true, value: ListDisplayType.GRID },
                        ...SONG_DISPLAY_TYPES,
                    ]}
                    listKey={ItemListKey.FULL_SCREEN}
                    optionsConfig={{
                        table: {
                            itemsPerPage: { hidden: true },
                            pagination: { hidden: true },
                        },
                    }}
                    tableColumnsData={SONG_TABLE_COLUMNS}
                />
            )}
        </>
    );
};
