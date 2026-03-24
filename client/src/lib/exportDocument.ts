/**
 * カルテ・議事録のPDF/PNG出力ユーティリティ
 *
 * PNG: dom-to-image-more の onclone コールバックを使用
 *   - A4比率（794×1123px）でラップしてキャプチャ
 *   - 枠線なし・区切り線デザイン
 *   - OKLCH / backdrop-filter / Google Fonts に完全対応
 *
 * PDF: ブラウザの印刷ダイアログ経由（日本語・スタイル完全対応）
 */
import domtoimage from "dom-to-image-more";

/** A4比率ラッパーを作成して内容をクローンし、書き出し用スタイルを適用 */
function buildPrintWrapper(sourceElement: HTMLElement): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = [
    "width:794px",
    "min-height:1123px",
    "padding:48px 56px",
    "background:#ffffff",
    "color:#1a1a1a",
    "box-sizing:border-box",
    "font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Meiryo','Yu Gothic',sans-serif",
    "font-size:13px",
    "line-height:1.7",
    "position:absolute",
    "top:-99999px",
    "left:-99999px",
  ].join(";");

  // 内容をコピー
  wrapper.innerHTML = sourceElement.innerHTML;

  // 全要素にインラインスタイルを適用（外部CSSに依存しない）
  applyPrintStyles(wrapper);

  document.body.appendChild(wrapper);
  return wrapper;
}

/** 書き出し用インラインスタイルを再帰的に適用 */
function applyPrintStyles(root: HTMLElement): void {
  // backdrop-filter・box-shadow・枠線を除去
  root.style.backdropFilter = "none";
  (root.style as unknown as Record<string, string>)["-webkit-backdrop-filter"] = "none";
  root.style.boxShadow = "none";
  root.style.borderRadius = "0";
  root.style.background = "#ffffff";

  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();

    // backdrop-filter・box-shadow を除去
    el.style.backdropFilter = "none";
    (el.style as unknown as Record<string, string>)["-webkit-backdrop-filter"] = "none";
    el.style.boxShadow = "none";
    el.style.borderRadius = "0";

    // 半透明背景を白に
    const computed = window.getComputedStyle(el);
    const bg = computed.backgroundColor;
    if (bg && bg.includes("rgba")) {
      el.style.background = "#ffffff";
      el.style.backgroundColor = "#ffffff";
    }

    // Google Fonts link を削除
    if (tag === "link") {
      const href = el.getAttribute("href") || "";
      if (href.includes("fonts.googleapis.com") || href.includes("fonts.gstatic.com")) {
        el.remove();
        return;
      }
    }

    // h1：太い下線
    if (tag === "h1") {
      el.style.cssText += ";font-size:16px;font-weight:700;border-bottom:2px solid #374151;padding-bottom:6px;margin-bottom:16px;margin-top:0;color:#1a1a1a;background:transparent;";
    }

    // h2：青い下線
    if (tag === "h2") {
      el.style.cssText += ";font-size:14px;font-weight:700;color:#1e3a5f;border-bottom:1.5px solid #93c5fd;padding-bottom:3px;margin-top:20px;margin-bottom:8px;background:transparent;";
    }

    // h3：左ボーダー
    if (tag === "h3") {
      el.style.cssText += ";font-size:13px;font-weight:600;border-left:3px solid #93c5fd;padding-left:8px;margin-top:12px;margin-bottom:4px;background:transparent;";
    }

    // p：余白を詰める
    if (tag === "p") {
      el.style.marginTop = "2px";
      el.style.marginBottom = "2px";
    }

    // ul/ol
    if (tag === "ul" || tag === "ol") {
      el.style.marginTop = "2px";
      el.style.marginBottom = "2px";
      el.style.paddingLeft = "18px";
    }

    // li
    if (tag === "li") {
      el.style.marginTop = "1px";
      el.style.marginBottom = "1px";
    }

    // table
    if (tag === "table") {
      el.style.cssText += ";width:100%;border-collapse:collapse;font-size:12px;margin:6px 0;";
    }

    // th
    if (tag === "th") {
      el.style.cssText += ";background:#f1f5f9;border:1px solid #cbd5e1;padding:4px 8px;text-align:left;font-weight:600;";
    }

    // td
    if (tag === "td") {
      el.style.cssText += ";border:1px solid #cbd5e1;padding:3px 8px;";
    }

    // hr
    if (tag === "hr") {
      el.style.cssText += ";border:none;border-top:1px solid #e2e8f0;margin:10px 0;";
    }

    // blockquote（注意書き）
    if (tag === "blockquote") {
      el.style.cssText += ";border-left:3px solid #fbbf24;background:#fffbeb;padding:4px 12px;margin:6px 0;font-size:11px;color:#92400e;";
    }
  });
}

/**
 * HTML要素をA4比率のPNGとしてダウンロード
 */
export async function downloadAsPng(element: HTMLElement, filename: string): Promise<void> {
  const wrapper = buildPrintWrapper(element);

  try {
    const dataUrl = await domtoimage.toPng(wrapper, {
      quality: 1,
      scale: 2,
      bgcolor: "#ffffff",
      width: 794,
      disableEmbedFonts: true,
    });

    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * HTML要素の内容をA4サイズのPDFとして保存
 * ブラウザの印刷ダイアログを使用することで日本語・スタイルを完全に保持
 */
export async function downloadAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error("iframe document not available");
  }

  iframeDoc.open();
  iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', 'Yu Gothic', sans-serif;
      background: white;
      color: #1a1a1a;
      font-size: 13px;
      line-height: 1.7;
      padding: 20mm 18mm;
    }
    @media print {
      body { padding: 15mm 14mm; }
      @page { size: A4; margin: 0; }
    }
    /* セクション区切り */
    h1 {
      font-size: 16px;
      font-weight: 700;
      border-bottom: 2px solid #374151;
      padding-bottom: 6px;
      margin-bottom: 16px;
      color: #1a1a1a;
    }
    h2 {
      font-size: 14px;
      font-weight: 700;
      color: #1e3a5f;
      border-bottom: 1.5px solid #93c5fd;
      padding-bottom: 3px;
      margin-top: 20px;
      margin-bottom: 8px;
    }
    h3 {
      font-size: 13px;
      font-weight: 600;
      border-left: 3px solid #93c5fd;
      padding-left: 8px;
      margin-top: 12px;
      margin-bottom: 4px;
    }
    p { margin-top: 2px; margin-bottom: 2px; }
    ul, ol { margin: 2px 0; padding-left: 18px; }
    li { margin: 1px 0; }
    strong { font-weight: 600; color: #1a1a1a; }
    /* テーブル */
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 6px 0; }
    th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; font-weight: 600; }
    td { border: 1px solid #cbd5e1; padding: 3px 8px; }
    /* 水平線 */
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 10px 0; }
    /* 注意書き */
    blockquote { border-left: 3px solid #fbbf24; background: #fffbeb; padding: 4px 12px; margin: 6px 0; font-size: 11px; color: #92400e; }
    /* 改行の整理：連続する空行を1行に */
    br + br { display: none; }
  </style>
</head>
<body>${element.innerHTML}</body>
</html>`);
  iframeDoc.close();

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    setTimeout(resolve, 800);
  });

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();

  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 2000);
}
