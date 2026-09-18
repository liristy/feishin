/* eslint-disable perfectionist/sort-imports */
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import 'overlayscrollbars/overlayscrollbars.css';
import '/styles/overlayscrollbars.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import isElectron from 'is-electron';
import { lazy, memo, Suspense, useEffect, useMemo, useState } from 'react';

import i18n from '/@/i18n/i18n';
import { WebAudioContext } from '/@/renderer/features/player/context/webaudio-context';
import { useCheckForUpdates } from '/@/renderer/hooks/use-check-for-updates';
import { useFullscreenAutoOpen } from '/@/renderer/hooks/use-fullscreen-auto-open';
import { useFullscreenToggle } from '/@/renderer/hooks/use-fullscreen-toggle';
import { useNativeMenuSync } from '/@/renderer/hooks/use-native-menu-sync';
import { useSyncSettingsToMain } from '/@/renderer/hooks/use-sync-settings-to-main';
import { AppRouter } from '/@/renderer/router/app-router';
import { useHotkeySettings, useLanguage } from '/@/renderer/store';
import { initCustomThemes } from '/@/renderer/store/custom-themes.store';
import { useAppTheme } from '/@/renderer/themes/use-app-theme';
import { WebAudio } from '/@/shared/types/types';
import '/@/shared/styles/global.css';
import { PlayerProvider } from '/@/renderer/features/player/context/player-context';
import { AudioPlayers } from '/@/renderer/features/player/components/audio-players';
import { ReleaseNotesModal } from '/@/renderer/release-notes-modal';

const UpdateAvailableDialog = lazy(() =>
    import('./update-available-dialog').then((module) => ({
        default: module.UpdateAvailableDialog,
    })),
);

const ipc = isElectron() ? window.api.ipc : null;

export const App = () => {
    // Custom themes must be loaded (and registered into the shared theme
    // registry) before the first render of ThemedApp, otherwise a user whose
    // selected theme is a custom one would flash the default theme first.
    const [customThemesReady, setCustomThemesReady] = useState(!isElectron());

    useEffect(() => {
        if (!isElectron()) return;

        initCustomThemes()
            .catch((error) => console.error('Failed to load custom themes', error))
            .finally(() => setCustomThemesReady(true));
    }, []);

    if (!customThemesReady) {
        return null;
    }

    return <ThemedApp />;
};

const ThemedApp = () => {
    const { mode, theme } = useAppTheme();

    return (
        <MantineProvider forceColorScheme={mode} theme={theme}>
            <AppShell />
        </MantineProvider>
    );
};

const AppShell = memo(function AppShell() {
    const [webAudio, setWebAudio] = useState<WebAudio>();

    const webAudioProvider = useMemo(() => {
        return { setWebAudio, webAudio };
    }, [webAudio]);

    const notificationStyles = useMemo(
        () => ({
            root: {
                marginBottom: 90,
            },
        }),
        [],
    );

    return (
        <>
            <AppEffects />
            <Notifications
                containerWidth="300px"
                position="bottom-center"
                styles={notificationStyles}
                zIndex={50000}
            />
            <WebAudioContext.Provider value={webAudioProvider}>
                <PlayerProvider>
                    <AudioPlayers />
                    <AppRouter />
                </PlayerProvider>
            </WebAudioContext.Provider>
            <ReleaseNotesModal />
            <Suspense fallback={null}>
                <UpdateAvailableDialog />
            </Suspense>
        </>
    );
});

const AppEffects = () => (
    <>
        <SyncSettingsEffect />
        <UpdateCheckEffect />
        <GlobalShortcutsEffect />
        <LanguageEffect />
        <NativeMenuSyncEffect />
        <FullscreenToggleEffect />
        <FullscreenAutoOpenEffect />
        <InputFocusEffect />
    </>
);

const SyncSettingsEffect = () => {
    useSyncSettingsToMain();

    return null;
};

const UpdateCheckEffect = () => {
    useCheckForUpdates();

    return null;
};

const GlobalShortcutsEffect = () => {
    const { bindings } = useHotkeySettings();

    useEffect(() => {
        if (isElectron()) {
            ipc?.send('set-global-shortcuts', bindings);
        }
    }, [bindings]);

    return null;
};

const LanguageEffect = () => {
    const language = useLanguage();

    useEffect(() => {
        if (language) {
            i18n.changeLanguage(language);
        }
    }, [language]);

    return null;
};

const NativeMenuSyncEffect = () => {
    useNativeMenuSync();

    return null;
};

const FullscreenToggleEffect = () => {
    useFullscreenToggle();

    return null;
};

const FullscreenAutoOpenEffect = () => {
    useFullscreenAutoOpen();

    return null;
};

const InputFocusEffect = () => {
    useEffect(() => {
        if (!isElectron()) return;

        const handleFocusIn = (e: FocusEvent) => {
            const target = e.target as Element | null;
            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                (target instanceof HTMLElement && target.isContentEditable)
            ) {
                window.api?.utils?.setInputFocused?.(true);
            }
        };

        const handleFocusOut = (e: FocusEvent) => {
            const related = e.relatedTarget as Element | null;
            if (
                related instanceof HTMLInputElement ||
                related instanceof HTMLTextAreaElement ||
                (related instanceof HTMLElement && related.isContentEditable)
            ) {
                return;
            }
            window.api?.utils?.setInputFocused?.(false);
        };

        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('focusout', handleFocusOut);

        return () => {
            document.removeEventListener('focusin', handleFocusIn);
            document.removeEventListener('focusout', handleFocusOut);
        };
    }, []);

    return null;
};
