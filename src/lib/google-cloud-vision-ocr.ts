type CloudVisionAnnotateResponse = {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
    };
    error?: {
      message?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export function hasGoogleCloudVisionApiKey() {
  return Boolean(process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim());
}

export async function recognizeWithCloudVision(images: Buffer[]) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "GOOGLE_CLOUD_VISION_API_KEY が未設定のため、画像PDFを読み取れません。Vercelの環境変数にAPIキーを設定してください。",
    );
  }

  if (images.length === 0) {
    return { text: "", confidence: 0 };
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: images.map((image) => ({
          image: {
            content: image.toString("base64"),
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: {
            languageHints: ["ja", "en"],
          },
        })),
      }),
    },
  );

  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Google Cloud Vision APIがエラーを返しました（${response.status}）。APIキーとVision APIの有効化を確認してください。`,
    );
  }

  let result: CloudVisionAnnotateResponse;

  try {
    result = JSON.parse(rawBody) as CloudVisionAnnotateResponse;
  } catch {
    throw new Error("Google Cloud Vision APIの応答を解釈できませんでした。");
  }

  if (result.error?.message) {
    throw new Error(`Google Cloud Vision API error: ${result.error.message}`);
  }

  const textParts: string[] = [];

  for (const item of result.responses ?? []) {
    if (item.error?.message) {
      throw new Error(`Google Cloud Vision API error: ${item.error.message}`);
    }

    const pageText = item.fullTextAnnotation?.text?.trim();
    if (pageText) {
      textParts.push(pageText);
    }
  }

  return {
    text: textParts.join("\n\n").trim(),
    confidence: 0,
  };
}
