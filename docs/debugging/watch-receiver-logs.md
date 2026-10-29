# Debugging the watch-side AppMessage receiver

Use this guide when the Android companion reports that AppMessage packets were acknowledged but the watchface did not visibly apply its configuration. The Android sender's acknowledgement is not, by itself, proof that the watch-side TypeScript receiver accepted the slot assignment and redrew the face. Alloy assigns the `messageKeys` array IDs starting at `10000`; the native sender must use IDs `10000`–`10004`, not `0`–`4`, or the named-key receiver will never match the packet.

## What the watch logs contain

The watch receiver writes log lines prefixed with `[JankTime2Receiver]`. Expect lifecycle markers such as:

```text
[JankTime2Receiver] event=receiver_initialized slot_count=11 metric_count=14
[JankTime2Receiver] event=redraw_handler_registered
[JankTime2Receiver] event=slot_update_applied slot=grid.top.1 previous=focusCount metric=none redraw_invoked=true
```

A `slot_update_applied` line is emitted only after the receiver validates the slot and metric IDs, updates the in-memory slot configuration, and the redraw callback returns. The `previous` and `metric` fields are fixed, validated identifiers—not live provider values. Rejected packets and handler failures use fixed reason codes.

The receiver deliberately does **not** log metric values, focus/calendar row text, image data, raw dictionaries, credentials, provider URLs, or exception messages. Pebble log traffic uses the same Bluetooth link as AppMessage, so capture one controlled sync rather than repeatedly pressing Save.

## Capture logs from a physical watch

1. Use the **production watchface build from the same repository revision that contains these receiver logs**. An older installed PBW cannot emit the new lines. Do not use the fixture-enabled screenshot build.
2. In the phone app that manages the watch, enable its Developer Mode and Developer Connection. Note the phone app's **Server IP**. The computer must be able to reach that IP; it is the phone's server IP, not the watch's Bluetooth address. The exact menu names can differ by mobile-app version.
3. On the Mac, with the Pebble CLI installed, start log capture in Terminal. Replace the sample IP with the phone's Server IP:

   ```sh
   pebble logs --phone 192.168.1.20 2>&1 | tee /tmp/janktime2-watch.log
   ```

   This command streams continuously and writes the same output to `/tmp/janktime2-watch.log`. Leave it running during the test. Press **Ctrl-C** when the test is complete.

4. Start capture **before** launching or relaunching JankTime2 so the startup messages are included. If it is already active, switch away and relaunch it from the watch/manager UI while the log command is running. Keep the watch connected to the phone.
5. If you use the CLI's CloudPebble connection instead of the phone's Developer Connection, the alternative is `pebble logs --cloudpebble`; it requires the relevant Pebble CLI account/session and app installation to be available through CloudPebble.

For an emulator, use `pebble logs --emulator emery` instead. For this issue, physical-watch logs are more useful because they verify the actual installed PBW and phone/watch transport.

## Capture the matching Android log

Start a second Terminal session before pressing Save/Refresh:

```sh
adb logcat -v threadtime -s JankTime2Sync 2>&1 | tee /tmp/janktime2-android.log
```

Leave it running for the same test window, then press **Ctrl-C**. This captures the companion's send/acknowledgement timeline. If your log tag differs in your installed build, use the same Logcat filter/tag that produced the existing `JankTime2Sync` messages.

## Reproduce with one controlled change

1. Start both log captures.
2. Relaunch JankTime2 and wait for `receiver_initialized` and `redraw_handler_registered`.
3. In the JankTime2 companion, change one visible slot from a metric to **None**—for example, `grid.top.1` from `focusCount` to `none`—then press Save once. This check does not require any provider endpoint or credential to be configured. The selected cell should clear.
4. Note the local time and time zone when you pressed Save, whether the slot visibly cleared, and whether the phone log ends with `watch_sync_send_completed`.
5. Stop both captures and share:
   - `/tmp/janktime2-watch.log` and `/tmp/janktime2-android.log`;
   - a watch screenshot from immediately before/after the change, if practical;
   - the slot change you made and whether it appeared on the watch;
   - the repository commit or CI artifact revision used to install the watchface.

Do not include provider tokens, credentials, full configuration backups, private task/calendar titles, or unredacted credential-bearing URLs. The new receiver trace should not need any of those.

## Interpreting the result

- **No `receiver_initialized` line:** the log stream may have attached too late, JankTime2 was not relaunched, or the installed watchface is an older/different build.
- **Initialization and redraw registration appear, but no `first_message_received` or `slot_update_applied` after the phone logs show slot packets being sent:** confirm that the installed PBW and Android companion use the Alloy wire IDs `10000`–`10004` and come from the same revision. Older senders using IDs `0`–`4` do not match the Alloy receiver.
- **`slot_update_applied ... redraw_invoked=true` appears for the changed slot but the cell does not clear:** the receiver processed the assignment and the redraw callback returned; the remaining problem is likely in the active build/rendering path. Include the screenshot and exact build revision.
- **`redraw_invoked=false`:** the assignment arrived before a redraw callback was registered.
- **`slot_update_rejected` or `message_handler_failed` appears:** include those lines and the surrounding timestamps. The trace intentionally omits raw packet contents.

