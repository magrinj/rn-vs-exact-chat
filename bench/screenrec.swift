// Records the USB-connected iPhone's screen (the source QuickTime uses) to a .mov, and writes one CSV line per
// captured frame: host-clock time, then what the frame shows in the transcript band (y 20–80 %):
//   green  = share of pixels in the outgoing bubble colour (#D9FDD3), the same in both apps
//   white  = share of pure-white pixels (incoming bubbles, #FFFFFF; neither wallpaper has any)
//   diff   = mean absolute change from the previous frame, whole screen (launch start, motion)
// Usage: screenrec <out.mov> <out.csv> <seconds>
// The capture delivers at most 60 frames/s, so every time read from it is good to about ±17 ms.
import AVFoundation
import CoreMediaIO

let args = CommandLine.arguments
guard args.count == 4, let seconds = Double(args[3]) else { print("usage: screenrec out.mov out.csv seconds"); exit(2) }

var prop = CMIOObjectPropertyAddress(
  mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyAllowScreenCaptureDevices),
  mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
  mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain))
var allow: UInt32 = 1
CMIOObjectSetPropertyData(CMIOObjectID(kCMIOObjectSystemObject), &prop, 0, nil, UInt32(MemoryLayout<UInt32>.size), &allow)

var device: AVCaptureDevice?
for _ in 0..<40 where device == nil {
  device = AVCaptureDevice.DiscoverySession(deviceTypes: [.external], mediaType: .muxed, position: .unspecified).devices.first
  if device == nil { RunLoop.current.run(until: Date().addingTimeInterval(0.25)) }
}
guard let device else { print("no iPhone screen source (USB cable?)"); exit(1) }

let noMov = args[1] == "-"

final class Sink: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let writer: AVAssetWriter
  var input: AVAssetWriterInput?
  var adaptor: AVAssetWriterInputPixelBufferAdaptor?
  let csv: FileHandle
  var prev: [UInt8] = []
  var frames = 0
  init(mov: URL, csv: URL) throws {
    try? FileManager.default.removeItem(at: mov)
    writer = try AVAssetWriter(outputURL: noMov ? URL(fileURLWithPath: NSTemporaryDirectory() + "/screenrec-unused.mov") : mov, fileType: .mov)
    FileManager.default.createFile(atPath: csv.path, contents: nil)
    self.csv = try FileHandle(forWritingTo: csv)
    self.csv.write("t,green,white,diff\n".data(using: .utf8)!)
  }
  func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { return }
    let pts = CMSampleBufferGetPresentationTimeStamp(sb)
    if input == nil && !noMov {
      let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
      let i = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 30_000_000]])
      i.expectsMediaDataInRealTime = true
      writer.add(i)
      adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: i, sourcePixelBufferAttributes: nil)
      input = i
      writer.startWriting()
      writer.startSession(atSourceTime: pts)
    }
    if let input, input.isReadyForMoreMediaData { adaptor!.append(pb, withPresentationTime: pts) }
    analyse(pb, t: CMTimeGetSeconds(pts))
  }
  func analyse(_ pb: CVPixelBuffer, t: Double) {
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), row = CVPixelBufferGetBytesPerRow(pb)
    let p = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    let step = 12
    var green = 0, white = 0, n = 0, diff = 0, k = 0
    var cur = [UInt8](); cur.reserveCapacity((w / step) * (h / step))
    for y in stride(from: 0, to: h, by: step) {
      let band = y > h / 5 && y < h * 4 / 5
      for x in stride(from: 0, to: w, by: step) {
        let o = y * row + x * 4
        let b = Int(p[o]), g = Int(p[o + 1]), r = Int(p[o + 2])
        let lum = UInt8((r * 3 + g * 6 + b) / 10)
        if k < prev.count { diff += abs(Int(lum) - Int(prev[k])) }
        cur.append(lum); k += 1
        if band {
          n += 1
          if abs(r - 0xD9) < 10 && abs(g - 0xFD) < 8 && abs(b - 0xD3) < 10 { green += 1 }
          if r > 250 && g > 250 && b > 250 { white += 1 }
        }
      }
    }
    let d = prev.isEmpty ? 0 : Double(diff) / Double(k)
    prev = cur
    frames += 1
    csv.write(String(format: "%.4f,%.4f,%.4f,%.2f\n", t, Double(green) / Double(n), Double(white) / Double(n), d).data(using: .utf8)!)
  }
}

let sink = try Sink(mov: URL(fileURLWithPath: args[1]), csv: URL(fileURLWithPath: args[2]))
let session = AVCaptureSession()
let input = try AVCaptureDeviceInput(device: device)
session.addInput(input)
let out = AVCaptureVideoDataOutput()
out.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
out.alwaysDiscardsLateVideoFrames = false
let q = DispatchQueue(label: "frames")
out.setSampleBufferDelegate(sink, queue: q)
session.addOutput(out)
session.startRunning()
// Host clock at start, so a caller can line the frames up with its own events.
print(String(format: "recording host=%.4f", CMTimeGetSeconds(CMClockGetTime(CMClockGetHostTimeClock()))))
fflush(stdout)
RunLoop.current.run(until: Date().addingTimeInterval(seconds))
session.stopRunning()
q.sync {}
sink.input?.markAsFinished()
if sink.writer.status == .writing {
  let done = DispatchSemaphore(value: 0)
  sink.writer.finishWriting { done.signal() }
  done.wait()
}
print("frames=\(sink.frames)")
