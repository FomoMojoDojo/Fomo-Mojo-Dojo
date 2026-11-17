// vision-ocr — Apple Vision text recognition for the local parser (S2, 2026-11-16).
//
//   vision-ocr --version            {"engine":"apple-vision","revision":N,"languages":[...]}
//   vision-ocr <image> [<image>…]   {"images":[{"path":…,"lines":[{"text":…,"confidence":…}]}]}
//
// Operator rulings (file-readers-proposal.md): Apple Vision (Decision 1); English plus Spanish (Decision 5).
// Accurate level, language correction on. Deterministic: the same image gives the same lines, which the
// word-for-word quote check needs — the sidecar is exactly what was recognised, and nothing is invented.
//
// LINES ARE GROUPED BY VERTICAL OVERLAP, then read left to right. Sorting boxes by their top edge alone
// split one skewed line into two and put "- scanned copy" before "Major Gift Pledge Letter" (OCR trial,
// 2026-11-15); grouping by overlap returned the letter line for line.
import Foundation
import Vision
import AppKit

let LANGUAGES = ["en-US", "es-ES"]

func emit(_ obj: Any) {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func makeRequest() -> VNRecognizeTextRequest {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = true
  req.recognitionLanguages = LANGUAGES
  return req
}

let args = Array(CommandLine.arguments.dropFirst())
if args.first == "--version" {
  emit(["engine": "apple-vision", "revision": makeRequest().revision, "languages": LANGUAGES])
  exit(0)
}
if args.isEmpty { fputs("usage: vision-ocr --version | <image>...\n", stderr); exit(2) }

var images: [[String: Any]] = []
for path in args {
  guard let img = NSImage(contentsOfFile: path),
        let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    images.append(["path": path, "error": "cannot_load", "lines": []]); continue
  }
  let req = makeRequest()
  do { try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req]) }
  catch { images.append(["path": path, "error": "vision_failed", "lines": []]); continue }
  var rows: [[VNRecognizedTextObservation]] = []
  for o in (req.results ?? []).sorted(by: { $0.boundingBox.midY > $1.boundingBox.midY }) {
    if let i = rows.firstIndex(where: { r in abs(r[0].boundingBox.midY - o.boundingBox.midY) < r[0].boundingBox.height * 0.6 }) {
      rows[i].append(o)
    } else { rows.append([o]) }
  }
  var lines: [[String: Any]] = []
  for r in rows {
    let cands = r.sorted { $0.boundingBox.minX < $1.boundingBox.minX }.compactMap { $0.topCandidates(1).first }
    if cands.isEmpty { continue }
    let conf = cands.map { Double($0.confidence) }.reduce(0, +) / Double(cands.count)
    lines.append(["text": cands.map { $0.string }.joined(separator: " "), "confidence": (conf * 1000).rounded() / 1000])
  }
  images.append(["path": path, "lines": lines])
}
emit(["images": images])
