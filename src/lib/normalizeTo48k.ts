const TARGET_RATE = 48000;

/**
 * Renders `source` through OfflineAudioContext at 48 kHz for consistent metering / playback.
 * Multichannel layout is preserved.
 */
export async function normalizeTo48kHz(source: AudioBuffer): Promise<AudioBuffer> {
  if (source.sampleRate === TARGET_RATE) {
    return cloneAudioBuffer(source);
  }
  const length = Math.ceil(source.duration * TARGET_RATE);
  const offline = new OfflineAudioContext(
    source.numberOfChannels,
    length,
    TARGET_RATE,
  );
  const node = offline.createBufferSource();
  node.buffer = source;
  node.connect(offline.destination);
  node.start();
  return offline.startRendering();
}

function cloneAudioBuffer(buf: AudioBuffer): AudioBuffer {
  const out = new AudioBuffer({
    numberOfChannels: buf.numberOfChannels,
    length: buf.length,
    sampleRate: buf.sampleRate,
  });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.copyToChannel(buf.getChannelData(c).slice(), c);
  }
  return out;
}
