#!/bin/zsh
# Warm launches, apps alternating: Apple's launch metric (first frame), then recorded launches (first bubble).
cd "${0:A:h}"
dev=${DEVICE:?set DEVICE to the iPhone UDID (xcrun devicectl list devices)}
t() { (cd ui && env TEST_RUNNER_BENCH_APP=$1 TEST_RUNNER_ITER=$2 xcodebuild -project Bench.xcodeproj -scheme Bench \
  -destination id=$dev -derivedDataPath build test-without-building -only-testing:BenchUITests/BenchTests/$3 \
  -resultBundlePath ../runs/$4.xcresult 2>&1) | grep -E "measured|error:|BENCH" ; }
mkdir -p runs; rm -rf runs/warm-*.xcresult
for r in 1 2; do for a in rn exact; do
  echo "== launch metric $a round $r"; t $a 10 testLaunchFirstFrame warm-ff-$a-$r
done; done
for r in 1 2; do for a in exact rn; do
  echo "== video $a round $r"
  ./screenrec runs/warm-video-$a-$r.mov runs/warm-video-$a-$r.csv 75 > runs/warm-video-$a-$r.log 2>&1 &
  sleep 3; t $a 5 testLaunchForVideo warm-video-$a-$r; wait
  python3 analyze_launch2.py runs/warm-video-$a-$r
done; done
