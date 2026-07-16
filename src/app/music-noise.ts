const NOISE_SAMPLE_RATE = 44_100;
const NOISE_DURATION_SECONDS = 10;
const NOISE_CHANNEL_COUNT = 1;
const NOISE_BITS_PER_SAMPLE = 16;
const NOISE_AMPLITUDE = 0.16;
const WAV_HEADER_BYTES = 44;
const INITIAL_RANDOM_SEED = 0x2f9e8f;
const RANDOM_MULTIPLIER = 1_664_525;
const RANDOM_INCREMENT = 1_013_904_223;
const UINT32_RANGE = 4_294_967_296;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function createWhiteNoiseUrl() {
  const sampleCount = NOISE_SAMPLE_RATE * NOISE_DURATION_SECONDS;
  const bytesPerSample = NOISE_BITS_PER_SAMPLE / 8;
  const dataBytes = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, WAV_HEADER_BYTES + dataBytes - 8, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, NOISE_CHANNEL_COUNT, true);
  view.setUint32(24, NOISE_SAMPLE_RATE, true);
  view.setUint32(28, NOISE_SAMPLE_RATE * NOISE_CHANNEL_COUNT * bytesPerSample, true);
  view.setUint16(32, NOISE_CHANNEL_COUNT * bytesPerSample, true);
  view.setUint16(34, NOISE_BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let seed = INITIAL_RANDOM_SEED;
  for (let index = 0; index < sampleCount; index += 1) {
    seed = (seed * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0;
    const normalized = (seed / UINT32_RANGE) * 2 - 1;
    view.setInt16(WAV_HEADER_BYTES + index * bytesPerSample, normalized * NOISE_AMPLITUDE * 32_767, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}
