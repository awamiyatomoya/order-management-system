import pdfJsPackageJson from "pdfjs-dist/package.json";

const pdfJsCdnBaseUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsPackageJson.version}`;

export function getPdfParseLoadOptions(data: Buffer) {
  return {
    data,
    cMapUrl: `${pdfJsCdnBaseUrl}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfJsCdnBaseUrl}/standard_fonts/`,
    useWorkerFetch: true,
  };
}
