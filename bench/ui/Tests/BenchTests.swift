import XCTest
import ObjectiveC

// XCUITest waits for the app to go idle before every gesture. A chat with a message arriving each second is
// never idle, so flings came ~4 s apart. This turns that wait off (both selector spellings Xcode has used),
// so gestures follow each other as fast as a finger can. Gesture speed itself is unchanged.
private let noQuiescence: Void = {
  guard let cls = NSClassFromString("XCUIApplicationProcess") else { return }
  for name in ["waitForQuiescenceIncludingAnimationsIdle:", "waitForQuiescenceIncludingAnimationsIdle:isPreEvent:"] {
    guard let m = class_getInstanceMethod(cls, NSSelectorFromString(name)) else { continue }
    let block: @convention(block) (AnyObject, Bool, Bool) -> Void = { _, _, _ in }
    method_setImplementation(m, imp_implementationWithBlock(block))
  }
}()

// One scenario set, run against either app: TEST_RUNNER_BENCH_APP=rn|exact on the xcodebuild line.
// Nothing here knows how either app is built: it only touches the screen, as a person would.
private let env = ProcessInfo.processInfo.environment
private let which = env["BENCH_APP"] ?? "rn"
private let bundle = which == "exact" ? "fr.magrin.chatbench" : "com.magrinj.rn"
private func num(_ k: String, _ d: Double) -> Double { env[k].flatMap(Double.init) ?? d }

// A burst of flings sent to the device as ONE synthesized touch event (XCTest's own event record, the private
// API its gestures are built on), so the flings are timed exactly and nothing runs between them.
// Each fling: finger down at y=fromY, straight move to y=toY in `travel / velocity` s, lift, next one `every` s later.
private func flingBurst(count: Int, velocity: Double, every: Double, fromY: Double = 250, toY: Double = 750, x: Double = 200) {
  typealias InitRec = @convention(c) (AnyObject, Selector, NSString, Int) -> AnyObject
  typealias InitPath = @convention(c) (AnyObject, Selector, CGPoint, Double) -> AnyObject
  typealias Move = @convention(c) (AnyObject, Selector, CGPoint, Double) -> Void
  typealias Lift = @convention(c) (AnyObject, Selector, Double) -> Void
  typealias Add = @convention(c) (AnyObject, Selector, AnyObject) -> Void
  func imp<T>(_ obj: AnyObject, _ sel: String, _: T.Type) -> (T, Selector) {
    let s = NSSelectorFromString(sel)
    return (unsafeBitCast(obj.method(for: s), to: T.self), s)
  }
  let recCls: AnyObject = NSClassFromString("XCSynthesizedEventRecord")!
  let pathCls: AnyObject = NSClassFromString("XCPointerEventPath")!
  let recAlloc = recCls.perform(NSSelectorFromString("alloc"))!.takeUnretainedValue()
  let (initRec, sRec) = imp(recAlloc, "initWithName:interfaceOrientation:", InitRec.self)
  let rec = initRec(recAlloc, sRec, "flings" as NSString, 1)
  let dur = abs(toY - fromY) / velocity
  for i in 0..<count {
    let t = Double(i) * every
    let pAlloc = pathCls.perform(NSSelectorFromString("alloc"))!.takeUnretainedValue()
    let (initPath, sPath) = imp(pAlloc, "initForTouchAtPoint:offset:", InitPath.self)
    let path = initPath(pAlloc, sPath, CGPoint(x: x, y: fromY), t)
    let (move, sMove) = imp(path, "moveToPoint:atOffset:", Move.self)
    // a few intermediate points so the velocity the OS reads at lift-off is the intended one
    for k in 1...6 { move(path, sMove, CGPoint(x: x, y: fromY + (toY - fromY) * Double(k) / 6), t + dur * Double(k) / 6) }
    let (lift, sLift) = imp(path, "liftUpAtOffset:", Lift.self)
    lift(path, sLift, t + dur)
    let (add, sAdd) = imp(rec, "addPointerEventPath:", Add.self)
    add(rec, sAdd, path)
  }
  let synth = (XCUIDevice.shared as AnyObject).perform(NSSelectorFromString("eventSynthesizer"))!.takeUnretainedValue()
  let done = DispatchSemaphore(value: 0)
  let completion: @convention(block) (Bool, NSError?) -> Void = { ok, err in
    if !ok { print("BENCH synth error \(String(describing: err))") }
    done.signal()
  }
  typealias Synth = @convention(c) (AnyObject, Selector, AnyObject, Any) -> Void
  let (synthesize, sSynth) = imp(synth, "synthesizeEvent:completion:", Synth.self)
  synthesize(synth, sSynth, rec, completion)
  done.wait()
}

