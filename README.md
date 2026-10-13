# 🛺 Rickshaw Rush

An offline, one-handed **endless lane-runner** for Android. You drive an
auto-rickshaw through traffic — dodge cars, buses, trucks, potholes and the
occasional cow, collect ₹ notes for points and grab a **cutting chai** for a
temporary shield.

Built as a **native Android app** with a hard constraint that keeps it small and
dependency-free:

| Constraint | How it's met |
| --- | --- |
| No image assets | Everything is drawn with `Canvas` primitives — see [`Art.java`](app/src/main/java/com/pushparaj/rickshawrush/Art.java) |
| No audio assets | Every SFX is synthesised sample-by-sample at runtime — see [`SoundEngine.java`](app/src/main/java/com/pushparaj/rickshawrush/SoundEngine.java) |
| No third-party libraries | `dependencies {}` in [`app/build.gradle`](app/build.gradle) is genuinely empty — not even AndroidX |
| No INTERNET permission | Fully offline; Play Store data-safety form stays trivial |

The result is an APK in the low hundreds of kilobytes that renders identically
at every screen density.

---

## How to play

- **Tap the left half** of the screen → move one lane left
- **Tap the right half** → move one lane right
- **Swipe left / right** → same thing, for when you prefer gestures
- **Chai cup** → 3 seconds of shield; while shielded, hitting traffic smashes the
  vehicle instead of you
- **₹ note** → +10 points
- You start with **3 lives** and a brief invulnerability blink after each hit
- Speed ramps continuously from ~35 km/h to ~100 km/h; spawn rate tightens with it

High score, total notes and run count persist across launches via
`SharedPreferences`. The 🔊 button in the top-right mutes the synthesised audio.

---

## Getting an APK

### Option A — GitHub Actions (no Android Studio needed)

Every push to any branch builds both variants. Open the repo's **Actions** tab →
latest *Build APK* run → **Artifacts** at the bottom, and download
`RickshawRush-v<version>-<sha>.zip`.

Or straight from the CLI:

```bash
gh run list --workflow build-apk.yml --limit 1          # find the run
gh run download <run-id> -n <artifact-name> -D apks/    # unzip into apks/
```

Inside the zip:

| File | Size | What it is |
| --- | --- | --- |
| `RickshawRush-debug.apk` | ~951 KB | Signed with the auto-generated **debug** key. Install directly: `adb install RickshawRush-debug.apk`. Package id gets a `.debug` suffix, so it can live next to the release build. |
| `RickshawRush-release-UNSIGNED.apk` | ~710 KB | Release build, **unsigned** — sign it yourself (see below). |
| `SHA256SUMS.txt` | | Checksums for both. |
| `build.log` | | Full Gradle output, handy when a build fails. |

The exact sizes and SHA-256 of each build are also published as **notice
annotations** on the run, so you can confirm what was produced without
downloading anything:

```bash
gh api repos/pushparaj9749/game/actions/runs/<run-id>/jobs   --jq '.jobs[0].id' | xargs -I{}   gh api repos/pushparaj9749/game/check-runs/{}/annotations   --jq '.[] | select(.annotation_level=="notice") | .message'
```

