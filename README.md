# JankTime2 — Pebble Time 2 (emery) watchface

JankTime2 is a low-power information-dense Pebble Time 2 watchface for the 2026 hardware edition, codename **emery**. The attached approved image defines the layout. The first PR is intentionally the foundation phase: project scaffolding, requirements, architecture decisions, reproducible checks, and screenshot-artifact CI land before the display and provider implementation.

> **Current phase:** approved-layout renderer prototype. The watch draws the composition, a live 24-hour clock, the independently modeled metric slots, and sample content for screenshot review. Sample metrics, task/event rows, phone battery, and alarm time are visual fixtures, not live health, Home Assistant, Prometheus, Mindwtr, calendar, phone-battery, or Wakey data. Provider adapters, the configurator, the native Android companion, and the live user-uploaded image path still need implementation and testing.

## Goals and non-goals

- Target the emery Pebble Time 2 at 200×228 pixels.
- Use TypeScript compiled to JavaScript for Core Devices/RePebble Alloy; use Poco for deliberate pixel positioning.
- Preserve the approved screen composition and the specific semantics listed below.
- Keep all remote credentials on the phone and send only small display snapshots to the watch.
- Use the watch's e-paper-friendly default background tint. Draw standard foreground text and separators in black; keep the specified accent colors for designated icons and battery indicators.
- Do not call third-party weather providers or the Pebble mobile-app weather provider. Home Assistant is the weather provider.
- Do not implement the robot 3/5 metric initially; its slot remains configurable and can be set to none.
- Do not add animations or second-by-second redraws.

## Approved display requirements

### Status bar

Show weekday/date, the next alarm time (or bedtime when bedtime is scheduled earlier than the next alarm), current Bluetooth connectivity for the watch and paired phone, phone battery, and watch battery. The watchface clock and all times use local 24-hour HH:mm format with a leading zero and no seconds. For example, 09:30 must remain 09:30.

The phone battery is the yellow icon and the watch battery is blue. Both are horizontal battery outlines with their percentage drawn **inside** the outline. Do not swap their meanings or colors.

### Metrics, clock, and image

The first metric row contains five slots: focus count, steps, total sleep, restful sleep, and fan state in the default layout. The second metric row contains four metric slots with a reserved image cell in the middle: CPU usage, memory usage, image, weather condition icon plus feels-like temperature, and alert count. The layout therefore has nine metric slots in the two-row grid. The large central clock has two additional metric slots to its left and right, making **eleven individually configurable metric slots**. See docs/design/layout.md for the complete identifiers.

Every metric slot has an independent configuration choice; the metric assignment is not hard-coded to the default shown in the approved layout. A slot can be set to none when appropriate. Metrics must use bounded rendering so values cannot corrupt adjacent slots.

The second-row middle cell is reserved for a user-uploaded image, not a metric. The phone configurator must downscale/crop the image to the image cell's actual native pixel dimensions **on the phone before** transferring the image to the watch. Do not send an original camera-resolution image over Bluetooth.

The large center clock shows HH:mm only. Around it, the side slots remain independent. The left-side robot 3/5 metric is explicitly out of scope initially. The right-side water percentage is represented by a selectable metric/data source rather than a hard-coded value.

### Heart rate

Draw the watch's heart-rate data above the two focus rows and two calendar rows. Show current BPM and a compact graph with minimum/maximum values for the displayed graph window. The screenshot values 72 and 54/92 are examples/placeholders only, not constants. Historical heart-rate data and sleep totals must come from Pebble Health data rather than fabricated values.

### Focus items and calendar lines

Reserve two lines for the next two Mindwtr items explicitly starred as today's focus items. Render each as:

~~~text
HH:mm | HH:mm | priority-as-exclamation-marks | title
~~~

The first time is the start time and the second is the due time. Priority becomes zero or more exclamation marks according to the documented priority mapping. Clip overflowing text abruptly; never add ellipses.

