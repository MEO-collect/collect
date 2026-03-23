/**
 * カルテ・議事録のPDF/PNG出力ユーティリティ
 *
 * PNG: dom-to-image-more を使用
 *   - ブラウザのレンダリングエンジンを直接使用するため OKLCH / backdrop-filter / Google Fonts に完全対応
 *   - html2canvas は OKLCH 色形式・外部フォント CORS に非対応のため使用しない
 *
 * PDF: ブラウザの印刷ダイアログ経由（日本語・スタイル完全対応）
 */
import domtoimage from "dom-to-image-more";

/**
 * PNG出力用のスタイルを一時的に適用して、出力後に元に戻す
 * - prose クラスの太いボーダーを細く変更
 * - backdrop-filter を無効化
 * - 背景を白に統一
 */
function applyPngExportStyles(element: HTMLElement): () => void {
  const styleId = "__png-export-style__";

  // 既存のスタイルタグがあれば削除
  document.getElementById(styleId)?.remove();

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    /* PNG出力用一時スタイル */
    [data-png-export] * {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    [data-png-export] table,
    [data-png-export] th,
    [data-png-export] td {
      border: 1px solid #d1d5db !important;
      border-collapse: collapse !important;
    }
    [data-png-export] hr {
      border: none !important;
      border-top: 1px solid #e5e7eb !important;
    }
    [data-png-export] blockquote {
      border-left: 3px solid #d1d5db !important;
    }
    [data-png-export] h1,
    [data-png-export] h2,
    [data-png-export] h3 {
      border-bottom: 1px solid #e5e7eb !important;
      padding-bottom: 4px !important;
    }
    [data-png-export] pre,
    [data-png-export] code {
      border: 1px solid #e5e7eb !important;
    }
    /* prose クラスのデフォルト太枠を上書き */
    [data-png-export] .prose table {
      border: 1px solid #d1d5db !important;
    }
    [data-png-export] .prose thead th {
      border: 1px solid #d1d5db !important;
      background-color: #f9fafb !important;
    }
    [data-png-export] .prose tbody td {
      border: 1px solid #e5e7eb !important;
    }
  `;
  document.head.appendChild(style);

  // 対象要素にdata属性を付与
  element.setAttribute("data-png-export", "true");

  // 元のスタイルを保存して返す（クリーンアップ関数）
  return () => {
    element.removeAttribute("data-png-export");
    document.getElementById(styleId)?.remove();
  };
}

/**
 * HTML要素をPNGとしてダウンロード
 */
export async function downloadAsPng(element: HTMLElement, filename: string): Promise<void> {
  // キャプチャ前にスクロール位置を先頭に戻す（切れ防止）
  const scrollTop = element.scrollTop;
  element.scrollTop = 0;

  // PNG出力用スタイルを一時適用
  const cleanup = applyPngExportStyles(element);

  // スタイル適用後に少し待つ（レンダリング反映）
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const dataUrl = await domtoimage.toPng(element, {
      quality: 1,
      scale: 2,
      bgcolor: "#ffffff",
      // 外部フォント（Google Fonts等）のCSSルール読み取りをスキップしてCORSエラーを回避
      // フォントはブラウザキャッシュから描画されるため見た目への影響はない
      disableEmbedFonts: true,
      // クロスオリジンリソースのキャッシュバスト
      cacheBust: true,
    });

    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    cleanup();
    element.scrollTop = scrollTop;
  }
}

/**
 * HTML要素の内容をPDFとして保存
 * ブラウザの印刷ダイアログを使用することで日本語・スタイルを完全に保持
 * ユーザーは印刷ダイアログで「PDFとして保存」を選択する
 */
export async function downloadAsPdf(element: HTMLElement, filename: string): Promise<void> {
  // 印刷用のiframeを作成して内容を複製
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error("iframe document not available");
  }

  // 現在のページのスタイルシートを全てコピー（クロスオリジンは除外）
  const styles = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${filename}</title>
        <style>
          ${styles}
          @media print {
            body {
              margin: 0;
              padding: 16px;
              background: white !important;
              color: black !important;
            }
            * {
              backdrop-filter: none !important;
              -webkit-backdrop-filter: none !important;
              box-shadow: none !important;
            }
            table, th, td {
              border: 1px solid #d1d5db !important;
            }
          }
          body {
            font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', 'Yu Gothic', sans-serif;
            background: white;
            color: black;
            padding: 16px;
          }
          table, th, td {
            border: 1px solid #d1d5db !important;
            border-collapse: collapse;
          }
        </style>
      </head>
      <body>
        ${element.innerHTML}
      </body>
    </html>
  `);
  iframeDoc.close();

  // フォントなどの読み込みを待つ
  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    setTimeout(resolve, 800);
  });

  // 印刷ダイアログを開く
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();

  // ダイアログが閉じた後にiframeを削除
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 2000);
}
