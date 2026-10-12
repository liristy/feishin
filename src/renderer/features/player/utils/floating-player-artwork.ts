export async function createFloatingPlayerArtwork(source: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const image = new Image();
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
    const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Artwork canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}
