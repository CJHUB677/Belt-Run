// BELT RUN story mode: ten chapters, one per class, on the road from Brooklyn and back.
// All characters are fictional. Speakers: DRE (your mechanic in Canarsie), NIA (crew chief,
// reads the data), YOU, and each chapter's rivals. Lines are shown as cards before the first
// race of a chapter, before named rival races, and after you beat each boss.
export const CREW = {
  DRE: { name: 'Dre', role: 'Mechanic · Canarsie', color: '#ffb000' },
  NIA: { name: 'Nia', role: 'Crew chief', color: '#4aa8ff' },
  YOU: { name: 'You', role: '', color: '#3dff7a' },
};

const ch = (title, city, intro, rivals, boss, outro) => ({ title, city, intro, rivals, boss, outro });

export const STORY = {
  1: ch('Belt Parkway Nights', 'Brooklyn, NY', [
    ['DRE', 'Every legend on the Belt started right here. Bad tires, borrowed parts, and a lane by the water.'],
    ['NIA', 'Rules are simple. Hold the revs in the green, drop it on green, shift on the lights.'],
    ['DRE', 'There\'s a racer they call the Ghost. Owns this road. Nobody gets a run at him without a name. Go make one.'],
  ], [
    { name: 'Lil’ Vic', event: 'Lil’ Vic’s Corner', lines: [['Lil’ Vic', 'New face on my strip? Run me for the corner spot. Loser buys the coffee.'], ['NIA', 'He jumps the light every time. Be ready, not early.']] },
    { name: 'Marco Ruiz', event: 'Shore Road Shootout', lines: [['Marco Ruiz', 'Vic says you’re quick. Vic says a lot of things.'], ['DRE', 'Marco’s car is all top end. Win the first 60 feet and keep it.']] },
  ], { name: 'King of Canarsie', intro: [['King of Canarsie', 'I’ve held this lane three summers. Go home, rookie.'], ['DRE', 'Beat him and the whole borough knows your name.']] },
  [['DRE', 'That’s the Belt talking about you now. But the Ghost doesn’t race locals.'], ['NIA', 'Then we stop being local. Miami has a causeway race next week. Pack the car.']]),

  2: ch('Causeway Season', 'Miami, FL', [
    ['NIA', 'Warm, humid air. Less oxygen, less power for naturally aspirated cars. Watch your launch.'],
    ['DRE', 'Down here they race for respect, not money. Earn it.'],
  ], [
    { name: 'Coral', event: 'Coral’s Neon Pull', lines: [['Coral', 'Brooklyn plates on my causeway? Cute.'], ['NIA', 'Coral shifts perfect every time. You’ll have to as well.']] },
    { name: 'Santos', event: 'Santos After Dark', lines: [['Santos', 'I don’t lose on my home water.'], ['DRE', 'He’s got nitrous. Save yours for the back half.']] },
  ], { name: 'Duke of Biscayne', intro: [['Duke of Biscayne', 'You came a long way to lose in the warm weather.'], ['YOU', 'Line up.']] },
  [['NIA', 'Word travels. Atlanta’s rail yard crew sent an invite.'], ['DRE', 'Different crowd up there. Old school. They’ll test your car more than you.']]),

  3: ch('Rail Yard Rules', 'Atlanta, GA', [
    ['DRE', 'Prepped lane, freight cars for walls. Grip’s good here — use it.'],
    ['NIA', 'Try a lower tire pressure on the launch. The data says it’s worth a tenth.'],
  ], [
    { name: 'Switchman', event: 'Switchman’s Signal', lines: [['Switchman', 'Trains don’t wait and neither do I.'], ['DRE', 'He launches soft and pulls hard. Don’t panic at half-track.']] },
    { name: 'Deacon', event: 'Deacon’s Sunday Service', lines: [['Deacon', 'I’ve been racing this yard since before you could drive.'], ['NIA', 'His car is old but tuned perfectly. No mistakes.']] },
  ], { name: 'The Yardmaster', intro: [['The Yardmaster', 'You beat my people. Now beat me.'], ['DRE', 'This is where they find out if you’re real.']] },
  [['DRE', 'Detroit called. They want to see what a Brooklyn kid does in the cold.'], ['NIA', 'Cold air is dense air. More power. Less grip. Plan for it.']]),

  4: ch('Motor City Iron', 'Detroit, MI', [
    ['NIA', 'It’s 46 degrees. Your engine will love it, your tires won’t.'],
    ['DRE', 'This city built the cars. They respect a clean shift more than a loud exhaust.'],
  ], [
    { name: 'Rivet', event: 'Rivet’s Riverfront Run', lines: [['Rivet', 'Factory shift ends at midnight. Race starts at 12:01.'], ['NIA', 'Rivet runs a big supercharger. Strong everywhere. Beat him off the line.']] },
    { name: 'Hammer', event: 'Hammer Time', lines: [['Hammer', 'I build engines for a living. I break them for fun.'], ['DRE', 'Then let him break his. You just stay smooth.']] },
  ], { name: 'Iron Duchess', intro: [['Iron Duchess', 'Every car on this strip has my parts in it. Including yours, probably.'], ['YOU', 'Then you know it’s fast.']] },
  [['NIA', 'Texas next. Big power, big crowds, big money.'], ['DRE', 'And a big mouth named Tank. You’ll like him.']]),

  5: ch('Everything’s Bigger', 'Houston, TX', [
    ['DRE', 'Under the stack interchange. Heavy prep on the lane — the grip is the best you’ve had.'],
    ['NIA', 'Half the cars here run over 700 horsepower. Upgrades matter now.'],
  ], [
    { name: 'Lonestar', event: 'Lonestar Showdown', lines: [['Lonestar', 'Y’all lost? The tourist strip is that way.'], ['DRE', 'Smile and stage.']] },
    { name: 'Tank', event: 'Tank’s Big Night', lines: [['Tank', 'My truck weighs more than your whole crew and it’ll still beat you.'], ['NIA', 'Heavy and fast. Short races favour him — a quarter mile favours you.']] },
  ], { name: 'Stack King', intro: [['Stack King', 'Nobody leaves Texas with my crown.'], ['DRE', 'Then we leave with his time slip instead.']] },
  [['NIA', 'LA wants a sunset race under the viaduct. Cameras, crowds, the whole show.'], ['DRE', 'Don’t race for the cameras. Race for the slip.']]),

  6: ch('River Run', 'Los Angeles, CA', [
    ['NIA', 'Sunset under the arches. Smooth concrete, average grip.'],
    ['DRE', 'Everyone here has a perfect paint job. Make yours look good too — the Style shop’s open.'],
  ], [
    { name: 'Sunny Park', event: 'Sunny’s Golden Hour', lines: [['Sunny Park', 'I’ve got two million followers watching. Don’t embarrass yourself.'], ['NIA', 'Sunny’s fast and very consistent. Beat the reaction, not the car.']] },
    { name: 'Viaduct Vee', event: 'Under the Arches', lines: [['Viaduct Vee', 'The river’s dry but this lane isn’t slow.'], ['DRE', 'Vee runs the half mile like it’s a quarter. Pace yourself.']] },
  ], { name: 'Hollywood', intro: [['Hollywood', 'Every race here is a movie. I’m always the lead.'], ['YOU', 'Not tonight.']] },
  [['DRE', 'Vegas. The desert strip. Thin, hot air.'], ['NIA', 'Turbo cars barely notice it. Naturally aspirated cars lose about a tenth of their power. Pick wisely.']]),

  7: ch('Desert Strip', 'Las Vegas, NV', [
    ['NIA', 'One hundred and one degrees and two thousand feet up. Air density is down 11 percent.'],
    ['DRE', 'The house always wins in this town. Not on this strip.'],
  ], [
    { name: 'Neon', event: 'Neon’s Midnight Pull', lines: [['Neon', 'Lights, sound, speed. Pick one to lose to.'], ['NIA', 'Her car runs huge boost. It’s strongest at the top end.']] },
    { name: 'Ace', event: 'Ace in the Hole', lines: [['Ace', 'I’ve never lost on this strip. Never.'], ['DRE', 'There’s a first time for everything.']] },
  ], { name: 'The House', intro: [['The House', 'Everyone who comes here thinks they’re lucky.'], ['YOU', 'Luck has nothing to do with it.']] },
  [['NIA', 'We got an invite overseas. Tokyo. A midnight meet at the harbour.'], ['DRE', 'Over there, a perfect shift is a sign of respect. Show them.']]),

  8: ch('Midnight Loop', 'Tokyo, Japan', [
    ['NIA', 'The meet starts after midnight under the expressway loop. Cool air, smooth pier.'],
    ['DRE', 'Quiet crowd. They’ll judge you by how you drive, not how loud you are.'],
  ], [
    { name: 'Kaze', event: 'Kaze’s Night Wind', lines: [['Kaze', '(nods once and stages)'], ['NIA', 'Kaze never misses a shift. You can’t either.']] },
    { name: 'Mori', event: 'Mori’s Last Train', lines: [['Mori', 'The last train leaves at 1 a.m. You will miss it.'], ['DRE', 'Then we’ll drive home fast.']] },
  ], { name: 'The Harbour Master', intro: [['The Harbour Master', 'Many come from overseas. Few go home with a win.'], ['YOU', 'I’m going home with one.']] },
  [['NIA', 'Dubai. The Marina Highway. The richest racers on earth.'], ['DRE', 'And a racer called Falcon who knows the Ghost. Win there and you get your run on the Belt.']]),

  9: ch('Marina Mile', 'Dubai, UAE', [
    ['NIA', 'Hot air, glass-smooth road. Every car here is an exotic.'],
    ['DRE', 'Money can buy a fast car. It can’t buy a perfect launch.'],
  ], [
    { name: 'Mirage', event: 'Mirage on the Marina', lines: [['Mirage', 'You raced in parking lots. I race on a highway built for it.'], ['NIA', 'His car is nearly a second quicker on paper. Make it up with launches and shifts.']] },
    { name: 'Sable', event: 'Sable’s Desert Heat', lines: [['Sable', 'Falcon told me about you. He didn’t say you were this small.'], ['DRE', 'Ignore it. Watch the lights.']] },
  ], { name: 'Falcon', intro: [['Falcon', 'If you beat me, I’ll tell the Ghost you’re coming.'], ['YOU', 'Tell him to warm up his tires.']] },
  [['DRE', 'It’s done. The Ghost accepted. Back to Brooklyn.'], ['NIA', 'Back where it started. The Belt.']]),

  10: ch('Back to the Belt', 'Brooklyn, NY', [
    ['DRE', 'Look at you. Left with bad tires. Came back a legend.'],
    ['NIA', 'The Ghost only shows up after you beat his crew. Twelve races. No more practice.'],
  ], [
    { name: 'Phantom', event: 'Phantom’s Toll', lines: [['Phantom', 'The Ghost doesn’t waste time on tourists.'], ['YOU', 'I’m from here.']] },
    { name: 'Shade', event: 'Shade Under the Bridge', lines: [['Shade', 'Last stop before the Ghost. Nobody gets past me.'], ['DRE', 'Somebody’s about to.']] },
  ], { name: 'The Ghost', intro: [['The Ghost', 'I’ve been watching since Canarsie. Let’s see if the road taught you anything.'], ['DRE', 'Everything you learned. One pass.']] },
  [['The Ghost', 'Fair race. The Belt is yours.'], ['DRE', 'From the corner spot to the crown. Proud of you.'], ['NIA', 'Career complete. You can replay any race — and the Honda Cup in Jamaica is still waiting.']]),
};

export const HONDA_STORY = {
  intro: [['NIA', 'A side trip to Kingston. Honda only, all VTEC, all heart.'], ['DRE', 'Lighter cars, higher revs. Launch hard and wring it out.']],
  boss: [['Harbour King', 'Every Honda on this island answers to me.'], ['YOU', 'Not anymore.']],
  outro: [['DRE', 'Respect in Jamaica is worth more than money.'], ['NIA', 'Harbour Cup complete.']],
};
