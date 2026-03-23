/**
 * カルテ・議事録のPDF/PNG出力ユーティリティ
 *
 * PNG: dom-to-image-more を使用（backdrop-filter 対応）
 * PDF: ブラウザの印刷ダイアログ経由（日本語・スタイル完全対応）
 */

/**
 * HTML要素をPNGとしてダウンロード
 * dom-to-image-more を使用することで backdrop-filter などのCSSも正確にレンダリング
 */
export async function downloadAsPng(element: HTMLElement, filename: string): Promise<void> {
  const domtoimage = await import("dom-to-image-more");

  const dataUrl: string = await domtoimage.toPng(element, {
    quality: 1,
    scale: 2,
    bgcolor: "#ffffff",
  });

  const link = document.createElement("a");
  link.download = `${filename}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

  // 現在のページのスタイルシートを全てコピー
  const styles = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        // クロスオリジンのスタイルシートは無視
        return "";
      }
    })
    .join("\n");

  // Google Fontsなどの外部リンクをコピー
  const linkTags = Array.from(document.querySelectorAll("link[rel='stylesheet']"))
    .map((link) => link.outerHTML)
    .join("\n");

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${filename}</title>
        ${linkTags}
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
            font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif;
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
