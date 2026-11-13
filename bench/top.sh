#!/bin/zsh
# Robot fast scroll to message 1, apps alternating, 3 passes each, screen recorded (per-frame CSV) for blank frames.
# Needs DEVICE (iPhone UDID) and the ui/ test project built (see README).
cd "${0:A:h}"
dev=${DEVICE:?set DEVICE to the iPhone UDID}
mkdir -p runs
for r in 1 2 3; do for a in rn exact; do
  ./screenrec - runs/top-$a-$r.csv 400 > /dev/null 2>&1 & rec=$!
  (cd ui && TEST_RUNNER_BENCH_APP=$a xcodebuild -project Bench.xcodeproj -scheme Bench -destination id=$dev \
    -derivedDataPath build test-without-building -only-testing:BenchUITests/BenchTests/testBurstToTop 2>&1) | grep BENCH
  kill $rec 2>/dev/null
done; done
