/**
 * カルテ・議事録のPDF/PNG出力ユーティリティ
 */

/**
 * html2canvas が苦手な CSS プロパティを一時的に除去してキャプチャし、元に戻す
 * backdrop-filter / filter / mix-blend-mode などが対象
 */
async function captureElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;

  // backdrop-filter を持つ全子孫要素を一時的に無効化
  const affected: Array<{ el: HTMLElement; original: string }> = [];
  element.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const style = window.getComputedStyle(el);
    const bf = style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter");
    if (bf && bf !== "none") {
      affected.push({ el, original: el.style.backdropFilter });
      el.style.backdropFilter = "none";
      (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = "none";
    }
  });
  // 対象要素自身も処理
  const selfBf = element.style.backdropFilter;
  element.style.backdropFilter = "none";

  try {
    return await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      removeContainer: true,
    });
  } finally {
    // 元に戻す
    element.style.backdropFilter = selfBf;
    affected.forEach(({ el, original }) => {
      el.style.backdropFilter = original;
    });
  }
}

/**
 * HTML要素をPNGとしてダウンロード
 */
export async function downloadAsPng(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await captureElement(element);
  const link = document.createElement("a");
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * HTML要素をPDFとしてダウンロード
 */
export async function downloadAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const canvas = await captureElement(element);

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = 210; // A4 width in mm
  const pageHeight = 297; // A4 height in mm
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pdf = new jsPDF("p", "mm", "a4");
  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(`${filename}.pdf`);
}
