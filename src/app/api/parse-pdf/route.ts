import { hasGoogleCloudVisionApiKey, recognizeWithCloudVision } from "@/lib/google-cloud-vision-ocr";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const maxDuration = 60;

const tesseractLangPath = "https://tessdata.projectnaptha.com/4.0.0";
const macOcrScriptPath = path.join(process.cwd(), "scripts/ocr-image.swift");
const execFileAsync = promisify(execFile);

type SharpModule = typeof import("sharp");

let sharpModulePromise: Promise<SharpModule> | null = null;

function getTesseractCachePath() {
  return path.join(
    process.env.VERCEL === "1" ? os.tmpdir() : path.join(process.cwd(), ".next/cache"),
    "tesseract",
  );
}

function getPdfWorkerPath() {
  return pathToFileURL(
    path.join(process.cwd(), "node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs"),
  ).toString();
}

function getTesseractPaths() {
  return {
    workerPath: path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
    corePath: path.join(process.cwd(), "node_modules/tesseract.js-core"),
    cachePath: getTesseractCachePath(),
  };
}

async function getSharp() {
  if (!sharpModulePromise) {
    sharpModulePromise = import("sharp").then((module) => module.default);
  }

  return sharpModulePromise;
}

async function ensurePdfJsGlobals() {
  if (globalThis.DOMMatrix) {
    return;
  }

  const { DOMMatrix, Path2D, ImageData, Image } = await import("@napi-rs/canvas");
  Object.assign(globalThis, { DOMMatrix, Path2D, ImageData, Image });
}

async function createPdfParser(buffer: Buffer) {
  await ensurePdfJsGlobals();
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(getPdfWorkerPath());
  return new PDFParse({ data: buffer });
}

export async function GET() {
  return Response.json({
    ok: true,
    visionConfigured: hasGoogleCloudVisionApiKey(),
    runtime: process.env.VERCEL === "1" ? "vercel" : "local",
  });
}

export async function POST(request: Request) {
  let parser: Awaited<ReturnType<typeof createPdfParser>> | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "PDFファイルが送信されていません。" }, { status: 400 });
    }

    if (file.type && file.type !== "application/pdf") {
      return Response.json({ error: "PDFファイルを選択してください。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    parser = await createPdfParser(buffer);
    const textResult = await parser.getText();
    const text = textResult.text.trim();

    if (hasUsefulText(text)) {
      return Response.json({
        extractionMethod: "pdf-text",
        pages: textResult.total,
        text,
      });
    }

    if (process.env.VERCEL === "1") {
      const screenshotResult = await parser.getScreenshot({
        first: 2,
        scale: 3,
        imageDataUrl: false,
        imageBuffer: true,
      });
      const cloudVisionResult = await recognizeWithCloudVision(
        screenshotResult.pages.map((page) => Buffer.from(page.data)),
      );

      if (!hasUsefulText(cloudVisionResult.text)) {
        return Response.json(
          {
            error:
              "PDF画像から文字を読み取れませんでした。画像が不鮮明、またはOCR対象外の形式の可能性があります。",
          },
          { status: 422 },
        );
      }

      return Response.json({
        extractionMethod: "cloud-vision",
        confidence: cloudVisionResult.confidence,
        pages: textResult.total,
        text: cloudVisionResult.text,
      });
    }

    const macRenderedImages = await renderPdfWithMacQuickLook(buffer);
    const macRenderedResult = await recognizeWithMacVision(macRenderedImages);

    if (hasUsefulText(macRenderedResult.text)) {
      return Response.json({
        extractionMethod: "mac-vision",
        confidence: 0,
        pages: textResult.total,
        text: macRenderedResult.text,
      });
    }

    const screenshotResult = await parser.getScreenshot({
      first: 2,
      scale: 3,
      imageDataUrl: false,
      imageBuffer: true,
    });
    const macVisionResult = await recognizeWithMacVision(
      screenshotResult.pages.map((page) => Buffer.from(page.data)),
    );

    if (hasUsefulText(macVisionResult.text)) {
      return Response.json({
        extractionMethod: "mac-vision",
        confidence: 0,
        pages: textResult.total,
        text: macVisionResult.text,
      });
    }

    const ocrResult = await runTesseractOcr(
      screenshotResult.pages.map((page) => Buffer.from(page.data)),
    );

    if (!ocrResult.text) {
      return Response.json(
        {
          error:
            "PDF画像から文字を読み取れませんでした。画像が不鮮明、またはOCR対象外の形式の可能性があります。",
        },
        { status: 422 },
      );
    }

    return Response.json({
      extractionMethod: "ocr",
      confidence: ocrResult.confidence,
      pages: textResult.total,
      text: ocrResult.text,
    });
  } catch (error) {
    return Response.json(
      {
        error: `PDFの読み取り中にエラーが発生しました: ${getErrorMessage(error)}`,
      },
      { status: 500 },
    );
  } finally {
    await parser?.destroy();
  }
}

function hasUsefulText(text: string) {
  const withoutPageMarkers = text
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, "")
    .replace(/\s/g, "");

  return withoutPageMarkers.length >= 20;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "不明なエラー";
}

