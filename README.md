# BELT RUN: DRAG LEGENDS (mobile rebuild)

A landscape mobile drag racer in the style of Drag Racing Classic. It uses your 67 car images, a realistic physics model, and manual shifting. It ships two ways:

- **Phone web app (PWA):** the `www/` folder. Open it, then use "Add to Home Screen".
- **iPhone app:** the `ios/` folder, a Capacitor wrapper. Open it in Xcode.

## Play locally
```
npm run serve        # http://localhost:8080  (any static server works)
```
Controls on a phone:
- **GAS** pedal (right).
- **SHIFT ▲** (left), with **▼** to downshift.
- **N₂O** button (shown once nitrous is installed).

Keyboard: ↑ / W / Space = gas, → / D = shift up, ← / A = shift down, N = nitrous, Esc = pause.

## Build the iPhone app (Mac + Xcode 16+)
```
npm install
npx cap sync ios     # copies www/ into the Xcode project
npx cap open ios     # opens ios/App/App.xcodeproj
```
In Xcode:
1. Select the **App** target → Signing & Capabilities → choose your Team.
2. Change the bundle id from `com.beltrun.draglegends` if you need to.
3. Plug in your iPhone and press Run.

About the iOS project:
- The app is locked to landscape and runs without a status bar.
- Haptics use `@capacitor/haptics`.
- Native packages come through Swift Package Manager (no CocoaPods).

After changing anything in `www/`, run `npx cap sync ios` again.

## How the game works
- **Garage:** your selected car, its stats, and the menus.
- **Career:** 10 classes. Each car's class comes from its simulated stock ¼-mile time. Every class has a ladder of 6 events plus a boss, and first wins pay the full prize.
- **Honda Cup:** a Honda-only ladder in Jamaica.
- **Quick Race:** repeatable races. You pick the distance (⅛, ¼ or ½ mile), difficulty, venue and an optional side bet.
- **Test Pass:** a solo run that records your personal best.
- **Upgrades:** 7 systems with 5 stages each (engine, turbo/supercharger, intake & exhaust, nitrous, weight, tires, transmission). Each stage changes the physics model, not just the displayed numbers.
- **Tuning:**
  - Launch rpm, tire pressure, final drive and traction control (street / sport / off).
  - Individual gear ratios, unlocked by Transmission stage 1.
  - Nitrous duration.
  - A dyno chart and a "robot" predicted ET.
- **Race flow:** rev into the green zone during the 3-2-1 countdown, and the clutch drops on green.
  - Launch ratings: perfect, good, bog, or wheelspin.
  - Shift ratings: perfect, good, early, or late.
  - Cars with launch control hold rpm for you. Manual cars without it need you to feather the pedal.
- **Venues:** New York, Florida, Georgia, Texas and Jamaica. Each has its own grip, air density and scenery.
- **Starting garage:** your gloss-black 2022 X4 M Competition (gift, labeled as a 1,200 HP custom-build target and game estimate), plus a Civic Si and an M240i.
- **Unlockable builds:** Buj's yellow single-turbo M4 unlocks at 3 wins and the 1Stock build at 5 wins. The bumper-delete Huracán is also in the roster.
- **Saves:** stored on the device under the key `beltrun-mobile-v1`. A cash bonus carries over from older Belt Run saves.

## Physics
The model is a fixed 240 Hz longitudinal simulation (`www/js/sim/`). It covers:
- Torque curves for NA, turbo and supercharged engines.
- Boost spool and clutch slip with launch modulation.
- Weight transfer and a traction limit that falls off while sliding.
- Traction control.
- Shift torque interruption and the rev limiter.
- Aero and rolling drag.
- Nitrous as a fixed-power shot.

The player and the AI use identical physics.

Data sources:
- Factory hp and torque come from the roster's sources.
- Mass, gearing, wheelbase (measured from each car image), and all upgrade effects are game estimates.

Validation (`npm test`):
- Simulated peak power is within 3% of the rated figure for every car.
- Stock ¼-mile times are within 10% of published magazine times for the benchmark cars, typically 2–9% slower.
- The Hellcat benchmark is excluded because it was run on drag radials.

## Sound
Engine sound is procedural: an AudioWorklet synthesizes firing pulses for each engine layout. It is driven every frame by the physics, using rpm, load, real boost, shift cuts, the limiter, wheelspin and nitrous.
- There are no recordings, and nothing is taken from commercial games.
- There is a mute switch, plus separate engine and effects volume controls.
- Audio unlocks on your first tap and pauses when the app is hidden.

## Tests
```
npm test                                   # physics, career/economy, audio DSP, audio↔physics control
python3 tests/e2e/race.py http://localhost:8080/    # Playwright: full career race in landscape
python3 tests/e2e/venues.py … / sizes.py …          # venues, nitrous, iPhone SE / iPad / portrait prompt
```

## Regenerating data
`npm run gen` rebuilds the following files:
- `cars.js`, from `tools/source-data.cjs` and the wheel calibration.
- The class table (`stock-et.js`).
- The service-worker precache list.

## Known limits
- Car images are static side views. The wheels rotate, but there is no 3D.
- The opponent drives in the far lane, drawn smaller to suggest perspective.
- iOS Safari does not support `navigator.vibrate`, so haptics only work in the iPhone app build.
- Some FWD and manual-transmission 60-foot times run a little slow compared with real cars.
