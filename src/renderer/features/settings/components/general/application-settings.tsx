import type { ImagePlaceholderPriority } from '/@/shared/utils/image-hash';

import { t } from 'i18next';
import isElectron from 'is-electron';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { languages } from '/@/i18n/i18n';
import { ImageResolutionSettings } from '/@/renderer/features/settings/components/general/art-resolution-settings';
import {
    ArtistReleaseTypeSettings,
    ArtistSettings,
} from '/@/renderer/features/settings/components/general/artist-settings';
import { FullscreenPlayerSettings } from '/@/renderer/features/settings/components/general/fullscreen-player-settings';
import { HomeSettings } from '/@/renderer/features/settings/components/general/home-settings';
import { PathSettings } from '/@/renderer/features/settings/components/general/path-settings';
import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import {
    SideQueueLayout,
    SideQueueType,
    useGeneralSettings,
    useSettingsStoreActions,
} from '/@/renderer/store/settings.store';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Select } from '/@/shared/components/select/select';
import { Slider } from '/@/shared/components/slider/slider';
import { Switch } from '/@/shared/components/switch/switch';

const localSettings = isElectron() ? window.api.localSettings : null;

const SIDE_QUEUE_OPTIONS = [
    {
        label: t('setting.sidePlayQueueStyle', {
            context: 'optionAttached',
        }),
        value: 'sideQueue',
    },
    {
        label: t('setting.sidePlayQueueStyle', {
            context: 'optionDetached',
        }),
        value: 'sideDrawerQueue',
    },
];

const SIDE_QUEUE_LAYOUT_OPTIONS = [
    {
        label: t('setting.sidePlayQueueLayout', {
            context: 'optionHorizontal',
        }),
        value: 'horizontal',
    },
    {
        label: t('setting.sidePlayQueueLayout', {
            context: 'optionVertical',
        }),
        value: 'vertical',
    },
];

const IMAGE_PLACEHOLDER_PRIORITY_OPTIONS = [
    {
        label: t('setting.imagePlaceholderPriority', {
            context: 'optionThumbhash',
        }),
        value: 'thumbhash',
    },
    {
        label: t('setting.imagePlaceholderPriority', {
            context: 'optionBlurhash',
        }),
        value: 'blurhash',
    },
    {
        label: t('setting.imagePlaceholderPriority', {
            context: 'optionDominantColor',
        }),
        value: 'dominantColor',
    },
    {
        label: t('setting.imagePlaceholderPriority', {
            context: 'optionOff',
        }),
        value: 'off',
    },
];