The workflow is [`​.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml).
It relies only on what the GitHub-hosted `ubuntu-latest` image already ships
(JDK 17, Gradle, SDK platforms 34–37, build-tools 34–37), so there is nothing to
install and no license acceptance step.

### Option B — build locally

```bash
./gradlew assembleDebug              # app/build/outputs/apk/debug/
./gradlew assembleRelease            # app/build/outputs/apk/release/ (unsigned)
```

Requirements: JDK 17+, and either `ANDROID_HOME` set or a `local.properties`
containing `sdk.dir=/path/to/android/sdk`. Android Studio will create
`local.properties` for you automatically when you open the folder.

### Signing the release APK yourself

1. Create a keystore once (keep it safe — losing it means losing your Play Store listing):

   ```bash
   keytool -genkeypair -v -keystore release.keystore -alias rickshaw \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Sign with `apksigner` (from `build-tools/`), which produces the v2/v3 signed
   APK the Play Store expects:

   ```bash
   zipalign -f 4 RickshawRush-release-UNSIGNED.apk aligned.apk
   apksigner sign --ks release.keystore --ks-key-alias rickshaw \
     --out RickshawRush-release.apk aligned.apk
   apksigner verify --verbose RickshawRush-release.apk
   ```

   For Play Store uploads, build an `.aab` instead:
   `./gradlew bundleRelease`, then sign the bundle the same way.

3. **Optional — let CI sign for you.** Add these four repository secrets
   (Settings → Secrets and variables → Actions) and the workflow automatically
   emits a signed `RickshawRush-release.apk` instead of the unsigned one:

   | Secret | Value |
   | --- | --- |
   | `KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
   | `KEYSTORE_PASSWORD` | store password |
   | `KEY_ALIAS` | `rickshaw` |
   | `KEY_PASSWORD` | key password |

   Nothing is committed to the repo; the keystore is decoded into the runner's
   build directory at configuration time and disappears with it.

### Bumping the version

`gradle.properties` is the single source of truth — both the app and the CI
artifact name read from it:

```properties
VERSION_CODE=1        # must increase for every Play Store upload
VERSION_NAME=1.0.0
APP_ID=com.pushparaj.rickshawrush
```

---

## Project layout

```
app/src/main/java/com/pushparaj/rickshawrush/
├── MainActivity.java    Activity host; forwards onResume/onPause to the view
├── GameView.java        SurfaceView + game thread: loop, physics, input, screens
├── Art.java             All procedural drawing (road, traffic, chai, HUD, menus)
├── SoundEngine.java     Streaming AudioTrack synth: engine hum + 7 one-shot SFX
└── Config.java          Every tunable number in one place
tools/
├── make_icons.py        Generates the legacy mipmap PNGs (needs Pillow)
└── verify_sources.py    JDK-free static checks: signatures, resources, XML, braces
```

### The virtual-resolution trick

All gameplay runs in a fixed **1080 × 1920 design space**. `GameView.resize()`
computes a single `scale` plus letterbox offsets, so speed, hitboxes and layout
are pixel-identical on a 720p phone and a 1440p one. Touch coordinates are mapped
back through the same transform before any hit-testing.

### Tuning the game

Everything worth balancing lives in [`Config.java`](app/src/main/java/com/pushparaj/rickshawrush/Config.java):
starting and maximum speed, the difficulty ramp, spawn intervals, chai shield
duration, pickup probabilities, lives, lane-change speed. Enemy vehicle types and
their spawn weights are in `GameView.newObstacle()`.

### Launcher icons

`res/mipmap-anydpi-v26/` holds the adaptive icon (vector foreground, so it scales
perfectly and supports Android 13 themed icons via the `-v33` variant). Because
`minSdk` is 24, `tools/make_icons.py` also generates real PNGs into
`res/mipmap-<dpi>/` for API 24–25 — run it again if you restyle the icon.

---

## Development notes

- **No JDK in the dev sandbox.** `tools/verify_sources.py` exists for exactly that
  reason: it catches the mistakes a compiler would, before spending a CI run on
  them. Run it before pushing:

  ```bash
  python3 tools/verify_sources.py
  ```

  It currently checks: XML well-formedness, that every `@type/name` and
  `R.type.name` reference resolves, that every `Art.*` / `sound.*` call matches a
  definition by argument count, that the required `SurfaceView` / `Activity` hooks
  exist, brace and paren balance, numeric literals that overflow `int`, qualified
  names used as `switch` case labels, and accidental weaker-access overrides of
  public `android.view.View` methods.

  Every one of checks 6–8 was added *because* CI caught that bug for real. They
  are the three Java rules that are easiest to get wrong in a Canvas-heavy
  codebase and impossible to test without a compiler:

  | Bug | javac says | Rule |
  | --- | --- | --- |
  | `int c = 0xFF14331F;` | `integer number too large` | above `0x7FFFFFFF` needs an `L` |
  | `int c = 0xFF14331FL;` | `possible lossy conversion from long to int` | …and *also* an `(int)` cast — JLS narrows int constants, never long ones |
  | `case GameView.OBST_CAR:` | `constant expression required` | JLS 14.11/15.29: a case label may not be a qualified name |
  | `private void draw(Canvas)` | `attempting to assign weaker access privileges` | `View.draw(Canvas)` is already public |

- **Reading CI failures.** Raw Actions logs and artifact zips are served from
  hosts other than `api.github.com`
  (`productionresultssa*.blob.core.windows.net`,
  `results-receiver.actions.githubusercontent.com`), which restricted networks
  often block. The workflow therefore reports failures through the API instead: a
  commit comment plus an `::error` annotation carrying the *What went wrong*
  block. Read them with:

  ```bash
  gh api repos/pushparaj9749/game/commits/<sha>/comments --jq '.[].body'
  gh api repos/pushparaj9749/game/check-runs/<job-id>/annotations
  ```

- **Frame pacing.** The loop clamps `dt` to `Config.MAX_DELTA` (50 ms) so an
  ANR or a backgrounded app can't teleport obstacles through the player.

- **Zero GC churn while playing.** `Entity` and `Particle` objects are pooled;
  drawing reuses shared `Paint`/`RectF`/`Path` instances.

- **Sound** is one `AudioTrack` in `MODE_STREAM` fed by a daemon thread that mixes
  a continuous engine hum (pitch follows speed) with up to 8 one-shot voices
  through a soft limiter. `setMuted(true)` parks the thread instead of burning CPU.

## License

No license file yet — tell me which one you want (MIT and Apache-2.0 are the
usual picks) and it'll be added.