async function runTesseractOcr(images: Buffer[]) {
  const { createWorker, PSM } = await import("tesseract.js");
  const tesseractPaths = getTesseractPaths();
  const ocrTextParts: string[] = [];
  const confidenceParts: number[] = [];
  const worker = await createWorker("jpn+eng", 1, {
    workerPath: tesseractPaths.workerPath,
    corePath: tesseractPaths.corePath,
    cachePath: tesseractPaths.cachePath,
    langPath: tesseractLangPath,
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    for (const image of images) {
      const preparedImage = await prepareOcrImage(image);
      const ocrResult = await worker.recognize(preparedImage);
      const pageText = ocrResult.data.text.trim();

      if (pageText) {
        ocrTextParts.push(pageText);
        confidenceParts.push(ocrResult.data.confidence);
      }
    }
  } finally {
    await worker.terminate();
  }

  return {
    text: ocrTextParts.join("\n\n").trim(),
    confidence: average(confidenceParts),
  };
}

async function prepareOcrImage(image: Buffer) {
  const sharp = await getSharp();

  return sharp(image)
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function recognizeWithMacVision(images: Buffer[]) {
  if (process.platform !== "darwin" || images.length === 0) {
    return { text: "" };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "order-pdf-ocr-"));

  try {
    const textParts: string[] = [];

    for (const [index, image] of images.entries()) {
      const variants = await prepareMacVisionImages(image);
      const candidates: string[] = [];

      for (const [variantIndex, variant] of variants.entries()) {
        const imagePath = path.join(tempDir, `page-${index + 1}-${variantIndex + 1}.png`);
        await writeFile(imagePath, variant);

        const { stdout } = await execFileAsync("swift", [macOcrScriptPath, imagePath], {
          maxBuffer: 1024 * 1024 * 8,
          timeout: 60_000,
        });
        const text = stdout.trim();

        if (text) {
          candidates.push(text);
        }
      }

      const bestText = candidates.toSorted((left, right) => scoreOcrText(right) - scoreOcrText(left))[0];

      if (bestText) {
        textParts.push(bestText);
      }
    }

    return { text: textParts.join("\n\n").trim() };
  } catch {
    return { text: "" };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function renderPdfWithMacQuickLook(pdf: Buffer) {
  if (process.platform !== "darwin") {
    return [];
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "order-pdf-render-"));

  try {
    const pdfPath = path.join(tempDir, "order.pdf");
    await writeFile(pdfPath, pdf);
    await execFileAsync("qlmanage", ["-t", "-s", "2400", "-o", tempDir, pdfPath], {
      maxBuffer: 1024 * 1024 * 8,
      timeout: 60_000,
    });

    const files = await readdir(tempDir);
    const imageFiles = files
      .filter((file) => file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg"))
      .toSorted();

    return Promise.all(imageFiles.map((file) => readFile(path.join(tempDir, file))));
  } catch {
    return [];
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function prepareMacVisionImages(image: Buffer) {
  const sharp = await getSharp();
  const base = sharp(image).rotate();
  const metadata = await base.metadata();
  const width = metadata.width ?? 0;
  const resizeWidth = width > 2800 ? 2800 : undefined;

  return Promise.all([
    sharp(image).rotate().resize({ width: resizeWidth, withoutEnlargement: true }).png().toBuffer(),
    sharp(image)
      .rotate()
      .resize({ width: resizeWidth, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer(),
    sharp(image)
      .rotate()
      .resize({ width: resizeWidth, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .threshold(180)
      .png()
      .toBuffer(),
  ]);
}

function scoreOcrText(text: string) {
  const normalized = text.replace(/\s/g, "");
  const janMatches = normalized.match(/\d{13}/g)?.length ?? 0;
  const dateMatches = normalized.match(/\d{4}[\/\-.年月]\d{1,2}[\/\-.月]\d{1,2}/g)?.length ?? 0;
  const japaneseMatches = normalized.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu)?.length ?? 0;
  const digitMatches = normalized.match(/\d/g)?.length ?? 0;

  return normalized.length + janMatches * 200 + dateMatches * 100 + japaneseMatches * 3 + digitMatches;
}
