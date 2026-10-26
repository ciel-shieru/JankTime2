# Watch–companion AppMessage protocol

Protocol version 1 is intended for the native PebbleKit Android 2 companion configured in package.json. The watch accepts only typed, bounded display values. Never send raw provider JSON or an arbitrary resource path from a provider.

Each AppMessage uses fixed keys TYPE, ID, VALUE, FLAGS, and EXTRA. EXTRA is reserved for future compatible extensions. The Alloy SDK assigns AppMessage wire IDs as `10000 + index` in `package.json`'s `messageKeys` order: `TYPE=10000`, `ID=10001`, `VALUE=10002`, `FLAGS=10003`, and `EXTRA=10004`. The watch receiver pins those IDs in an explicit `Map`, and the Android sender must use the same IDs. Do not use legacy zero-based IDs (`0`–`4`): the transport can acknowledge delivery while the Alloy receiver fails to match any key.

- slot: ID is one of the eleven slot IDs; VALUE is an allowlisted metric ID. This changes only that slot.
- metric: ID is a metric ID; VALUE is a display string no longer than 200 characters; FLAGS is 0 (fresh) or 1 (stale).
- status: ID is phoneBattery (VALUE 0–100), phoneBluetooth (VALUE 0/1), alarmTime (VALUE HH:mm and FLAGS 0 alarm / 1 bedtime), heartRate (VALUE 20–240 bpm), or heartSamples (VALUE comma-separated 20–240 bpm values, 2–56 samples).
- row: ID is focus.1, focus.2, calendar.1, or calendar.2; VALUE is the already formatted bounded row. Watch rendering hard-clips by pixel width and never adds ellipses.

The receiver validates packet kind, IDs, metric/slot allowlists, numeric bounds, HH:mm syntax, graph count/range, and string sizes before updating state. Invalid packets are ignored. Phone-side credentials and source cache stay on the phone. The watch retains last received values in memory; persistent cache/staleness policy belongs in the companion.

Send small updates individually instead of a large tuple. The companion should rate-limit duplicate updates, send only changed data where possible, and handle PebbleKit Android transmission errors. No password, token, or raw REST response belongs in EXTRA.
