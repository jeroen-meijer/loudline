/**
 * Decode compressed audio to an AudioBuffer. Pass a copy of the ArrayBuffer
 * (`slice(0)`) if you need the original bytes after decode — decode detaches.
 */
export async function decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    const copy = arrayBuffer.slice(0);
    const buf = await ctx.decodeAudioData(copy);
    return buf;
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function decodeFileToBuffer(file: File): Promise<AudioBuffer> {
  const ab = await file.arrayBuffer();
  return decodeAudioData(ab);
}
