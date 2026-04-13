/**
 * Gemini Native Audio Transcription
 * Gemini APIのネイティブエンドポイントを使用して音声書き起こしを行う
 * OpenAI互換エンドポイントはfile_urlをサポートしていないため、
 * ネイティブGemini APIを直接使用する
 */
import { ENV } from "../_core/env";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiModel = "gemini-2.5-flash" | "gemini-2.0-flash";

interface GeminiTranscribeOptions {
  audioBase64: string;
  mimeType: string;
  systemPrompt: string;
  userText: string;
  model?: GeminiModel;
}

interface GeminiTranscribeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Geminiネイティブ APIを使用して音声を書き起こす
 * inline_data形式でbase64音声を送信する
 */
export async function transcribeWithGemini(
  options: GeminiTranscribeOptions
): Promise<GeminiTranscribeResult> {
  const { audioBase64, mimeType, systemPrompt, userText, model = "gemini-2.5-flash" } = options;

  if (!ENV.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${ENV.geminiApiKey}`;

  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: audioBase64,
            },
          },
          {
            text: userText,
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 32768,
      temperature: 0.1,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000); // 300秒タイムアウト

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      lastError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
      if (attempt < MAX_RETRIES) {
        console.warn(`[geminiTranscribe] Attempt ${attempt} failed (network error), retrying in ${attempt * 2}s...`);
        await new Promise(r => setTimeout(r, attempt * 2000));
        continue;
      }
      clearTimeout(timeoutId);
      throw lastError;
    }

    // 503 Service Unavailable はリトライ対象
    if (response.status === 503 || response.status === 429) {
      const errorText = await response.text();
      lastError = new Error(`Gemini transcribe failed: ${response.status} ${response.statusText} – ${errorText}`);
      if (attempt < MAX_RETRIES) {
        const waitSec = attempt * 3;
        console.warn(`[geminiTranscribe] Attempt ${attempt} got ${response.status}, retrying in ${waitSec}s...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      clearTimeout(timeoutId);
      throw lastError;
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorText = await response.text();
      throw new Error(
        `Gemini transcribe failed: ${response.status} ${response.statusText} – ${errorText}`
      );
    }

    clearTimeout(timeoutId);

    const result = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const inputTokens = result.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0;

    return { text, inputTokens, outputTokens };
  }

  clearTimeout(timeoutId);
  throw lastError ?? new Error("Gemini transcribe failed after all retries");
}
