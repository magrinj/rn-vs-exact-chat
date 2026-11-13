# React Native vs Exact: the same chat app, measured on an iPhone

A WhatsApp-style chat app, built twice by an AI agent from the same spec: once in **React Native (Expo)**, once with **[Exact](https://github.com/expo/exact)**. Both versions then got the same optimization prompt, and were measured on the same iPhone 17 Pro, in Release builds.

https://github.com/user-attachments/assets/b4eecb46-8879-4a6b-b8f7-b1cdb9038d22

Launch in real time, then the same launch in ×6 slow motion, then a scroll by hand up to message 1. The end of React Native's scroll is sped up ×4, shown on screen. Both screens are aligned on the moment the finger leaves the icon.

## The app

- 10,000 messages (79% text, 12% photos, 9% voice notes), 30 photos, and one incoming message every second.
- A generated, deterministic French conversation: see `data/` and `data/generate.py`.
- Constraints shared by both apps:
  - the newest bubbles are visible on the first frame;
  - all 10,000 messages stay reachable by scrolling;
  - an incoming message never copies or reprocesses the whole history;
  - the reading position stays put.

| | React Native | Exact |
|---|---|---|
| Folder | `rn/` | `exact-app/` |
| Stack | Expo SDK 58, RN 0.88.1, Hermes, Legend List 3.7.2, react-native-keyboard-controller 1.22.7, Reanimated 4.7.1, expo-image | Exact (expo/exact at commit `57c86055`) |
| List | `KeyboardAwareLegendList`, a 200 to 600 row window loaded in pages | `list virtualized=true`, a 200 to 400 row window loaded in pages |
| Data | rows prepared at build time (`scripts/build-rows.mjs`) | rows computed in `app.ts` |
| Note | two patches (`rn/patches/`) to react-native-worklets and Reanimated: at rest, the screen ran at 120 frames/s with nothing to draw | — |

## What the agent cost

These numbers cover the whole session of the agent dedicated to each app, with the claude-opus-5-5 model.

| | React Native | Exact |
|---|---|---|
| Cost | $13.26 | $27.34 |
| API time | 26 min 23 s | 41 min 53 s |
| Lines added / removed | +710 / −65 | +296 / −97 |
| Requests | 182 | 258 |

## Results

Every measurement was taken on one iPhone 17 Pro, with Release builds, on the same device for both apps.

| Measure | React Native | Exact | Sample |
|---|---|---|---|
| Installed size (.app) | 54 MB | **37 MB** | — |
| Cold start, messages visible¹ | 250 ms | **150 ms** | 1 launch per app |
| Cold start, screen complete¹ | 283 ms | **200 ms** | 1 launch per app |
| During iOS's launch animation | white screen | messages already shown | warm and cold |
| Warm launch, first frame² | **215 ms** | 228 ms | 20 launches per app, std dev < 3% |
| Warm launch, messages visible³ (median) | 325 ms | **283 ms** | 10 launches per app |
| Warm launch, screen complete³ (median) | **338 ms** | 392 ms | 10 launches per app |
| Hand scroll to message 1 (from the first gesture) | 44.7 s | **18.3 s** | 1 run per app |
| Robot scroll to message 1⁴ | reached 1 time out of 3 | **reached 3 times out of 3** (92–97 s) | 3 runs per app |
| Frames with a gap in the list, robot scroll⁵ | 0.4–0.9% | **0–0.1%** | 2 to 3 runs |
| Frames with a gap in the list, hand scroll⁵ | 2.0% | **0.5%** | 1 run |
| Idle CPU (60 s, 1 message/s) | 2.8–3.0% | 2.9% | 2 and 1 runs |
| Idle memory (physical footprint) | 53 → 62 MB, rising | **20 → 23 MB** | 2 and 1 runs |

1. From the moment the finger leaves the icon, read from the screen recording: each app's first launch after a phone reboot.
2. `XCTApplicationLaunchMetric`, Apple's launch metric in XCTest.
3. From the start of iOS's launch animation, read from the screen recording.
4. Bursts of gestures synthesized by XCTest: about 8 flings per second at 8,000 pt/s, capped at 800 flings, about 97 s.
5. Frames, taken while the list is moving, where the message area holds almost no bubble.

### What the numbers say

- **Memory**: Exact uses almost 3 times less, and its memory doesn't climb at rest.
- **Launch**: Exact shows its messages during iOS's launch animation, while React Native shows a white screen, then the messages. On a warm launch, React Native's first frame comes 13 ms earlier and its screen is complete about 50 ms earlier. Exact's edge is showing content during the animation, not being faster everywhere.
- **Very fast scrolling**: Exact goes back through the 10,000 messages faster and with fewer gaps. React Native stays smooth, but travels less per fling.
- **Idle CPU**: a tie. React Native gets there thanks to the two patches in `rn/patches/`; without them, it sat at 7%.

### Limits

- **No hitch count**: Instruments kept losing its link to the phone during React Native's scrolls, so no comparison is published.
- Cold start and the hand scroll rest on **a single run per app**.
- The screen recording comes over USB at 60 frames/s at most, so every time read from it is accurate to about ±17 ms. During the robot's bursts, that stream drops to 16–30 frames/s, for both apps.
- The phone also has other apps installed. Measurements were taken with Do Not Disturb on and the phone plugged in.

## Method and tools (`bench/`)

- `screenrec.swift`: records the screen of the iPhone plugged in over USB (the same source QuickTime uses) and writes, for every frame, its timestamp, the share of visible bubbles and the change from the previous frame.
- `analyze_launch2.py`: launch times read from the recording. It finds the start of the launch animation, then the moment the messages' edges (text, bubble outlines) reach 50% and then 90% of those of the final screen. This also counts messages that are still fading in during iOS's animation.
- `ui/`: an XCUITest project (generate it with `xcodegen`) that drives both apps identically, by their bundle ID.
  - Flings are sent as one synthesized event, so they follow each other without a pause.
  - XCTest's wait-for-idle is turned off, because a chat that receives a message every second is never idle.
- `warm.sh`: warm launches. `top.sh`: robot scroll to the top. `idle.sh` + `idle.py`: idle under Instruments.
- `make_video.py`: builds the side-by-side video from two hand-scroll recordings.
- `results/`: the raw data of each recording, one line per frame.

## Reproduce

```sh
git clone https://github.com/magrinj/rn-vs-exact-chat && cd rn-vs-exact-chat
git clone https://github.com/expo/exact exact && git -C exact checkout 57c86055   # the framework, expected at ../exact by exact-app

# React Native
cd rn && npm install && node scripts/build-rows.mjs && npx expo prebuild -p ios
xcodebuild -workspace ios/Chat.xcworkspace -scheme Chat -configuration Release -destination generic/platform=iOS -allowProvisioningUpdates
xcrun devicectl device install app --device $DEVICE ios/build/.../Release-iphoneos/Chat.app

# Exact
cd ../exact-app && bun exact.mjs ios --release --device --phone $DEVICE

# Measurements
cd ../bench && swiftc -O screenrec.swift -o screenrec
(cd ui && DEVELOPMENT_TEAM=<your team> xcodegen generate && xcodebuild -project Bench.xcodeproj -scheme Bench -destination id=$DEVICE -allowProvisioningUpdates build-for-testing)
DEVICE=<udid> ./warm.sh
```

Before measuring, on the iPhone: Auto-Lock set to Never, Do Not Disturb on, and only one Instruments or XCUITest session at a time.
