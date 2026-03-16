/**
 * audioSplitter.ts
 * AudioContext API を使って音声 Blob を時間単位で分割するユーティリティ
 *
 * 分割方式:
 *   1. Blob → ArrayBuffer → AudioContext.decodeAudioData でデコード
 *   2. OfflineAudioContext で各チャンクをレンダリング
 *   3. WAV エンコードして Blob に変換
 *
 * 注意: ブラウザの AudioContext は PCM データを扱うため、
 *       出力は常に audio/wav になります。
 */

/** 1チャンクあたりの最大バイト数（デフォルト 12MB = 余裕を持って 15MB 制限以下） */
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;

/** 1チャンクあたりの最大秒数（デフォルト 10分） */
const DEFAULT_CHUNK_SECONDS = 600;

export interface AudioChunk {
  blob: Blob;
  startSec: number;
  endSec: number;
  index: number;
  total: number;
}

/**
 * WAV ファイルのヘッダーを書き込む
 */
function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // インターリーブ PCM サンプル
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = audioBuffer.getChannelData(ch)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * AudioBuffer の一部（startSample〜endSample）を切り出して WAV Blob を返す
 */
async function sliceAudioBuffer(
  audioBuffer: AudioBuffer,
  startSample: number,
  endSample: number,
): Promise<Blob> {
  const length = endSample - startSample;
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    length,
    audioBuffer.sampleRate,
  );

  const source = offlineCtx.createBufferSource();
  // スライス用の新しい AudioBuffer を作成
  const sliced = offlineCtx.createBuffer(
    audioBuffer.numberOfChannels,
    length,
    audioBuffer.sampleRate,
  );
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    sliced.copyToChannel(
      audioBuffer.getChannelData(ch).slice(startSample, endSample),
      ch,
    );
  }
  source.buffer = sliced;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  const wavBuffer = encodeWav(rendered);
  return new Blob([wavBuffer], { type: "audio/wav" });
}

/**
 * 音声 Blob を分割する
 *
 * @param blob 元の音声 Blob
 * @param maxBytesPerChunk 1チャンクあたりの最大バイト数（デフォルト 12MB）
 * @param maxSecondsPerChunk 1チャンクあたりの最大秒数（デフォルト 600秒=10分）
 * @param onProgress 進捗コールバック（0〜1）
 * @returns AudioChunk の配列
 */
export async function splitAudioBlob(
  blob: Blob,
  maxBytesPerChunk: number = DEFAULT_MAX_BYTES,
  maxSecondsPerChunk: number = DEFAULT_CHUNK_SECONDS,
  onProgress?: (progress: number, message: string) => void,
): Promise<AudioChunk[]> {
  onProgress?.(0, "音声データをデコード中...");

  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  const totalSamples = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const totalDuration = audioBuffer.duration;

  // 1チャンクあたりのサンプル数を計算
  // WAV のサイズ = サンプル数 × チャンネル数 × 2バイト（16bit）
  const bytesPerSample = audioBuffer.numberOfChannels * 2;
  const maxSamplesByBytes = Math.floor(maxBytesPerChunk / bytesPerSample);
  const maxSamplesBySeconds = Math.floor(maxSecondsPerChunk * sampleRate);
  const samplesPerChunk = Math.min(maxSamplesByBytes, maxSamplesBySeconds);

  // チャンク数を計算
  const totalChunks = Math.ceil(totalSamples / samplesPerChunk);

  if (totalChunks === 1) {
    // 分割不要（元の Blob をそのまま返す）
    onProgress?.(1, "分割不要");
    return [
      {
        blob,
        startSec: 0,
        endSec: totalDuration,
        index: 0,
        total: 1,
      },
    ];
  }

  const chunks: AudioChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const startSample = i * samplesPerChunk;
    const endSample = Math.min(totalSamples, (i + 1) * samplesPerChunk);
    const startSec = startSample / sampleRate;
    const endSec = endSample / sampleRate;

    onProgress?.(
      i / totalChunks,
      `音声を分割中... (${i + 1}/${totalChunks})`,
    );

    const chunkBlob = await sliceAudioBuffer(audioBuffer, startSample, endSample);

    chunks.push({
      blob: chunkBlob,
      startSec,
      endSec,
      index: i,
      total: totalChunks,
    });
  }

  onProgress?.(1, "分割完了");
  return chunks;
}

/**
 * Blob を Base64 文字列に変換する
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 音声 Blob のサイズが分割不要かどうかを判定する
 */
export function needsSplitting(blob: Blob, maxBytes: number = DEFAULT_MAX_BYTES): boolean {
  return blob.size > maxBytes;
}
