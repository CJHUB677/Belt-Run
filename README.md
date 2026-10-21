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
- **Quick Race:** repeatable races. You pick the distance (⅛, ¼, ½ or 1 mile), difficulty, venue and an optional side bet.
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


## Story, modes and style (October update)
- **Story career:** 10 chapters, one per class, each in its own city: Brooklyn → Miami → Atlanta → Detroit → Houston → Los Angeles → Las Vegas → Tokyo → Dubai → back to Brooklyn for the Ghost.
  - Every class ladder has 12 races plus a boss (130 races in total), with two named rival races per chapter.
  - Story cards with your crew (Dre and Nia) appear at the start of each chapter and before rival and boss races. A chapter outro plays after you beat each boss.
  - The Honda Cup in Jamaica has its own short story.
- **New venues:** Detroit (cold, dense air), Los Angeles, Las Vegas (hot, thin air, so naturally aspirated cars lose power), Tokyo and Dubai, each with its own scenery.
- **Modes tab:**
  - **Knockout Cup:** 3 rounds and you're out if you lose once.
  - **Bracket Racing:** set a dial-in time; running quicker than your dial is a breakout and loses. Rival drivers lift near the finish to avoid breaking out.
  - **Highway Roll:** a half mile from a 40 mph rolling start.
  - **Daily Challenge:** a stock car, venue and target time that change every day.
  - **4-Lane Showdown:** you and three class rivals across four lanes. Only first place is paid.
  - **Mile Monster:** a standing mile against a car one class up.
  - **No-Prep Night:** grip down 35% and no nitrous, over an eighth mile.
- **Online: up to 4 phones in one room.** Each racer gets a lane, and the room host picks the distance (up to 1 mile) and venue. The race starts when everyone (2 or more) taps Ready. The result shows your finishing place.
- **JDM and Honda tuner builds:** 10 fictional builds that reuse the stock cars' photos with their own paint and specs. All figures are game estimates.
  - Honda: the Civic 9-Second Twin Turbo (EK, twin-turbo K24, sequential gearbox, drag radials; about 9.9 s stock, unlocks at 6 wins) and an Integra K20 Turbo.
  - JDM: Skyline GT-R 1000, R32 GT-R Street Monster, Supra 2JZ Big Single (unlocks at 10 wins), Silvia SR20 Big Turbo, Evo IX Time Attack, WRX STI EJ25, RX-7 Bridgeport Rotary and Chaser 1JZ.
- **Speedometer:** choose Classic tach, Speedometer, Digital or Sport dual, plus a gauge colour, in Settings. You can also tap the gauge mid-race to switch styles.
- **Paint & Style shop** (STYLE in the garage):
  - 13 paints, 6 wheel finishes, 3 stance heights, underglow colours and nitrous flame colours.
  - Changes are cosmetic only. Online rivals see your style.
- **Tire spin:** wheels show motion blur instead of strobing at speed. Spinning tires leave thicker smoke and rubber marks on the road, glow at the contact patch, and show a WHEELSPIN warning.

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
