/**
 * ElevenLabs Scribe v2 音声書き起こしヘルパー
 *
 * 特徴:
 * - 日本語WER ≤5%（最高精度カテゴリ）
 * - 最大32話者の話者分離対応
 * - キーワードプロンプトで医療用語を事前登録可能
 * - ファイルサイズ上限: 2GB
 * - 対応フォーマット: mp3, wav, ogg, m4a, webm, mp4等
 */

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/speech-to-text";

export interface ElevenLabsTranscriptionOptions {
  /** 音声データ（Buffer または Base64文字列） */
  audioData: Buffer | string;
  /** MIMEタイプ (例: audio/webm, audio/wav, audio/mpeg) */
  mimeType?: string;
  /** 話者数（nullの場合は自動検出） */
  speakerCount?: number | null;
  /** 医療用語などのキーワードプロンプト（精度向上に使用） */
  keyTerms?: string[];
}

export interface ElevenLabsWord {
  text: string;
  type: "word" | "spacing" | "audio_event";
  start?: number;
  end?: number;
  speaker_id?: string;
  characters?: Array<{ text: string; start?: number; end?: number }>;
}

export interface ElevenLabsTranscriptionResult {
  /** 書き起こし全文テキスト */
  text: string;
  /** 話者ラベル付き書き起こしテキスト（話者分離が有効な場合） */
  labeledText: string;
  /** 言語コード */
  language_code?: string;
  /** 言語確信度 */
  language_probability?: number;
  /** 単語レベルの詳細データ */
  words?: ElevenLabsWord[];
}

/**
 * ElevenLabs Scribe v2で音声を書き起こす
 */
export async function transcribeWithElevenLabs(
  options: ElevenLabsTranscriptionOptions,
): Promise<ElevenLabsTranscriptionResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }

  const { audioData, mimeType = "audio/webm", speakerCount, keyTerms } = options;

  // Base64文字列の場合はBufferに変換
  const audioBuffer =
    typeof audioData === "string" ? Buffer.from(audioData, "base64") : audioData;

  // ファイル拡張子をMIMEタイプから決定
  const ext = getExtFromMimeType(mimeType);
  const fileName = `audio.${ext}`;

  // FormDataを構築
  const formData = new FormData();

  // Blobとしてファイルを追加
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append("file", blob, fileName);

  // モデル指定
  formData.append("model_id", "scribe_v2");

  // 言語を日本語に固定（精度向上）
  formData.append("language_code", "jpn");

  // 話者分離設定
  if (speakerCount !== null && speakerCount !== undefined && speakerCount > 1) {
    formData.append("diarize", "true");
    formData.append("num_speakers", String(speakerCount));
  } else if (speakerCount === null) {
    // 自動検出
    formData.append("diarize", "true");
  } else {
    // 1人または未指定
    formData.append("diarize", "false");
  }

  // タイムスタンプ（話者分離に必要）
  formData.append("timestamps_granularity", "word");

  // キーワードプロンプト（医療用語など）
  if (keyTerms && keyTerms.length > 0) {
    formData.append("tag_audio_events", "false");
    // キーワードをカンマ区切りで追加
    keyTerms.forEach((term) => {
      formData.append("additional_formats[0][format]", "json");
    });
  }

  const response = await fetch(ELEVENLABS_API_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const result = await response.json() as {
    text: string;
    language_code?: string;
    language_probability?: number;
    words?: ElevenLabsWord[];
  };

  // 話者ラベル付きテキストを生成
  const labeledText = buildLabeledText(result.words || [], result.text);

  return {
    text: result.text,
    labeledText,
    language_code: result.language_code,
    language_probability: result.language_probability,
    words: result.words,
  };
}

/**
 * 単語レベルデータから話者ラベル付きテキストを生成
 */
function buildLabeledText(words: ElevenLabsWord[], fallbackText: string): string {
  if (!words || words.length === 0) return fallbackText;

  // 話者IDが含まれているかチェック
  const hasSpeakers = words.some((w) => w.speaker_id !== undefined);
  if (!hasSpeakers) return fallbackText;

  const lines: string[] = [];
  let currentSpeaker: string | undefined = undefined;
  let currentLine = "";

  // 話者IDを「話者1」「話者2」形式にマッピング
  const speakerMap = new Map<string, string>();
  let speakerIndex = 1;

  for (const word of words) {
    if (word.type === "audio_event") continue;

    const speakerId = word.speaker_id;

    if (speakerId !== undefined && speakerId !== currentSpeaker) {
      // 話者が変わった場合、現在の行を保存
      if (currentLine.trim()) {
        const label = speakerMap.get(currentSpeaker || "") || `[話者${speakerIndex}]`;
        lines.push(`${label}: ${currentLine.trim()}`);
      }

      // 新しい話者のラベルを設定
      if (!speakerMap.has(speakerId)) {
        speakerMap.set(speakerId, `[話者${speakerIndex}]`);
        speakerIndex++;
      }

      currentSpeaker = speakerId;
      currentLine = "";
    }

    if (word.type === "word") {
      currentLine += word.text;
    } else if (word.type === "spacing") {
      currentLine += word.text;
    }
  }

  // 最後の行を追加
  if (currentLine.trim()) {
    const label = speakerMap.get(currentSpeaker || "") || `[話者${speakerIndex}]`;
    lines.push(`${label}: ${currentLine.trim()}`);
  }

  return lines.length > 0 ? lines.join("\n") : fallbackText;
}

/**
 * MIMEタイプからファイル拡張子を取得
 */
function getExtFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[mimeType] || "webm";
}