final class BenchTests: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: bundle)

  override func setUp() { continueAfterFailure = true; _ = noQuiescence }

  private func opts(_ n: Int, manual: Bool = false) -> XCTMeasureOptions {
    let o = XCTMeasureOptions()
    o.iterationCount = n
    if manual { o.invocationOptions = [.manuallyStart, .manuallyStop] }
    return o
  }

  // NOLAUNCH: Instruments launched the app (so its trace covers the whole run); just bring it forward.
  private func freshLaunch(settle: Double = 3) {
    if env["NOLAUNCH"] != nil { app.activate(); Thread.sleep(forTimeInterval: settle); return }
    app.terminate()
    app.launch()
    Thread.sleep(forTimeInterval: settle)
  }

  /// One upward fling: the finger travels down the transcript at `velocity` points/s and lets go.
  private func fling(_ velocity: Double, down: Bool = false) {
    let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: down ? 0.75 : 0.25))
    let to = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: down ? 0.25 : 0.75))
    from.press(forDuration: 0.01, thenDragTo: to, withVelocity: XCUIGestureVelocity(rawValue: velocity), thenHoldForDuration: 0)
  }

  private func text(_ s: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
  }

  /// Messages 1, 2 and 3 on screen together: that run occurs nowhere else in the 10,000.
  private var atMessageOne: Bool {
    text("J'ai hâte").exists && text("Vas-y fonce").exists && text("Il fait super beau aujourd").exists
  }

  // Launch to first frame, Apple's own launch metric (warm: the binary is already in memory).
  func testLaunchFirstFrame() {
    measure(metrics: [XCTApplicationLaunchMetric()], options: opts(Int(num("ITER", 10)))) { app.launch() }
  }

  // Launch until the app answers input (main thread free).
  func testLaunchResponsive() {
    measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)], options: opts(Int(num("ITER", 10)))) { app.launch() }
  }

  // Launches for the screen recorder: home screen held still, then launch, then 4 s of the app.
  // The recording dates the first frame and the first bubble; this only paces them.
  func testLaunchForVideo() {
    for _ in 0..<Int(num("ITER", 10)) {
      app.terminate()
      XCUIDevice.shared.press(.home)
      Thread.sleep(forTimeInterval: 2.5)
      app.launch()
      Thread.sleep(forTimeInterval: 4)
    }
    app.terminate()
    XCUIDevice.shared.press(.home)
  }

  // Back-to-back flings upward at FLING points/s, no pause, until messages 1–3 are on screen.
  // Hitches, CPU and memory cover the flings only. Checks for the top run every CHECK flings.
  func testFlingToTop() {
    let v = num("FLING", 8000), check = Int(num("CHECK", 25)), maxFlings = Int(num("MAXFLINGS", 400))
    measure(metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric, XCTCPUMetric(application: app),
                      XCTMemoryMetric(application: app), XCTClockMetric()],
            options: opts(Int(num("ITER", 3)), manual: true)) {
      freshLaunch()
      var n = 0, reached = false
      let t0 = Date()
      startMeasuring()
      while n < maxFlings {
        for _ in 0..<check { fling(v); n += 1 }
        Thread.sleep(forTimeInterval: 0.8)
        if atMessageOne { reached = true; break }
      }
      stopMeasuring()
      print(String(format: "BENCH fling app=%@ velocity=%.0f flings=%d reached=%@ seconds=%.1f", which, v, n, reached ? "yes" : "no", Date().timeIntervalSince(t0)))
      XCTAssertTrue(reached, "message 1 not reached after \(n) flings")
    }
  }

  // From the newest message to message 1 in bursts of BURSTN flings (FLING points/s, one every EVERY s).
  // Between bursts it only checks whether messages 1-3 are on screen. Prints flings sent and wall time.
  func testBurstToTop() {
    freshLaunch()
    let per = Int(num("BURSTN", 40)), v = num("FLING", 8000), every = num("EVERY", 0.25)
    var n = 0, reached = false
    let t0 = Date()
    while n < Int(num("MAXFLINGS", 800)) {
      flingBurst(count: per, velocity: v, every: every); n += per
      Thread.sleep(forTimeInterval: 0.5)
      if atMessageOne { reached = true; break }
    }
    print(String(format: "BENCH burst app=%@ velocity=%.0f every=%.2f flings=%d reached=%@ seconds=%.1f", which, v, every, n, reached ? "yes" : "no", Date().timeIntervalSince(t0)))
    XCTAssertTrue(reached)
  }

  // Times FLINGS flings in a row, nothing measured: checks the gesture pace.
  func testFlingPace() {
    freshLaunch(settle: num("WAIT", 3))
    let n = Int(num("FLINGS", 30)), t0 = Date()
    if env["BURST"] != nil { flingBurst(count: n, velocity: num("FLING", 8000), every: num("EVERY", 0.25)) }
    else { for _ in 0..<n { fling(num("FLING", 8000)) } }
    print(String(format: "BENCH pace app=%@ flings=%d seconds=%.2f", which, n, Date().timeIntervalSince(t0)))
  }

  // From the middle of the conversation: type a message and send it.
  func testMiddleTypeSend() {
    measure(metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric, XCTCPUMetric(application: app), XCTClockMetric()],
            options: opts(Int(num("ITER", 3)), manual: true)) {
      freshLaunch()
      for _ in 0..<Int(num("UPFLINGS", 15)) { fling(4000) }
      Thread.sleep(forTimeInterval: 2)
      let field = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
      let msg = "Bench \(Int.random(in: 1000...9999))"
      startMeasuring()
      field.tap()
      field.typeText(msg)
      app.buttons["Envoyer"].tap()
      let shown = text(msg).waitForExistence(timeout: 5)
      Thread.sleep(forTimeInterval: 1.5)
      stopMeasuring()
      XCTAssertTrue(shown, "sent message not on screen")
    }
  }

  // Idle at the bottom, one message arriving per second: CPU and memory over IDLE seconds.
  func testIdle() {
    measure(metrics: [XCTCPUMetric(application: app), XCTMemoryMetric(application: app)],
            options: opts(Int(num("ITER", 3)), manual: true)) {
      freshLaunch(settle: 5)
      startMeasuring()
      Thread.sleep(forTimeInterval: num("IDLE", 60))
      stopMeasuring()
    }
  }
}
