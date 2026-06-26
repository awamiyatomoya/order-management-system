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

function formatCloudVisionHttpError(status: number, rawBody: string) {
  let googleMessage = "";

  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
    googleMessage = parsed.error?.message?.trim() ?? "";
  } catch {
    googleMessage = "";
  }

  if (status === 403) {
    if (googleMessage.includes("requires billing to be enabled")) {
      const projectMatch = googleMessage.match(/project #(\d+)/);
      const projectId = projectMatch?.[1];
      const billingUrl = projectId
        ? `https://console.developers.google.com/billing/enable?project=${projectId}`
        : "https://console.cloud.google.com/billing";

      return `Google Cloud の請求先が未設定です。APIキーを作成したプロジェクトに請求先アカウントをリンクしてください。設定後、数分待ってから再試行してください。${projectId ? `（プロジェクト番号: ${projectId}）` : ""} ${billingUrl}`;
    }

    if (googleMessage.includes("has not been used") || googleMessage.includes("disabled")) {
      return "Google Cloud Vision APIが有効化されていません。Google Cloud ConsoleでCloud Vision APIを「有効にする」を押してください。";
    }

    if (
      googleMessage.includes("not authorized to use this API key") ||
      googleMessage.includes("API key not valid")
    ) {
      return "APIキーの制限設定が原因の可能性があります。認証情報で「アプリケーションの制限」を「なし」にし、「APIの制限」でCloud Vision APIのみを選んでください。";
    }

    return "Google Cloud Vision APIへのアクセスが拒否されました（403）。Vision APIの有効化、請求先アカウントのリンク、APIキーの制限（アプリケーションの制限は「なし」）を確認してください。";
  }

  if (googleMessage) {
    return `Google Cloud Vision APIがエラーを返しました（${status}）: ${googleMessage}`;
  }

  return `Google Cloud Vision APIがエラーを返しました（${status}）。APIキーとVision APIの有効化を確認してください。`;
}

/** 1x1 白ピクセル PNG — Vision API 疎通確認用 */
const PROBE_IMAGE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function probeCloudVisionApiKey() {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();

  if (!apiKey) {
    return {
      ok: false as const,
      message: "GOOGLE_CLOUD_VISION_API_KEY が未設定です。",
    };
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: PROBE_IMAGE.toString("base64") },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    },
  );

  const rawBody = await response.text();

  if (!response.ok) {
    let googleMessage = "";

    try {
      const parsed = JSON.parse(rawBody) as { error?: { message?: string; status?: string } };
      googleMessage = parsed.error?.message?.trim() ?? "";
    } catch {
      googleMessage = rawBody.slice(0, 300);
    }

    return {
      ok: false as const,
      status: response.status,
      googleMessage,
      message: formatCloudVisionHttpError(response.status, rawBody),
    };
  }

  return {
    ok: true as const,
    message: "Vision API への接続に成功しました。",
  };
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
    throw new Error(formatCloudVisionHttpError(response.status, rawBody));
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
