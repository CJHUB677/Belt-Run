// Fictional JDM and Honda tuner builds. Each one reuses a stock car's photo (`base`) and inherits
// any field it doesn't set from that car. All power, mass and gearing figures are game estimates
// for made-up builds, not any real person's car.
//   radials: the build ships on drag radials (counts as tire stage 3 behaviour from new)
//   trans:   gearbox type override ('MT', 'DCT', 'SEQ' = sequential dog box, shifts like a DCT)
//   look:    factory paint / wheels the build comes with (the player can repaint it)
module.exports = [
  {
    id: 'ek9tt', base: 'ek9', make: 'Honda', name: 'Civic 9-Second Twin Turbo', year: 'EK · DRAG BUILD',
    engine: 'Built K24 · 2.4L twin-turbo I4 · estimated', hp: 760, tq: 640, mass: 1000, drive: 'FWD',
    red: 9800, peak: 9200, fd: 4.1, ratios: [2.6, 1.9, 1.45, 1.17, 0.97], trans: 'SEQ', radials: true, grip: 1.6, wdf: 0.68, cgH: 0.42, cda: 0.62,
    price: 68000, wins: 6, group: 'Honda', look: { paint: 'yellow', wheels: 'black', stance: 'slammed' },
    buildNote: 'Twin turbos, sequential box, drag radials, wheelie-bar FWD drag setup. Runs 9s stock.',
  },
  {
    id: 'dc5turbo', base: 'dc5', make: 'Honda', name: 'Integra K20 Turbo', year: 'DC5 · STREET BUILD',
    engine: 'K20 · 2.0L single turbo · estimated', hp: 480, tq: 450, mass: 1150, drive: 'FWD',
    red: 9000, peak: 8200, bigTurbo: true, price: 32000, group: 'Honda', look: { paint: 'blue', wheels: 'bronze' },
  },
  {
    id: 'r34god', base: 'r34', make: 'Nissan', name: 'Skyline GT-R 1000', year: 'R34 · RB26 BUILD',
    engine: 'RB26 · 2.8L twin-turbo I6 · estimated', hp: 1000, tq: 950, mass: 1500, drive: 'AWD', rearShare: 0.7,
    red: 9000, peak: 8200, trans: 'SEQ', radials: true, price: 135000, group: 'JDM', look: { paint: 'blue', wheels: 'gold' },
  },
  {
    id: 'r32street', base: 'r32', make: 'Nissan', name: 'R32 GT-R Street Monster', year: 'R32 · RB26 BUILD',
    engine: 'RB26 · 2.6L twin-turbo I6 · estimated', hp: 750, tq: 720, mass: 1400, drive: 'AWD', rearShare: 0.7,
    red: 8800, peak: 8000, price: 78000, group: 'JDM', look: { paint: 'silver', wheels: 'bronze' },
  },
  {
    id: 'supra2jz', base: 'supraa80', make: 'Toyota', name: 'Supra 2JZ Big Single', year: 'A80 · 1,100 HP BUILD',
    engine: '2JZ · 3.0L single turbo I6 · estimated', hp: 1100, tq: 1050, mass: 1450, drive: 'RWD',
    red: 8800, peak: 8000, bigTurbo: true, trans: 'SEQ', radials: true, fd: 3.15, price: 120000, wins: 10, group: 'JDM', look: { paint: 'orange', wheels: 'black' },
  },
  {
    id: 's15sr', base: 's15', make: 'Nissan', name: 'Silvia SR20 Big Turbo', year: 'S15 · STREET BUILD',
    engine: 'SR20 · 2.0L single turbo I4 · estimated', hp: 520, tq: 520, mass: 1200, drive: 'RWD',
    red: 8500, peak: 7800, bigTurbo: true, price: 36000, group: 'JDM', look: { paint: 'purple', wheels: 'chrome' },
  },
  {
    id: 'evo9ta', base: 'evo9', make: 'Mitsubishi', name: 'Evo IX Time Attack', year: 'CT9A · 4G63 BUILD',
    engine: '4G63 · 2.2L single turbo I4 · estimated', hp: 680, tq: 700, mass: 1350, drive: 'AWD',
    red: 9000, peak: 8000, bigTurbo: true, price: 62000, group: 'JDM', look: { paint: 'red', wheels: 'gold' },
  },
  {
    id: 'stibuilt', base: 'stigD', make: 'Subaru', name: 'WRX STI EJ25 Built', year: 'GD · STREET BUILD',
    engine: 'EJ25 · 2.5L single turbo flat-four · estimated', hp: 560, tq: 640, mass: 1450, drive: 'AWD',
    red: 8000, peak: 7000, price: 44000, group: 'JDM', look: { paint: 'blue', wheels: 'gold' },
  },
  {
    id: 'rx7pp', base: 'rx7', make: 'Mazda', name: 'RX-7 Bridgeport Rotary', year: 'FD3S · 13B BUILD',
    engine: '13B · single-turbo rotary · estimated', hp: 620, tq: 540, mass: 1200, drive: 'RWD',
    red: 9500, peak: 8800, bigTurbo: true, price: 58000, group: 'JDM', look: { paint: 'yellow', wheels: 'black' },
  },
  {
    id: 'chaser1jz', base: 'chaser', make: 'Toyota', name: 'Chaser 1JZ Big Turbo', year: 'JZX100 · BUILD',
    engine: '1JZ · 2.5L single turbo I6 · estimated', hp: 640, tq: 680, mass: 1420, drive: 'RWD',
    red: 8200, peak: 7400, bigTurbo: true, price: 42000, group: 'JDM', look: { paint: 'white', wheels: 'bronze' },
  },
];
