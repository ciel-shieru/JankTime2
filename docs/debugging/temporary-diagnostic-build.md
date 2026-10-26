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

The reverse diagnostic channel requires a **matching diagnostic companion APK** as well as the PBW, because the existing companion build did not register a watch-to-phone listener.

1. Keep Gravel installed. Do not uninstall it, clear its storage, or install a rebuilt Gravel APK.
2. First update the existing JankTime2 companion **in place** using the `app-debug.apk` artifact from the same successful CI run as this diagnostic branch. The CI APK is signed with the repository's private debug signing key. If Android reports a signature/package conflict, **stop—do not uninstall the existing companion or clear its data**; report the error before proceeding.
3. Open Gravel and use its normal Bluetooth **Apps → Sideload App** flow to install the diagnostic PBW, following the flow described by [Gravel issue #37](https://github.com/david-cant-code/pebble-app-degoogled/issues/37).
4. Launch JankTime2 and keep it open on the watch during the test.
5. Start Android log capture before launching the watchface:
   ```sh
   adb logcat -v threadtime -s JankTime2Sync
   ```
6. Look for `event=watch_diagnostic_app_opened` followed by `event=watch_receiver_diagnostic outcome=waiting rx=0` (field order may vary). This `waiting` status is sent by the watch even before any inbound packet arrives and validates the watch-to-phone direction.
7. In the native JankTime2 companion, change `grid.top.1` to **None** and press Save once. No provider configuration is needed for this test.
8. Read the diagnostic screen and the Android log:
   - Startup diagnostic arrives but RX remains `0` after Save: watch-to-phone works, but phone-to-watch delivery is not reaching `Message.onReadable()`.
   - RX increases and outcome is `slot_applied`: the incoming message reached the receiver and was accepted.
   - The mapping changes from `focusCount` to `none`: the receiver updated the slot in memory and invoked redraw.
   - No startup diagnostic ever appears in Logcat: verify the companion APK was updated in place, Gravel is still the selected PebbleKit app, and the matching watchface is open.
9. Take a clear photo of the diagnostic screen after Save. Record the time and the PBW/CI run installed. Stop Logcat with Ctrl-C.

## What to send back

Attach a photo of the diagnostic screen, the phone's `JankTime2Sync` Logcat output for the same Save operation, the exact slot change you made, and the installed branch commit or CI run URL. The phone-side log helps correlate its packet sends/acknowledgements with the on-watch RX count.

For Android Logcat, with USB debugging enabled:

```sh
adb logcat -v threadtime -s JankTime2Sync
```

Press Ctrl-C after the test. Do not share credentials, full configuration backups, task/calendar titles, or provider values.

## Return to the normal watchface

After collecting the diagnostics, reinstall the production PBW generated from the regular PR #1 branch (or another approved release). The temporary diagnostic mode is enabled only by `DIAGNOSTIC_MODE = true` in this branch's `src/ts/watch/config.ts`; that flag must not be cherry-picked into the normal branch.
