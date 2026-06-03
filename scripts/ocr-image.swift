import CoreGraphics
import Foundation
import ImageIO
import Vision

guard CommandLine.arguments.count >= 2 else {
  fputs("画像ファイルのパスが指定されていません。\n", stderr)
  exit(1)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])

guard
  let imageSource = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
else {
  fputs("画像ファイルを開けませんでした。\n", stderr)
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ja-JP", "en-US"]
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.004

let handler = VNImageRequestHandler(cgImage: image, options: [:])

do {
  try handler.perform([request])
} catch {
  fputs("OCRに失敗しました: \(error.localizedDescription)\n", stderr)
  exit(1)
}

let lines = (request.results ?? [])
  .sorted { left, right in
    let yDistance = abs(left.boundingBox.midY - right.boundingBox.midY)

    if yDistance > 0.01 {
      return left.boundingBox.midY > right.boundingBox.midY
    }

    return left.boundingBox.minX < right.boundingBox.minX
  }
  .compactMap { observation in
    observation.topCandidates(1).first?.string
  }

print(lines.joined(separator: "\n"))
