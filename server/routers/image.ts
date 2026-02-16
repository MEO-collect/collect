import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { ENV } from "../_core/env";

/**
 * Gemini 画像生成・編集 API ヘルパー
 * gemini-2.5-flash-preview-05-20 を使用して画像編集を行う
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
    role: string;
  };
  finishReason: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message: string; code: number };
}

async function callGeminiImageEdit(
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
  numberOfImages: number = 1
): Promise<{ images: string[]; textResponse?: string }> {
  const apiKey = ENV.geminiApiKey;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = "gemini-2.0-flash-exp";
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: imageMimeType,
            data: imageBase64,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  ];

  const generatedImages: string[] = [];
  let textResponse: string | undefined;

  // Generate images one at a time (Gemini returns one image per call)
  const attempts = Math.min(numberOfImages, 4);

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            temperature: 1.0,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ImageEdit] Gemini API error (attempt ${i + 1}):`, errorText);
        // If first attempt fails, throw; otherwise continue with what we have
        if (i === 0) {
          throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }
        continue;
      }

      const result: GeminiResponse = await response.json();

      if (result.error) {
        console.error(`[ImageEdit] Gemini error:`, result.error.message);
        if (i === 0) {
          throw new Error(`Gemini API error: ${result.error.message}`);
        }
        continue;
      }

      if (result.candidates && result.candidates.length > 0) {
        const parts = result.candidates[0].content.parts;
        for (const part of parts) {
          if (part.inlineData) {
            // Upload to S3
            const buffer = Buffer.from(part.inlineData.data, "base64");
            const ext = part.inlineData.mimeType.includes("png") ? "png" : "jpg";
            const randomSuffix = Math.random().toString(36).substring(2, 10);
            const { url: imageUrl } = await storagePut(
              `image-edit/${Date.now()}-${randomSuffix}.${ext}`,
              buffer,
              part.inlineData.mimeType
            );
            generatedImages.push(imageUrl);
          } else if (part.text && !textResponse) {
            textResponse = part.text;
          }
        }
      }
    } catch (err) {
      console.error(`[ImageEdit] Error on attempt ${i + 1}:`, err);
      if (i === 0 && generatedImages.length === 0) {
        throw err;
      }
    }
  }

  if (generatedImages.length === 0 && textResponse) {
    throw new Error(`画像の生成に失敗しました。AIからのメッセージ: ${textResponse}`);
  }

  if (generatedImages.length === 0) {
    throw new Error("画像の生成に失敗しました。もう一度お試しください。");
  }

  return { images: generatedImages, textResponse };
}

/**
 * フォトエディター用のプロンプト生成
 */
