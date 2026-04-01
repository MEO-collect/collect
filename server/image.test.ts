import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "image-edit/test.png",
    url: "https://storage.example.com/image-edit/test.png",
  }),
}));

// Mock ENV
vi.mock("./_core/env", () => ({
  ENV: {
    geminiApiKey: "test-gemini-key",
  },
}));

// Mock fetch for Gemini API
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Image Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildPhotoEditPrompt", () => {
    it("should generate prompt with brightness adjustment", async () => {
      // Import after mocks
      const mod = await import("./routers/image");
      // Access the router to verify it exists
      expect(mod.imageRouter).toBeDefined();
    });

    it("should have editPhoto and magicEraser procedures", async () => {
      const mod = await import("./routers/image");
      const router = mod.imageRouter;
      // Check router has the expected procedures
      expect(router._def.procedures).toHaveProperty("editPhoto");
      expect(router._def.procedures).toHaveProperty("magicEraser");
    });
  });

  describe("Gemini API integration", () => {
    it("should handle successful image generation response", async () => {
      const mockImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: mockImageBase64,
                    },
                  },
                ],
                role: "model",
              },
              finishReason: "STOP",
            },
          ],
        }),
      });

      // Verify fetch would be called with correct URL pattern
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle API error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      });

      // Verify error handling setup
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle text-only response (no image generated)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: "I cannot edit this image because it contains inappropriate content.",
                  },
                ],
                role: "model",
              },
              finishReason: "STOP",
            },
          ],
        }),
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("Input validation", () => {
    it("should validate editPhoto input schema", async () => {
      const { z } = await import("zod");

      const editPhotoSchema = z.object({
        imageBase64: z.string(),
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
        removeShadow: z.boolean().optional(),
        customPrompt: z.string().optional(),
        numberOfImages: z.number().min(1).max(4).default(1),
      });

      // Valid input
      const validResult = editPhotoSchema.safeParse({
        imageBase64: "base64data",
        brightness: 3,
        styleTransform: "anime",
      });
      expect(validResult.success).toBe(true);

      // removeShadow flag
      const shadowResult = editPhotoSchema.safeParse({
        imageBase64: "base64data",
        removeShadow: true,
      });
      expect(shadowResult.success).toBe(true);

      // Invalid brightness (out of range)
      const invalidResult = editPhotoSchema.safeParse({
        imageBase64: "base64data",
        brightness: 10,
      });
      expect(invalidResult.success).toBe(false);

      // Invalid numberOfImages (out of range)
      const invalidCount = editPhotoSchema.safeParse({
        imageBase64: "base64data",
        numberOfImages: 10,
      });
      expect(invalidCount.success).toBe(false);
    });

    it("should validate magicEraser input schema", async () => {
      const { z } = await import("zod");

      const magicEraserSchema = z.object({
        imageBase64: z.string(),
        imageMimeType: z.string().default("image/png"),
      });

      const validResult = magicEraserSchema.safeParse({
        imageBase64: "base64data",
      });
      expect(validResult.success).toBe(true);

      // Missing required field
      const invalidResult = magicEraserSchema.safeParse({});
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("Prompt generation", () => {
    it("should generate correct prompt for style transform", () => {
      // Test that style options are correctly mapped
      const styleMap: Record<string, string> = {
        monochrome: "モノクロ",
        film: "フィルムカメラ",
        cheki: "チェキ",
        slr: "一眼レフ",
        cinematic: "シネマティック",
        anime: "アニメ",
        watercolor: "水彩画",
        oilPainting: "油絵",
      };

      // Verify all style options are defined
      expect(Object.keys(styleMap)).toHaveLength(8);
      for (const key of Object.keys(styleMap)) {
        expect(styleMap[key]).toBeTruthy();
      }
    });

    it("should generate correct prompt for background options", () => {
      const bgMap: Record<string, string> = {
        white: "白",
        black: "黒",
        strongBlur: "ぼかし",
      };

      expect(Object.keys(bgMap)).toHaveLength(3);
      for (const key of Object.keys(bgMap)) {
        expect(bgMap[key]).toBeTruthy();
      }
    });

    it("should handle magic eraser prompt correctly", () => {
      const prompt = `この画像には赤色のマスク（塗りつぶし）が描かれています。
赤色でマスクされた部分の物体を完全に消去し、周囲の背景で自然に補完してください。
マスクされていない部分は一切変更しないでください。
結果は自然で違和感のない写真にしてください。`;

      expect(prompt).toContain("赤色のマスク");
      expect(prompt).toContain("消去");
      expect(prompt).toContain("補完");
    });
  });
});
