import { z } from 'zod';

const label = z.string().max(512);
export const FLOATING_PLAYER_WIDTH = 420;
export const FLOATING_PLAYER_HEIGHT = 104;
export const FLOATING_PLAYER_PANEL_HEIGHT = 288;
export const FLOATING_PLAYER_LYRICS_HEIGHT = 64;
export const FLOATING_PLAYER_TRANSITION_MS = 240;
export type FloatingPlayerPanel = 'lyrics' | 'queue' | null;

export const FloatingPlayerStateSchema = z.object({
    artist: label,
    artwork: z
        .string()
        .max(4 * 1024 * 1024)
        .regex(/^(data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)?$/),
    canSkip: z.boolean(),
    currentLyric: z.number().int().min(-1).default(-1),
    currentSongId: label.default(''),
    hasMedia: z.boolean(),
    labels: z.object({
        collapse: label.default('Close'),
        disable: label,
        drag: label,
        empty: label,
        loading: label.default('Loading'),
        lyrics: label.default('Lyrics'),
        mute: label,
        next: label,
        noLyrics: label.default('No lyrics found'),
        open: label,
        pause: label,
        play: label,
        previous: label,
        queue: label.default('Play queue'),
        reset: label,
        volume: label,
    }),
    lyricDurationMs: z.number().finite().min(0).max(600000).default(0),
    lyrics: z.array(z.string().max(2048)).max(5000).default([]),
    lyricsLoading: z.boolean().default(false),
    panel: z.enum(['lyrics', 'queue']).nullable().default(null),
    playing: z.boolean(),
    queue: z
        .array(z.object({ artist: label, id: label, title: label }))
        .max(10000)
        .default([]),
    theme: z.object({
        background: z.string().max(256),
        blur: z.number().finite().min(0).max(100).default(1.5),
        border: z.string().max(256),
        dynamicBackground: z.boolean().default(true),
        dynamicIsImage: z.boolean().default(false),
        foreground: z.string().max(256),
        opacity: z.number().finite().min(0).max(100).default(25),
    }),
    title: label,
    volume: z.number().finite().min(0).max(100),
});

export type FloatingPlayerState = z.infer<typeof FloatingPlayerStateSchema>;
