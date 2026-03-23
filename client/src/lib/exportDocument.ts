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
 * HTML要素をPNGとしてダウンロード
 */
export async function downloadAsPng(element: HTMLElement, filename: string): Promise<void> {
  // キャプチャ前にスクロール位置を先頭に戻す（切れ防止）
  const scrollTop = element.scrollTop;
  element.scrollTop = 0;

  try {
    const dataUrl = await domtoimage.toPng(element, {
      quality: 1,
      scale: 2,
      bgcolor: "#ffffff",
      // クロスオリジンリソースのキャッシュバスト（CORS回避）
      cacheBust: true,
      // 外部フォント読み込みエラーを無視してキャプチャを続行
      filter: () => true,
    });

    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
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
          }
          body {
            font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', 'Yu Gothic', sans-serif;
            background: white;
            color: black;
            padding: 16px;
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
