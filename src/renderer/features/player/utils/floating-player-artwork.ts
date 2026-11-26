export async function createFloatingPlayerArtwork(
    source: string,
    signal: AbortSignal,
    maxSize = 96,
) {
    signal.throwIfAborted();
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
        const abort = () => {
            cleanup();
            image.src = '';
            reject(signal.reason);
        };
        const cleanup = () => {
            signal.removeEventListener('abort', abort);
            image.onload = null;
            image.onerror = null;
        };
        image.onload = () => {
            cleanup();
            resolve();
        };
        image.onerror = () => {
            cleanup();
            reject(new Error('Unable to decode floating player artwork'));
        };
        signal.addEventListener('abort', abort, { once: true });
        image.src = source;
    });
    signal.throwIfAborted();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Artwork canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('Unable to encode player artwork'));
        }, 'image/png');
    });
    signal.throwIfAborted();
    const reader = new FileReader();
    return new Promise<string>((resolve, reject) => {
        const abort = () => reader.abort();
        reader.onloadend = () => {
            signal.removeEventListener('abort', abort);
            if (signal.aborted || reader.error || typeof reader.result !== 'string') {
                reject(signal.reason ?? reader.error ?? new Error('Unable to read player artwork'));
            } else {
                resolve(reader.result);
            }
        };
        signal.addEventListener('abort', abort, { once: true });
        reader.readAsDataURL(blob);
    });
}