function buildPhotoEditPrompt(params: {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
  enhanceQuality?: boolean;
  backgroundBlur?: boolean;
  backgroundType?: string;
  styleTransform?: string;
  angleChange?: string;
  locationChange?: string;
  removeWires?: boolean;
  removePeople?: boolean;
  customPrompt?: string;
}): string {
  const instructions: string[] = [];

  // Basic adjustments
  if (params.brightness && params.brightness !== 0) {
    const dir = params.brightness > 0 ? "明るく" : "暗く";
    instructions.push(`画像を${Math.abs(params.brightness) * 10}%${dir}してください`);
  }
  if (params.contrast && params.contrast !== 0) {
    const dir = params.contrast > 0 ? "高く" : "低く";
    instructions.push(`コントラストを${Math.abs(params.contrast) * 10}%${dir}してください`);
  }
  if (params.saturation && params.saturation !== 0) {
    const dir = params.saturation > 0 ? "鮮やかに" : "淡く";
    instructions.push(`彩度を${Math.abs(params.saturation) * 10}%${dir}してください`);
  }
  if (params.sharpness && params.sharpness !== 0) {
    instructions.push(`シャープネスを${Math.abs(params.sharpness) * 10}%強めてください`);
  }
  if (params.enhanceQuality) {
    instructions.push("画質を最大限に向上させ、ノイズを除去し、ディテールを鮮明にしてください");
  }

  // Portrait / Background
  if (params.backgroundBlur) {
    instructions.push("背景を美しくぼかし、被写体を際立たせるポートレート風に加工してください");
  }
  if (params.backgroundType) {
    const bgMap: Record<string, string> = {
      white: "背景を純白に変更してください",
      black: "背景を黒に変更してください",
      strongBlur: "背景を強力にぼかしてください（ガウスぼかし強め）",
    };
    if (bgMap[params.backgroundType]) {
      instructions.push(bgMap[params.backgroundType]);
    }
  }
  if (params.removeWires) {
    instructions.push("画像内の電線・電柱を自然に消去してください");
  }
  if (params.removePeople) {
    instructions.push("画像内の不要な人物を自然に消去し、背景を補完してください");
  }

  // Style transforms
  if (params.styleTransform) {
    const styleMap: Record<string, string> = {
      monochrome: "モノクロ（白黒）写真に変換してください",
      film: "フィルムカメラで撮影したようなレトロな質感に加工してください（粒子感、色褪せ、ビネット）",
      cheki: "チェキ（インスタントカメラ）風の柔らかく温かみのある写真に加工してください",
      slr: "高級一眼レフカメラで撮影したような高品質な写真に加工してください（ボケ味、色の深み）",
      cinematic: "映画のワンシーンのようなシネマティックな雰囲気に加工してください（レターボックス、色調補正）",
      anime: "アニメ・イラスト風に変換してください",
      watercolor: "水彩画風に変換してください",
      oilPainting: "油絵風に変換してください",
    };
    if (styleMap[params.styleTransform]) {
      instructions.push(styleMap[params.styleTransform]);
    }
  }

  // Angle / Location
  if (params.angleChange) {
    instructions.push(`撮影アングルを「${params.angleChange}」に変更してください`);
  }
  if (params.locationChange) {
    instructions.push(`背景のロケーションを「${params.locationChange}」に変更してください`);
  }

  // Custom prompt
  if (params.customPrompt) {
    instructions.push(params.customPrompt);
  }

  if (instructions.length === 0) {
    return "この画像を高品質に改善してください";
  }

  return `以下の指示に従って画像を編集してください。元の画像の構図と被写体はできるだけ維持してください。\n\n${instructions.join("\n")}`;
}

/**
 * マジック消しゴム用のプロンプト生成
 */
function buildMagicEraserPrompt(): string {
  return `この画像には赤色のマスク（塗りつぶし）が描かれています。
赤色でマスクされた部分の物体を完全に消去し、周囲の背景で自然に補完してください。
マスクされていない部分は一切変更しないでください。
結果は自然で違和感のない写真にしてください。`;
}

export const imageRouter = router({
  /**
   * フォトエディター: 画像を編集パラメータに基づいて加工
   */
  editPhoto: protectedProcedure
    .input(z.object({
      imageBase64: z.string().describe("Base64エンコードされた画像データ"),
      imageMimeType: z.string().default("image/jpeg"),
      brightness: z.number().min(-5).max(5).optional(),
      contrast: z.number().min(-5).max(5).optional(),
      saturation: z.number().min(-5).max(5).optional(),
      sharpness: z.number().min(-5).max(5).optional(),
      enhanceQuality: z.boolean().optional(),
      backgroundBlur: z.boolean().optional(),
      backgroundType: z.string().optional(),
      styleTransform: z.string().optional(),
      angleChange: z.string().optional(),
      locationChange: z.string().optional(),
      removeWires: z.boolean().optional(),
      removePeople: z.boolean().optional(),
      customPrompt: z.string().optional(),
      numberOfImages: z.number().min(1).max(4).default(1),
    }))
    .mutation(async ({ input }) => {
      const { imageBase64, imageMimeType, numberOfImages, ...editParams } = input;

      const prompt = buildPhotoEditPrompt(editParams);
      console.log("[ImageEdit] Photo edit prompt:", prompt);

      const result = await callGeminiImageEdit(
        prompt,
        imageBase64,
        imageMimeType,
        numberOfImages
      );

      return {
        images: result.images,
        prompt,
        textResponse: result.textResponse,
      };
    }),

  /**
   * マジック消しゴム: マスク付き画像から物体を消去
   */
  magicEraser: protectedProcedure
    .input(z.object({
      imageBase64: z.string().describe("マスク付きのBase64エンコードされた画像データ"),
      imageMimeType: z.string().default("image/png"),
    }))
    .mutation(async ({ input }) => {
      const { imageBase64, imageMimeType } = input;

      const prompt = buildMagicEraserPrompt();
      console.log("[ImageEdit] Magic eraser prompt:", prompt);

      const result = await callGeminiImageEdit(
        prompt,
        imageBase64,
        imageMimeType,
        1
      );

      return {
        images: result.images,
        prompt,
        textResponse: result.textResponse,
      };
    }),
});