Reserve two lines for the next calendar events from calendars selected in configuration. Render each as:

~~~text
HH:mm | location-clipped-to-10-characters | title
~~~

Clip overflow abruptly without ellipses. Let the user choose which synced phone calendars are included and configure regex blocklist patterns that exclude matching event text from both lines. Reject invalid regex at configuration time and bound pattern length to prevent pathological input.

### Data and error behavior

- Cache the last successful display snapshot and reuse stale data when a fetch fails.
- Change affected metric icons from their normal blue accent to red when their underlying data is stale.
- Refresh Home Assistant data every 3 minutes by default, configurable from 1 to 60 minutes.
- Refresh Prometheus data every 5 minutes by default, configurable from 1 to 60 minutes.
- Refresh Wakey-SITizen data every 5 minutes by default, configurable from 1 to 60 minutes.
- Refresh Mindwtr data every 5 minutes by default, configurable from 1 to 60 minutes.
- Validate every user-configured refresh interval as an integer from 1 through 60. Do not interpret invalid settings as an unlimited or aggressive polling interval.

## Provider requirements

### Home Assistant

Use direct HTTPS requests from the native phone companion to a configured Home Assistant instance. Do not use Home Assistant's Android app as an implicit integration, and do not use the Pebble weather provider or any third-party weather API.

Support:
- sensor entities;
- weather entities, including the current condition, a feels-like/apparent-temperature value when provided by the selected integration, and rain/precipitation chance from the selected entity's supported forecast API;
- climate entities, including a selectable state/attribute to display a specific climate value.

Weather integrations expose different attributes. The implementation must inspect the selected entity's attributes and use Home Assistant's supported forecast endpoint/action for rain chance; it must never fabricate unsupported weather attributes. If no apparent/feels-like value is available, show a configured fallback (such as current temperature) clearly rather than silently implying it is feels-like.

The user configures the weather entity separately. The weather condition icon and feels-like temperature are one combined metric. Rain chance is a separate selectable metric. Keep HA credentials on the phone; do not pass tokens to the watch.

### Prometheus and Alertmanager

Use an HTTPS Prometheus HTTP API-compatible endpoint through the phone network connection. A user-specified instant PromQL query selects the CPU value and another query selects the memory value. Numeric or text results are sufficient for the initial implementation. Prefer counting Alertmanager active-alert metrics scraped into Prometheus (for example, `sum(alertmanager_alerts{state="active"})`) when present. Document the distinction between Alertmanager active alerts after suppression and Prometheus rule series in `ALERTS{alertstate="firing"}`; permit a configurable fallback query where the Alertmanager metric is not scraped. The implementation must not label the rule-series count as Alertmanager's active-alert count.

Refresh defaults to 5 minutes and is configurable from 1 to 60 minutes. Design the provider contract so range queries and plotted graph history can be added later without changing the watch-facing transport schema.

### Wakey-SITizen

Read the upcoming alarm and calculated bedtime from Wakey-SITizen. If an upcoming bedtime is scheduled earlier than the next alarm, show the bedtime time and bedtime icon in the status bar; otherwise show the next alarm. Refresh defaults to 5 minutes and is configurable from 1 to 60 minutes.

PebbleKit JS cannot directly read another Android application's private DataStore. A separate opt-in, read-only export surface in Wakey-SITizen is therefore required; its companion PR is tracked as follow-up work. The selected contract is documented in ADR-0005 and docs/integrations/wakey-sitizen.md.

### Mindwtr

Use the self-hosted Mindwtr Cloud REST API over HTTPS with a read-only bearer token, not direct access to the Android app's private files. The configured server URL is the user's instance. Request today's focus items and derive:
- the next two focus items, in start/due-time order;
- remaining focus items for today;
- total items that were assigned today's focus, including completed items that remain in the API's history response.

Show the remaining/total pair in the circle-check metric (for example, 4 / 7). Refresh defaults to 5 minutes and is configurable from 1 to 60 minutes.

