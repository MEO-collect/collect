/**
 * カルテ・議事録のPDF/PNG出力ユーティリティ
 *
 * PNG: dom-to-image-more の onclone コールバックを使用
 *   - クローンされたDOMに直接インラインスタイルを適用するため、外部スタイルシートの影響を受けない
 *   - OKLCH / backdrop-filter / Google Fonts に完全対応
 *
 * PDF: ブラウザの印刷ダイアログ経由（日本語・スタイル完全対応）
 */
import domtoimage from "dom-to-image-more";

/**
 * クローンされたDOMの全要素を走査して、枠線・背景・フィルターをインラインで上書き
 */
function cleanupClonedElement(clone: HTMLElement): void {
  // ルート要素の背景を白に
  clone.style.background = "#ffffff";
  clone.style.backdropFilter = "none";
  (clone.style as unknown as Record<string, string>)["-webkit-backdrop-filter"] = "none";
  clone.style.boxShadow = "none";
  clone.style.borderRadius = "0";
  clone.style.padding = "24px";

  // 全子孫要素を走査
  const allElements = clone.querySelectorAll("*");
  allElements.forEach((el) => {
    const elem = el as HTMLElement;
    const tag = elem.tagName.toLowerCase();
    const computed = window.getComputedStyle(elem);

    // backdrop-filter を無効化
    elem.style.backdropFilter = "none";
    (elem.style as unknown as Record<string, string>)["-webkit-backdrop-filter"] = "none";

    // Google Fonts の link タグを削除
    if (tag === "link") {
      const href = elem.getAttribute("href") || "";
      if (href.includes("fonts.googleapis.com") || href.includes("fonts.gstatic.com")) {
        elem.remove();
        return;
      }
    }

    // 背景の透明度を除去（bg-white/30 などの半透明背景を白に）
    const bg = computed.backgroundColor;
    if (bg && bg.includes("rgba")) {
      elem.style.background = "#ffffff";
      elem.style.backgroundColor = "#ffffff";
    }

    // 枠線を細く統一
    const borderWidth = parseFloat(computed.borderWidth || "0");
    if (borderWidth > 0.5) {
      elem.style.border = "0.5px solid #e5e7eb";
    }

    // table / th / td の枠線を細く
    if (tag === "table" || tag === "th" || tag === "td") {
      elem.style.border = "0.5px solid #d1d5db";
      elem.style.borderCollapse = "collapse";
    }

    // h1/h2/h3 の下線を細く
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      const borderBottomWidth = parseFloat(computed.borderBottomWidth || "0");
      if (borderBottomWidth > 0.5) {
        elem.style.borderBottom = "0.5px solid #e5e7eb";
      }
    }

    // blockquote の左線を細く
    if (tag === "blockquote") {
      elem.style.borderLeft = "1px solid #d1d5db";
    }

    // box-shadow を除去
    elem.style.boxShadow = "none";
  });
}

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
      // 外部フォント（Google Fonts等）のCSSルール読み取りをスキップしてCORSエラーを回避
      disableEmbedFonts: true,
      // クローンされたDOMを直接書き換えて枠線・背景を修正
      onclone: (clone: HTMLElement) => {
        cleanupClonedElement(clone);
      },
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
