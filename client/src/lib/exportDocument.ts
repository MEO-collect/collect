/**
 * カルテ・議事録のPDF/PNG出力ユーティリティ
 *
 * PNG: html2canvas を使用（CORS問題を回避するためbackdrop-filterを事前除去）
 * PDF: ブラウザの印刷ダイアログ経由（日本語・スタイル完全対応）
 */

/**
 * html2canvas が苦手な CSS プロパティを一時的に除去してキャプチャし、元に戻す
 * - backdrop-filter: html2canvasが非対応
 * - 外部フォント(Google Fonts等): CORSエラーを避けるためシステムフォントにフォールバック
 */
async function captureWithHtml2canvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;

  // backdrop-filter を持つ全子孫要素を一時的に無効化
  const affectedBackdrop: Array<{ el: HTMLElement; original: string; webkitOriginal: string }> = [];
  element.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const computed = window.getComputedStyle(el);
    const bf =
      computed.backdropFilter ||
      computed.getPropertyValue("-webkit-backdrop-filter");
    if (bf && bf !== "none") {
      affectedBackdrop.push({
        el,
        original: el.style.backdropFilter,
        webkitOriginal: (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter ?? "",
      });
      el.style.backdropFilter = "none";
      (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = "none";
    }
  });
  // 対象要素自身も処理
  const selfBf = element.style.backdropFilter;
  element.style.backdropFilter = "none";

  // フォントをシステムフォントに一時変更（Google Fonts CORSエラー回避）
  const affectedFont: Array<{ el: HTMLElement; original: string }> = [];
  [element, ...Array.from(element.querySelectorAll<HTMLElement>("*"))].forEach((el) => {
    if (el.style.fontFamily) {
      affectedFont.push({ el, original: el.style.fontFamily });
    }
  });
  const rootOriginalFont = document.documentElement.style.fontFamily;
  // フォントファミリーをシステムフォントに上書き（キャプチャ用）
  element.style.fontFamily =
    "'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', 'Yu Gothic', sans-serif";

  try {
    return await html2canvas(element, {
      scale: 2,
      useCORS: false,       // 外部リソースのCORSを無効化
      allowTaint: true,     // クロスオリジンコンテンツを許可（taintedでもOK）
      backgroundColor: "#ffffff",
      logging: false,
      removeContainer: true,
      // 外部スタイルシート（Google Fonts等）を無視
      onclone: (clonedDoc) => {
        // クローン内の外部スタイルシートリンクを削除してCORSエラーを防ぐ
        clonedDoc.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']").forEach((link) => {
          if (
            link.href.includes("fonts.googleapis.com") ||
            link.href.includes("fonts.gstatic.com")
          ) {
            link.remove();
          }
        });
        // クローン内のbackdrop-filterも除去
        clonedDoc.querySelectorAll<HTMLElement>("*").forEach((el) => {
          const s = el.style;
          if (s.backdropFilter) s.backdropFilter = "none";
          (s as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = "none";
        });
      },
    });
  } finally {
    // 元に戻す
    element.style.backdropFilter = selfBf;
    element.style.fontFamily = "";
    affectedBackdrop.forEach(({ el, original, webkitOriginal }) => {
      el.style.backdropFilter = original;
      (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = webkitOriginal;
    });
    affectedFont.forEach(({ el, original }) => {
      el.style.fontFamily = original;
    });
    document.documentElement.style.fontFamily = rootOriginalFont;
  }
}

/**
 * HTML要素をPNGとしてダウンロード
 */
export async function downloadAsPng(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await captureWithHtml2canvas(element);
  const link = document.createElement("a");
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL("image/png");
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

  // 現在のページのスタイルシートを全てコピー（クロスオリジンは除外）
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
