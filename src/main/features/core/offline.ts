import { app, ipcMain, protocol, shell } from 'electron';
import Store from 'electron-store';
import { parseFile } from 'music-metadata';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';

import log from '/@/main/logger';
import { offlineKey, offlineRange, offlineRelativePath } from '/@/main/utils/offline-files';
import { Song } from '/@/shared/types/domain-types';
import { OfflineEntry, OfflineJob, OfflineSnapshot } from '/@/shared/types/offline';

// Version 1 stores files under their media-library relative path.
type StoredEntry = OfflineEntry & { downloaded?: boolean; layoutVersion?: number };
const index = new Store<{ entries: Record<string, StoredEntry> }>({
    defaults: { entries: {} },
    name: 'offline-library',
});
const entries = new Map(Object.entries(index.get('entries')));
const jobs = new Map<
    string,
    OfflineJob & { controller: AbortController; destination?: string; url?: string }
>();
let active = 0;
const musicDirectory = () => join(app.getPath('music'), 'Feishin');
const persist = () => index.set('entries', Object.fromEntries(entries));
const songSchema = z
    .object({
        _serverId: z.string().min(1).max(512),
        container: z.string().nullable(),
        id: z.string().min(1).max(512),
        name: z.string().min(1).max(2048),
    })
    .passthrough();

protocol.registerSchemesAsPrivileged([
    {
        privileges: {
            corsEnabled: true,
            secure: true,
            standard: true,
            stream: true,
            supportFetchAPI: true,
        },
        scheme: 'feishin-offline',
    },
]);

function enqueue(song: Song, url?: string) {
    const key = offlineKey(song._serverId, song.id);
    const job = jobs.get(key);
    if (job && (job.status === 'queued' || job.status === 'downloading')) return key;
    jobs.set(key, {
        controller: new AbortController(),
        key,
        received: 0,
        song,
        status: 'queued',
        total: 0,
        url,
    });
    pump();
    return key;
}

async function existing(key: string): Promise<null | StoredEntry> {
    const entry = entries.get(key);
    if (!entry) return null;
    // Files may be migrated while a list or playback request checks the old path.
    const info = await stat(entry.path).catch(() => null);
    if (entries.get(key) !== entry) return existing(key);
    if (info?.isFile() && info.size === entry.size && info.size > 0) return entry;
    entries.delete(key);
    persist();
    return null;
}

function pump() {
    for (const job of jobs.values()) {
        if (active >= 2) break;
        if (job.status !== 'queued') continue;
        active++;
        job.status = 'downloading';
        void save(job).finally(() => {
            active--;
            pump();
        });
    }
}

async function save(job: typeof jobs extends Map<string, infer T> ? T : never) {
    let partial: string | undefined;
    try {
        job.status = 'downloading';
        const previous = await existing(job.key);
        if (
            previous?.layoutVersion === 1 &&
            (!job.song.relativePath || job.song.relativePath === previous.song.relativePath)
        ) {
            jobs.delete(job.key);
            return;
        }
        let destination = resolve(musicDirectory(), offlineRelativePath(job.song, job.key));
        if (!destination.startsWith(resolve(musicDirectory()) + sep))
            throw new Error('Invalid download path');
        job.destination = destination;
        const occupied =
            [...entries.values()].some(
                (entry) =>
                    entry.key !== job.key && entry.path.toLowerCase() === destination.toLowerCase(),
            ) ||
            [...jobs.values()].some(
                (other) =>
                    other !== job && other.destination?.toLowerCase() === destination.toLowerCase(),
            ) ||
            (previous?.path !== destination &&
                (await stat(destination).then(
                    () => true,
                    () => false,
                )));
        if (occupied) {
            const extension = extname(destination);
            destination = `${destination.slice(0, destination.length - extension.length)}-${job.key.slice(0, 16)}${extension}`;
        }
        job.destination = destination;
        if (previous?.path === destination) {
            entries.set(job.key, { ...previous, layoutVersion: 1, song: job.song });
            persist();
            jobs.delete(job.key);
            return;
        }
        await mkdir(dirname(destination), { recursive: true });
        partial = `${destination}.${job.key.slice(0, 16)}.part`;
        if (previous) {
            await copyFile(previous.path, partial);
        } else {
            if (!job.url) throw new Error('Local audio unavailable');
            // Chromium decodes UTF-8 response headers, which makes Electron's net.fetch
            // throw outside its promise for non-Latin filenames. Node fetch keeps raw bytes.
            const response = await fetch(job.url, { signal: job.controller.signal });
            if (!response.ok || response.status === 206 || !response.body)
                throw new Error('Download rejected');
            job.total = Number(response.headers.get('content-length')) || 0;
            const meter = new Transform({
                transform(chunk, _encoding, callback) {
                    job.received += chunk.length;
                    callback(null, chunk);
                },
            });
            await pipeline(
                Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
                meter,
                createWriteStream(partial),
                { signal: job.controller.signal },
            );
            if (job.total && job.received !== job.total) throw new Error('Incomplete download');
        }
        job.controller.signal.throwIfAborted();
        const metadata = await parseFile(partial);
        if (!metadata.format.codec || !metadata.format.container)
            throw new Error('Not an audio file');
        const info = await stat(partial);
        if (!info.size) throw new Error('Empty audio file');
        job.controller.signal.throwIfAborted();
        // Never overwrite an unrelated file, including files added outside Feishin.
        await copyFile(partial, destination, constants.COPYFILE_EXCL);
        await unlink(partial);
        partial = undefined;
        entries.set(job.key, {
            key: job.key,
            layoutVersion: 1,
            path: destination,
            savedAt: Date.now(),
            size: info.size,
            song: job.song,
        });
        persist();
        if (previous && previous.path !== destination)
            await unlink(previous.path).catch(() => undefined);
        jobs.delete(job.key);
    } catch (error) {
        if (partial) {
            await unlink(partial).catch(() => undefined);
            partial = undefined;
        }
        job.status = job.controller.signal.aborted ? 'cancelled' : 'failed';
        // Do not log request URLs or transport errors containing server credentials.
        log.warn('Offline audio transfer did not complete', {
            code: (error as NodeJS.ErrnoException)?.code,
            key: job.key,
            status: job.status,
        });
    } finally {
        if (partial) await unlink(partial).catch(() => undefined);
    }
}

