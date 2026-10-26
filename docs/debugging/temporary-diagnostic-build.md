# Temporary on-watch receiver diagnostic build

This branch is based on PR #1's `chore/initial-scaffold-ci-docs` branch and deliberately replaces the normal JankTime2 face with a diagnostic screen. Use it temporarily to investigate slot updates when Gravel's Developer Connection cannot be enabled. The production PR #1 branch is unchanged.

## What the screen shows

- **RX** — number of AppMessage dictionaries read by the watch-side Alloy receiver.
- **Last** — last message's validated type and a safe identifier. Unrecognized or malformed identifiers appear as `invalid`; no raw packet contents are shown.
- **Outcome** — whether the last message was applied, rejected, or ignored.
- **Redraw handler** — whether the renderer registered its redraw callback.
- **Target slot / Current mapping** — the watch's in-memory mapping for `grid.top.1`, our test slot.
- **Last slot / Mapping** — last accepted slot ID and its previous/new metric mapping.
- **Slots applied / rejected / Handler errors** — cumulative counts since the watchface was launched.
- **Redraws / last redraw** — callbacks requested through the message receiver.

Provider values, task/calendar text, image data, URLs, credentials, and raw AppMessage dictionaries are not displayed or sent back to the phone. This temporary screen intentionally replaces the approved watchface layout; do not merge or install it as the normal daily watchface.

## Build the PBW locally

Prerequisites are the pinned Node.js, Python, Pebble Tool, and Pebble SDK versions documented in the repository README and CI workflow.

```sh
git fetch origin
git switch debug/watch-receiver-visual-diagnostics
git pull --ff-only
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run build:watch
pebble build
find build -maxdepth 1 -name '*.pbw' -print
```

Use the single PBW produced by `pebble build`. The normal local build leaves preview fixtures disabled. Do not run or install the CI-only preview-fixture build.

Alternatively, download the **production-mode PBW artifact** from the latest successful [diagnostic-branch CI run](https://github.com/ciel-shieru/JankTime2/actions). On this branch, "production-mode" means preview fixtures are disabled; it still contains this branch's diagnostic screen.

## Install without replacing Gravel

1. Keep Gravel installed. Do not uninstall, clear its storage, or install a rebuilt Gravel APK for this test.
2. Open Gravel and use its normal Bluetooth **Apps → Sideload App** flow to install the PBW, following the flow described by [Gravel issue #37](https://github.com/david-cant-code/pebble-app-degoogled/issues/37).
3. Launch JankTime2 and keep it open on the watch during the test.
4. In the native JankTime2 companion, change `grid.top.1` to **None** and press Save once. No provider configuration is needed for this test.
5. Read the diagnostic screen:
   - If RX remains `0`, the watch-side receiver has not read any messages in this running session.
   - If RX increases and `Last` shows a message, delivery reached the Alloy receiver.
   - If the target mapping changes from `focusCount` to `none`, the receiver applied the slot assignment in memory. If the normal face had remained unchanged, the failure likely lies beyond phone-side send acknowledgement and in the running build or rendering path.
   - If RX increases but the mapping does not change and the outcome is `rejected`, send the displayed outcome and counters.
6. Take a clear photo of the watch after Save. Record the time of the test and which PBW commit/CI run was installed.

## What to send back

Attach a photo of the diagnostic screen, the phone's `JankTime2Sync` Logcat output for the same Save operation, the exact slot change you made, and the installed branch commit or CI run URL. The phone-side log helps correlate its packet sends/acknowledgements with the on-watch RX count.

For Android Logcat, with USB debugging enabled:

```sh
adb logcat -v threadtime -s JankTime2Sync
```

Press Ctrl-C after the test. Do not share credentials, full configuration backups, task/calendar titles, or provider values.

## Return to the normal watchface

After collecting the diagnostics, reinstall the production PBW generated from the regular PR #1 branch (or another approved release). The temporary diagnostic mode is enabled only by `DIAGNOSTIC_MODE = true` in this branch's `src/ts/watch/config.ts`; that flag must not be cherry-picked into the normal branch.