export const ApplicationSettings = memo(() => {
    const { t } = useTranslation();
    const settings = useGeneralSettings();
    const { setSettings } = useSettingsStoreActions();
    const handleChangeLanguage = (e: null | string) => {
        if (!e) return;
        setSettings({
            general: {
                ...settings,
                language: e,
            },
        });
    };

    const options: SettingOption[] = [
        {
            control: (
                <Select
                    data={languages.map((language) => ({
                        label: `${language.label} (${language.value})`,
                        value: language.value,
                    }))}
                    onChange={handleChangeLanguage}
                    value={settings.language}
                />
            ),
            description: t('setting.language', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.language'),
        },
        {
            control: (
                <NumberInput
                    max={300}
                    min={50}
                    onBlur={(e) => {
                        if (!e) return;
                        const newVal = e.currentTarget.value
                            ? Math.min(Math.max(Number(e.currentTarget.value), 50), 300)
                            : settings.zoomFactor;
                        setSettings({
                            general: {
                                ...settings,
                                zoomFactor: newVal,
                            },
                        });
                        localSettings!.setZoomFactor(newVal);
                    }}
                    value={settings.zoomFactor}
                />
            ),
            description: t('setting.zoom', {
                context: 'description',
            }),
            isHidden: !isElectron(),
            title: t('setting.zoom'),
        },
        {
            control: (
                <Switch
                    defaultChecked={settings.resume}
                    onChange={(e) => {
                        localSettings?.set('resume', e.target.checked);
                        setSettings({
                            general: {
                                ...settings,
                                resume: e.currentTarget.checked,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.savePlayQueue', {
                context: 'description',
            }),
            isHidden: !isElectron(),
            title: t('setting.savePlayQueue'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.confirmQueueChanges')}
                    checked={settings.confirmQueueChanges}
                    onChange={(event) => {
                        setSettings({
                            general: {
                                ...settings,
                                confirmQueueChanges: event.currentTarget.checked,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.confirmQueueChanges', { context: 'description' }),
            title: t('setting.confirmQueueChanges'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.homeFeature')}
                    defaultChecked={settings.homeFeature}
                    onChange={(e) =>
                        setSettings({
                            general: {
                                ...settings,
                                homeFeature: e.currentTarget.checked,
                            },
                        })
                    }
                />
            ),
            description: t('setting.homeFeature', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.homeFeature'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.albumBackground')}
                    defaultChecked={settings.albumBackground}
                    onChange={(e) =>
                        setSettings({
                            general: {
                                ...settings,
                                albumBackground: e.currentTarget.checked,
                            },
                        })
                    }
                />
            ),
            description: t('setting.albumBackground', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.albumBackground'),
        },
        {
            control: (
                <Slider
                    defaultValue={settings.albumBackgroundBlur}
                    label={(e) => `${e} rem`}
                    max={6}
                    min={0}
                    onChangeEnd={(e) => {
                        setSettings({
                            general: {
                                ...settings,
                                albumBackgroundBlur: e,
                            },
                        });
                    }}
                    step={0.5}
                    w={100}
                />
            ),
            description: t('setting.albumBackgroundBlur', {
                context: 'description',
            }),
            isHidden: !settings.albumBackground,
            title: t('setting.albumBackgroundBlur'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.artistBackground')}
                    defaultChecked={settings.artistBackground}
                    onChange={(e) =>
                        setSettings({
                            general: {
                                ...settings,
                                artistBackground: e.currentTarget.checked,
                            },
                        })
                    }
                />
            ),
            description: t('setting.artistBackground', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.artistBackground'),
        },
        {
            control: (
                <Slider
                    defaultValue={settings.artistBackgroundBlur}
                    label={(e) => `${e} rem`}
                    max={6}
                    min={0}
                    onChangeEnd={(e) => {
                        setSettings({
                            general: {
                                ...settings,
                                artistBackgroundBlur: e,
                            },
                        });
                    }}
                    step={0.5}
                    w={100}
                />
            ),
            description: t('setting.artistBackgroundBlur', {
                context: 'description',
            }),
            isHidden: !settings.artistBackground,
            title: t('setting.artistBackgroundBlur'),
        },
        {
            control: (
                <Switch
                    aria-label="Toggle using native aspect ratio"
                    defaultChecked={settings.nativeAspectRatio}
                    onChange={(e) =>
                        setSettings({
                            general: {
                                ...settings,
                                nativeAspectRatio: e.currentTarget.checked,
                            },
                        })
                    }
                />
            ),
            description: t('setting.imageAspectRatio', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.imageAspectRatio'),
        },
        {
            control: (
                <Select
                    data={SIDE_QUEUE_OPTIONS}
                    defaultValue={settings.sideQueueType}
                    onChange={(e) => {
                        setSettings({
                            general: {
                                ...settings,
                                sideQueueType: e as SideQueueType,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.sidePlayQueueStyle', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.sidePlayQueueStyle'),
        },
        {
            control: (
                <SegmentedControl
                    aria-label={t('setting.sidePlayQueueLayout')}
                    data={SIDE_QUEUE_LAYOUT_OPTIONS}
                    defaultValue={settings.sideQueueLayout}
                    onChange={(e) =>
                        setSettings({
                            general: {
                                ...settings,
                                sideQueueLayout: e as SideQueueLayout,
                            },
                        })
                    }
                />
            ),
            description: t('setting.sidePlayQueueLayout', {
                context: 'description',
            }),
            isHidden: settings.sideQueueType !== 'sideQueue',
            title: t('setting.sidePlayQueueLayout'),
        },
        {
            control: (
                <Switch
                    defaultChecked={settings.showFavorites}
                    onChange={(e) => {
                        setSettings({
                            general: {
                                ...settings,
                                showFavorites: e.currentTarget.checked,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.showFavorites', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.showFavorites'),
        },
        {
            control: (
                <Switch
                    defaultChecked={settings.showRatings}
                    onChange={(e) => {
                        setSettings({
                            general: {
                                ...settings,
                                showRatings: e.currentTarget.checked,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.showRatings', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.showRatings'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.blurExplicitImages')}
                    defaultChecked={settings.blurExplicitImages}
                    onChange={(e) =>
                        setSettings({
                            general: {
                                ...settings,
                                blurExplicitImages: e.currentTarget.checked,
                            },
                        })
                    }
                />
            ),
            description: t('setting.blurExplicitImages', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.blurExplicitImages'),
        },
        {
            control: (
                <Select
                    data={IMAGE_PLACEHOLDER_PRIORITY_OPTIONS}
                    defaultValue={settings.imagePlaceholderPriority}
                    onChange={(e) => {
                        if (!e) return;
                        setSettings({
                            general: {
                                ...settings,
                                imagePlaceholderPriority: e as ImagePlaceholderPriority,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.imagePlaceholderPriority', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.imagePlaceholderPriority'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.enableGridMultiSelect')}
                    defaultChecked={settings.enableGridMultiSelect}
                    onChange={(e) =>
                        setSettings({
                            general: {
                                ...settings,
                                enableGridMultiSelect: e.currentTarget.checked,
                            },
                        })
                    }
                />
            ),
            description: t('setting.enableGridMultiSelect', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.enableGridMultiSelect'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.playerbarOpenDrawer')}
                    defaultChecked={settings.playerbarOpenDrawer}
                    onChange={(e) =>
                        setSettings({
                            general: {
                                ...settings,
                                playerbarOpenDrawer: e.currentTarget.checked,
                            },
                        })
                    }
                />
            ),
            description: t('setting.playerbarOpenDrawer', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.playerbarOpenDrawer'),
        },
        {
            control: (
                <NumberInput
                    max={120}
                    min={0}
                    onBlur={(e) => {
                        const rawValue = e.currentTarget.value;

                        const newVal = Math.min(Math.max(Number(rawValue), 0), 120);

                        setSettings({
                            general: {
                                ...settings,
                                fullscreenAutoOpenTimeout: newVal,
                            },
                        });
                    }}
                    placeholder={t('common.none')}
                    value={settings.fullscreenAutoOpenTimeout}
                />
            ),
            description: t('setting.fullscreenAutoOpenTimeout', {
                context: 'description',
            }),
            isHidden: false,
            title: t('setting.fullscreenAutoOpenTimeout'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.autosave')}
                    defaultChecked={settings.autoSave.enabled}
                    onChange={(e) => {
                        setSettings({
                            general: {
                                ...settings,
                                autoSave: {
                                    ...settings.autoSave,
                                    enabled: e.currentTarget.checked,
                                },
                            },
                        });
                    }}
                />
            ),
            description: t('setting.autosave', {
                context: 'description',
            }),
            title: t('setting.autosave'),
        },
        {
            control: (
                <NumberInput
                    min={1}
                    onBlur={(e) => {
                        if (!e) return;
                        const newVal = e.currentTarget.value
                            ? Math.max(Number(e.currentTarget.value), 1)
                            : settings.autoSave.count;
                        setSettings({
                            general: {
                                ...settings,
                                autoSave: {
                                    ...settings.autoSave,
                                    count: newVal,
                                },
                            },
                        });
                    }}
                    value={settings.autoSave.count}
                />
            ),
            description: t('setting.autosaveCount', {
                context: 'description',
            }),
            isHidden: !settings.autoSave.enabled,
            title: t('setting.autosaveCount'),
        },
    ];

    return (
        <SettingsSection
            extra={
                <>
                    <ImageResolutionSettings />
                    <HomeSettings />
                    <ArtistSettings />
                    <ArtistReleaseTypeSettings />
                    <FullscreenPlayerSettings />
                    <PathSettings />
                </>
            }
            options={options}
            title={t('page.setting.application')}
        />
    );
});