ipcMain.handle('offline-save', async (_event, input: unknown) => {
    const request = z.object({ song: songSchema, url: z.string().url() }).parse(input);
    if (!['http:', 'https:'].includes(new URL(request.url).protocol))
        throw new Error('Invalid download URL');
    return enqueue(request.song as Song, request.url);
});

ipcMain.handle('offline-resolve', async (_event, serverId: string, songId: string) => {
    const key = offlineKey(z.string().parse(serverId), z.string().parse(songId));
    const entry = await existing(key);
    return entry ? { path: entry.path, url: `feishin-offline://audio/${key}` } : null;
});

ipcMain.handle('offline-list', async (): Promise<OfflineSnapshot> => {
    await Promise.all([...entries.keys()].map(existing));
    const saved = [...entries.values()];
    return {
        directory: musicDirectory(),
        entries: saved,
        jobs: [...jobs.values()].map(({ key, received, song, status, total }) => ({
            key,
            received,
            song,
            status,
            total,
        })),
    };
});

ipcMain.handle('offline-cancel', (_event, key: string) => {
    const job = jobs.get(key);
    if (!job) return;
    job.controller.abort();
    if (job.status !== 'downloading') jobs.delete(key);
});

ipcMain.handle('offline-remove', async (_event, key: string) => {
    if (jobs.get(key)?.status === 'downloading') throw new Error('Transfer still active');
    const entry = entries.get(key);
    if (!entry) return;
    await unlink(entry.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
    });
    entries.delete(key);
    persist();
});

ipcMain.handle('offline-open-folder', async () => {
    await mkdir(musicDirectory(), { recursive: true });
    return shell.openPath(musicDirectory());
});

void app
    .whenReady()
    .then(() => {
        // Reuse existing files without contacting the server. Failed moves keep their source.
        for (const entry of entries.values()) {
            if (entry.layoutVersion !== 1) enqueue(entry.song);
        }
        protocol.handle('feishin-offline', async (request) => {
            const url = new URL(request.url);
            if (url.host !== 'audio' || !/^\/[a-f0-9]{64}$/.test(url.pathname))
                return new Response(null, { status: 404 });
            const entry = await existing(url.pathname.slice(1));
            if (!entry) return new Response(null, { status: 404 });
            const rangeHeader = request.headers.get('range');
            const range = offlineRange(rangeHeader, entry.size);
            if (!range)
                return new Response(null, {
                    headers: { 'Content-Range': `bytes */${entry.size}` },
                    status: 416,
                });
            const headers = new Headers({
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
                'Content-Length': String(range.end - range.start + 1),
                'Content-Type': 'application/octet-stream',
            });
            if (rangeHeader)
                headers.set('Content-Range', `bytes ${range.start}-${range.end}/${entry.size}`);
            const body =
                request.method === 'HEAD'
                    ? null
                    : (Readable.toWeb(
                          createReadStream(entry.path, range),
                      ) as ReadableStream<Uint8Array>);
            return new Response(body, { headers, status: rangeHeader ? 206 : 200 });
        });
    })
    .catch(() => log.error('Offline media protocol initialization failed'));
