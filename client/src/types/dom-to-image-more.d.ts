declare module "dom-to-image-more" {
  interface Options {
    quality?: number;
    scale?: number;
    bgcolor?: string;
    width?: number;
    height?: number;
    style?: Partial<CSSStyleDeclaration>;
    filter?: (node: Node) => boolean;
    imagePlaceholder?: string;
    cacheBust?: boolean;
    disableEmbedFonts?: boolean;
    disableInlineImages?: boolean;
  }

  function toPng(node: HTMLElement, options?: Options): Promise<string>;
  function toJpeg(node: HTMLElement, options?: Options): Promise<string>;
  function toBlob(node: HTMLElement, options?: Options): Promise<Blob>;
  function toSvg(node: HTMLElement, options?: Options): Promise<string>;
  function toCanvas(node: HTMLElement, options?: Options): Promise<HTMLCanvasElement>;

  export { toPng, toJpeg, toBlob, toSvg, toCanvas };
  export default { toPng, toJpeg, toBlob, toSvg, toCanvas };
}
