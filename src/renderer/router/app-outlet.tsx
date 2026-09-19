import { useEffect, useMemo } from 'react';
import { Navigate, Outlet } from 'react-router';
import { shallow } from 'zustand/shallow';

import { api } from '/@/renderer/api';
import { normalizeServerUrl } from '/@/renderer/features/action-required/utils/server-lock';
import { isServerLock } from '/@/renderer/features/action-required/utils/window-properties';
import { AppRoute } from '/@/renderer/router/routes';
import { useAuthStore, useAuthStoreActions } from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { ServerType } from '/@/shared/types/domain-types';

export const AppOutlet = () => {
    const currentServer = useAuthStore(
        (state) =>
            state.currentServer
                ? {
                      credential: state.currentServer.credential,
                      id: state.currentServer.id,
                      ndCredential: state.currentServer.ndCredential,
                      type: state.currentServer.type,
                      url: state.currentServer.url,
                      version: state.currentServer.version,
                  }
                : null,
        shallow,
    );
    const { setCurrentServer, updateServer } = useAuthStoreActions();

    // Fetch capabilities only for new connections. Saved sessions never wait for a probe.
    useEffect(() => {
        if (!currentServer?.credential || currentServer.version || !navigator.onLine) return;
        let cancelled = false;
        void api.controller
            .getServerInfo({ apiClientProps: { serverId: currentServer.id } })
            .then((info) => {
                if (!cancelled && info)
                    updateServer(currentServer.id, {
                        features: info.features,
                        version: info.version,
                    });
            })
            .catch(() => logger.debug('Server capabilities unavailable; using saved connection'));
        return () => {
            cancelled = true;
        };
    }, [currentServer?.credential, currentServer?.id, currentServer?.version, updateServer]);

    const hasServerLockMismatch = useMemo(() => {
        if (!isServerLock() || !currentServer || !window.SERVER_URL) {
            return false;
        }

        const configuredUrl = normalizeServerUrl(window.SERVER_URL);
        const persistedUrl = normalizeServerUrl(currentServer.url);

        return configuredUrl !== persistedUrl;
    }, [currentServer]);

    const hasMissingCredentials = Boolean(
        currentServer &&
        (!currentServer.credential ||
            (currentServer.type === ServerType.NAVIDROME && !currentServer.ndCredential)),
    );

    useEffect(() => {
        if (hasServerLockMismatch && currentServer && window.SERVER_URL) {
            updateServer(currentServer.id, {
                url: normalizeServerUrl(window.SERVER_URL),
            });
            setCurrentServer(null);
        }
    }, [currentServer, hasServerLockMismatch, setCurrentServer, updateServer]);

    // Clear selection when credentials were wiped but currentServer was left set
    useEffect(() => {
        if (hasMissingCredentials) {
            setCurrentServer(null);
        }
    }, [currentServer?.id, currentServer?.type, hasMissingCredentials, setCurrentServer]);

    const isActionsRequired = !currentServer || hasServerLockMismatch || hasMissingCredentials;

    if (isActionsRequired) {
        return <Navigate replace to={AppRoute.ACTION_REQUIRED} />;
    }

    return <Outlet />;
};
