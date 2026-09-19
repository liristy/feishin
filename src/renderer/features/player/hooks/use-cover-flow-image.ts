import { useEffect, useState } from 'react';

import { logger } from '/@/renderer/utils/logger';

// Prepare a small color source once; animation must not filter full-screen artwork every frame.
export const useCoverFlowImage = (
    source: null | string | undefined,
    blur: number,
    fallback?: null | string,
) => {
    const [image, setImage] = useState<null | { blur: number; source: string; url: string }>(null);

    useEffect(() => {
        if (!source) return;

        let cancelled = false;
        let fallbackLoaded = false;
        const artwork = new Image();
        artwork.crossOrigin = 'anonymous';
        const loadFallback = () => {
            if (cancelled) return;
            if (fallback && fallback !== source && !fallbackLoaded) {
                fallbackLoaded = true;
                artwork.src = fallback;
                return;
            }
            logger.warn('Unable to prepare cover flow texture; using the album color');
        };
        artwork.onload = () => {
            if (cancelled) return;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 64;
                const context = canvas.getContext('2d');
                if (!context) throw new Error('Canvas context unavailable');
                context.filter = `blur(${Math.min(12, Math.max(3, blur / 2))}px) saturate(1.8)`;
                context.drawImage(artwork, -4, -4, 72, 72);
                setImage({ blur, source, url: canvas.toDataURL('image/png') });
            } catch {
                loadFallback();
            }
        };
        artwork.onerror = loadFallback;
        artwork.src = source;

        return () => {
            cancelled = true;
            artwork.onload = null;
            artwork.onerror = null;
        };
    }, [blur, fallback, source]);

    return image?.source === source && image?.blur === blur ? image.url : null;
};