### Synced phone calendar and phone battery

Use an Android companion bridge to read only calendars the user selects, plus phone battery state. This cannot safely be fabricated using watch-side APIs or by assuming that the PebbleKit JS sandbox can access Android system providers. See ADR-0003.

## Configuration requirements

The companion configurator must allow:
- individual assignment of a metric to each of the eleven metric slots;
- Home Assistant base URL, access token, sensor/weather/climate entity selection, and the climate value/attribute to display;
- Prometheus base URL, credentials if required, CPU and memory PromQL expressions, and refresh interval;
- Mindwtr HTTPS base URL, bearer token, and refresh interval;
- Wakey-SITizen pairing with its read-only export and refresh interval;
- selected calendar sources, event regex blocklist, and the two-line formatting options;
- image upload with on-phone downscaling to the native image-cell size;
- Home Assistant, Prometheus, Wakey-SITizen, and Mindwtr refresh intervals, each separately configurable from 1 through 60 minutes.

Credentials must be stored with Android Keystore-backed protection and must never be echoed to watch storage, AppMessage payloads, logs, screenshots, or CI artifacts.

## Architecture and repository layout

- src/ts/watch/: TypeScript source for the watch.
- src/embeddedjs/: generated Alloy JavaScript output; never edit or commit generated files.
- src/c/mdbl.c: Alloy virtual-machine boot entry.
- src/embeddedjs/manifest.json: Moddable module manifest.
- .agents/skills/pebble-watchface/: pinned copy of the Core Devices watchface agent skill, references, scripts, and templates.
- companion/README.md: phone-side Android companion contract. Native companion implementation is a separate implementation phase.
- docs/design/: approved layout and provider contracts.
- docs/adr/: architecture decision records.
- .github/workflows/ci.yml: pinned-toolchain typecheck/lint/test/build/emery screenshot pipeline.

The native Android companion is the single phone-side bridge for REST APIs and Android-only data. This avoids the incompatible dual-runtime assumption that a watchface can use both PebbleKit JS and a PebbleKit Android companion simultaneously. The watch receives display-sized data only.

## Build, lint, test, and screenshot

Prerequisites: Node.js 22.16.0, Python 3.12, Pebble Tool 5.0.40, and Pebble SDK 4.33.1. See the official SDK installation guide and the pinned skill references.

On a configured development machine:

~~~sh
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run build:watch
pebble build
pebble install --emulator emery
pebble screenshot --no-open --emulator emery artifacts/screenshot_emery.png
~~~

The GitHub Actions workflow performs these checks on pull requests and pushes and uploads the emulator screenshot/logs as a CI artifact. The screenshot smoke check verifies native 200×228 resolution and rejects the uniform mid-gray Alloy fatal dialog; this catches the actual failure mode seen during the first emulator launch, when the CLI command succeeded despite the app exiting with `memory full`. It is a crash smoke test, not a replacement for visual review. The Pebble CLI has the build, install, emulator, and screenshot commands; project linting and unit tests are provided by the Node/TypeScript checks rather than nonexistent Pebble CLI subcommands.

The emulator screenshot now exercises the approved screen composition with preview fixtures. It is not evidence that live providers work or that every visual detail is accepted; inspect the artifact for clipping, text overflow, alignment, colors, and overlap, then repeat the review after live data and image-transfer support are connected.

## Future display expansion

Prometheus numeric/text snapshots are deliberately small. A later phase can add range-query requests and a bounded downsampled graph series, then draw that series in the same native graph area. The initial data contract should preserve a provider/source identifier, timestamp, value, and staleness state to allow this without changing layout code.

## Documentation

Architecture choices and alternatives are in docs/adr/. Decisions involving platform API limits are grounded in the official RePebble documentation linked in those ADRs. Any new provider must update the provider contract, security review, tests, and relevant ADR.
