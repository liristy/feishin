// Reuse the waveform's decoded audio; never open another stream for the background.
let waveform: undefined | { audio: AudioBuffer; songId: string };

export const setPlayerWaveform = (songId: string, audio: AudioBuffer) => {
    const current = { audio, songId };
    waveform = current;
    return () => {
        if (waveform === current) waveform = undefined;
    };
};

export const getPlayerWaveformEnergy = (songId: string | undefined, timestamp: number) => {
    if (!waveform || waveform.songId !== songId || !Number.isFinite(timestamp) || timestamp < 0) {
        return 0;
    }
    const { audio } = waveform;
    const start = Math.floor(timestamp * audio.sampleRate);
    const end = Math.min(audio.length, start + Math.ceil(audio.sampleRate * 0.08));
    const stride = Math.max(1, Math.floor((end - start) / 128));
    let sum = 0;
    let count = 0;
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        const samples = audio.getChannelData(channel);
        for (let i = start; i < end; i += stride) {
            sum += samples[i] ** 2;
            count++;
        }
    }
    return count ? Math.min(1, Math.sqrt(sum / count) * 2.5) : 0;
};
