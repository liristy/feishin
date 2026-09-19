import { useEffect, useRef } from 'react';

import { getPlayerWaveformEnergy } from '/@/renderer/features/player/utils/player-waveform';
import { subscribePlayerStatus, usePlayerStoreBase } from '/@/renderer/store/player.store';
import { useTimestampStoreBase } from '/@/renderer/store/timestamp.store';
import { PlayerStatus } from '/@/shared/types/types';

interface CoverFlowCanvasProps {
    className: string;
    source: string;
}

export const CoverFlowCanvas = ({ className, source }: CoverFlowCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        const artwork = new Image();
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let frame = 0;
        let cancelled = false;
        let lastPaint = -Infinity;
        let time = 0;
        let energy = 0;
        let painted = false;
        let colors: number[][] = [];
        const isPlaying = () =>
            usePlayerStoreBase.getState().player.status === PlayerStatus.PLAYING;

        const paint = (now: number) => {
            if (cancelled || document.hidden) return;
            if (painted && !isPlaying()) return;
            if (isPlaying() && !motion.matches) frame = requestAnimationFrame(paint);
            if (now - lastPaint < 1000 / 24) return;
            const delta = Number.isFinite(lastPaint) ? Math.min(0.1, (now - lastPaint) / 1000) : 0;
            lastPaint = now;
            if (isPlaying() && !motion.matches) {
                const target = getPlayerWaveformEnergy(
                    usePlayerStoreBase.getState().getCurrentSong()?._uniqueId,
                    useTimestampStoreBase.getState().timestamp,
                );
                energy += (target - energy) * (1 - Math.exp(-delta * 5));
                time += delta * 0.24 * (1 + energy * 0.3);
            }
            painted = true;

            context.clearRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = `rgb(${colors[0].join(',')})`;
            context.fillRect(0, 0, canvas.width, canvas.height);
            for (let layer = 0; layer < colors.length; layer++) {
                const phase = (layer * Math.PI) / 2 + Math.PI / 4;
                const x = canvas.width * (0.5 + Math.sin(time * 0.75 + phase) * 0.45);
                const y = canvas.height * (0.5 + Math.cos(time * 0.6 + phase) * 0.5);
                const radius =
                    canvas.width *
                    (0.55 + Math.sin(time * 0.45 + phase) * 0.06) *
                    (1 + energy * 0.06);
                const color = colors[layer].join(',');
                const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
                gradient.addColorStop(0, `rgba(${color},1)`);
                gradient.addColorStop(0.25, `rgba(${color},0.95)`);
                gradient.addColorStop(1, `rgba(${color},0)`);
                context.fillStyle = gradient;
                context.fillRect(0, 0, canvas.width, canvas.height);
            }
        };
        const restart = () => {
            cancelAnimationFrame(frame);
            lastPaint = -Infinity;
            if (!cancelled && !document.hidden && colors.length > 0 && (!painted || isPlaying())) {
                frame = requestAnimationFrame(paint);
            }
        };
        artwork.onload = () => {
            if (cancelled) return;
            const swatch = document.createElement('canvas');
            swatch.width = swatch.height = 64;
            const swatchContext = swatch.getContext('2d');
            if (!swatchContext) return;
            swatchContext.drawImage(artwork, 0, 0, 64, 64);
            const pixels = swatchContext.getImageData(0, 0, 64, 64).data;
            const samples: number[][] = [];
            for (let i = 0; i < pixels.length; i += 28) {
                samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
            }
            // Keep distinct cover colors, including accents outside the center of the artwork.
            colors = [
                samples.reduce((best, color) =>
                    Math.max(...color) - Math.min(...color) > Math.max(...best) - Math.min(...best)
                        ? color
                        : best,
                ),
            ];
            while (colors.length < 4) {
                const distance = (color: number[]) =>
                    Math.min(
                        ...colors.map((selected) =>
                            color.reduce(
                                (sum, channel, index) => sum + (channel - selected[index]) ** 2,
                                0,
                            ),
                        ),
                    );
                colors.push(
                    samples.reduce((best, color) =>
                        distance(color) > distance(best) ? color : best,
                    ),
                );
            }
            colors = colors.map((color, index) =>
                color.map((channel) =>
                    Math.round(index % 2 === 0 ? channel * 0.65 : channel * 0.8 + 24),
                ),
            );
            restart();
        };
        artwork.src = source;
        document.addEventListener('visibilitychange', restart);
        motion.addEventListener('change', restart);
        const unsubscribeStatus = subscribePlayerStatus(restart);

        return () => {
            cancelled = true;
            unsubscribeStatus();
            cancelAnimationFrame(frame);
            artwork.onload = null;
            document.removeEventListener('visibilitychange', restart);
            motion.removeEventListener('change', restart);
        };
    }, [source]);

    return <canvas aria-hidden className={className} height={180} ref={canvasRef} width={320} />;
};
