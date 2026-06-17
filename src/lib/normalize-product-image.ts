import sharp from "sharp";

export const PRODUCT_IMAGE_OUTPUT_SIZE = 400;
const PRODUCT_IMAGE_JPEG_QUALITY = 88;

export async function normalizeProductImageForUpload(file: File): Promise<Buffer> {
  const input = Buffer.from(await file.arrayBuffer());

  return sharp(input, { animated: false })
    .rotate()
    .resize(PRODUCT_IMAGE_OUTPUT_SIZE, PRODUCT_IMAGE_OUTPUT_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .jpeg({ quality: PRODUCT_IMAGE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
