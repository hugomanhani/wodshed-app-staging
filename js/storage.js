// WODshed storage — single localStorage blob, versioned.

const STORAGE_KEY = 'wodshed_v1';

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysBetween(iso1, iso2) {
  const a = new Date(iso1 + 'T00:00:00');
  const b = new Date(iso2 + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function newLocationId() {
  return 'loc_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

function blankLocation(name) {
  return {
    id: newLocationId(), name,
    simple: ['run_outdoor'], // outdoor running defaults to available — opt out, not opt in
    barbell: { has: false, bars: [] },              // bars: [{type, weight, count}] — can own more than one
    bumperPlates: { has: false, items: [] },        // items: [{weight, pairs}]
    ironPlates: { has: false, items: [] },
    kbAdjustable: { has: false, weights: [] },      // one settable bell — weights it can be dialed to
    kbFixed: { has: false, weights: [] },           // each fixed-weight bell owned
    dbAdjustable: { has: false, weights: [] },      // weights: [{weight, unit:'pair'|'single'}]
    dbFixed: { has: false, weights: [] },
  };
}

// Migrates a pre-locations flat equipment array (old state.equipment) into a
// location with reasonable structured defaults.
function locationFromFlatEquipment(name, flatEquip) {
  const loc = blankLocation(name);
  loc.simple = flatEquip.filter(id => ALL_SIMPLE_EQUIPMENT.includes(id));
  // 'run_outdoor' didn't exist before locations did — default it on so migrated
  // saves keep behaving exactly like they did (run was always available).
  if (!loc.simple.includes('run_outdoor')) loc.simple.push('run_outdoor');
  if (flatEquip.includes('barbell')) {
    loc.barbell = { has: true, bars: [{ type: 'oly_m', weight: 45, count: 1 }] };
    loc.bumperPlates = { has: true, items: DEFAULT_PLATE_SET.filter(p => p.type === 'bumper').map(p => ({ weight: p.weight, pairs: p.pairs })) };
    loc.ironPlates = { has: true, items: DEFAULT_PLATE_SET.filter(p => p.type === 'iron').map(p => ({ weight: p.weight, pairs: p.pairs })) };
  }
  if (flatEquip.includes('kettlebell')) {
    loc.kbFixed = { has: true, weights: [26, 35, 44] };
  }
  if (flatEquip.includes('dumbbell')) {
    loc.dbFixed = { has: true, weights: [{ weight: 20, unit: 'pair' }, { weight: 30, unit: 'pair' }, { weight: 40, unit: 'pair' }] };
  }
  return loc;
}

function defaultState() {
  return {
    version: 2,
    onboarded: false,
    equipment: [],          // legacy flat list, kept only so old saves can migrate
    locations: {},           // locationId -> location (see blankLocation)
    activeLocationId: null,
    units: 'lb',            // 'lb' | 'kg' — display only, canonical storage always stays lb
    disabledExercises: [],  // exercise ids turned off in Profile > Skills — empty = everything on
    focusHistory: {},      // focus -> lastTrainedISO
    contentLRU: {},        // templateId/exerciseId -> lastUsedISO
    lifts: {},              // exerciseId -> { history: [{date, weight, reps, rating}], startWeight }
    volumeMultiplier: { strength: 1.0, gymnastics: 1.0, weightlifting: 1.0, accessory: 1.0, conditioning: 1.0 },
    benchmarks: {},         // benchmarkId -> { lastTested: ISO, results: [{date, result}] }
    sessionLog: [],         // completed days
    activityLog: [],        // outside activities logged manually (run, jiu-jitsu, bike, etc.)
    conditioningStreak: 0,  // sessions since last benchmark, for cadence suggestion
    today: null,            // cached generated plan for the current date
    lastPatternIndex: {},   // focus -> index into rotation pointer (deliberate sub-focus rotation)
  };
}

// Every prior location shape this app has shipped, normalized to the current
// one. Runs on every load — cheap, and safe to run against already-current
// data since every step is a no-op once its target fields already exist.
function migrateLocation(loc) {
  // Single bar {barType, barWeight} -> bars: [{type, weight}].
  if (loc.barbell && !loc.barbell.bars) {
    loc.barbell.bars = loc.barbell.has ? [{ type: loc.barbell.barType || 'oly_m', weight: loc.barbell.barWeight || 45 }] : [];
    delete loc.barbell.barType;
    delete loc.barbell.barWeight;
  }
  // Bars didn't track how many of that type were owned — default 1 each.
  if (loc.barbell && loc.barbell.bars) {
    loc.barbell.bars.forEach(b => { if (b.count == null) b.count = 1; });
  }
  // Plates used to live inside barbell.plates tagged by type — split into
  // their own bumperPlates/ironPlates toggles, 'count' (total plates) -> 'pairs'.
  if (loc.barbell && loc.barbell.plates && !loc.bumperPlates && !loc.ironPlates) {
    const toItems = (type) => loc.barbell.plates
      .filter(p => p.type === type)
      .map(p => ({ weight: p.weight, pairs: p.pairs != null ? p.pairs : Math.floor((p.count || 0) / 2) }));
    const bumper = toItems('bumper');
    const iron = toItems('iron');
    loc.bumperPlates = { has: bumper.length > 0, items: bumper };
    loc.ironPlates = { has: iron.length > 0, items: iron };
    delete loc.barbell.plates;
  }
  if (!loc.bumperPlates) loc.bumperPlates = { has: false, items: [] };
  if (!loc.ironPlates) loc.ironPlates = { has: false, items: [] };

  // Kettlebells/dumbbells used to be one object with a mode flag — split
  // into two independent toggles (can own both an adjustable bell and a
  // rack of fixed ones at once).
  if (loc.kettlebells && !loc.kbAdjustable && !loc.kbFixed) {
    const weights = loc.kettlebells.weights || [];
    if (loc.kettlebells.mode === 'adjustable') loc.kbAdjustable = { has: weights.length > 0, weights: weights.slice() };
    else loc.kbFixed = { has: weights.length > 0, weights: weights.slice() };
    delete loc.kettlebells;
  }
  if (!loc.kbAdjustable) loc.kbAdjustable = { has: false, weights: [] };
  if (!loc.kbFixed) loc.kbFixed = { has: false, weights: [] };

  if (loc.dumbbells && !loc.dbAdjustable && !loc.dbFixed) {
    const weights = loc.dumbbells.weights || [];
    if (loc.dumbbells.mode === 'adjustable') loc.dbAdjustable = { has: weights.length > 0, weights: weights.slice() };
    else loc.dbFixed = { has: weights.length > 0, weights: weights.slice() };
    delete loc.dumbbells;
  }
  if (!loc.dbAdjustable) loc.dbAdjustable = { has: false, weights: [] };
  if (!loc.dbFixed) loc.dbFixed = { has: false, weights: [] };
}

function loadState() {
  let state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
  } catch (e) {
    state = defaultState();
  }
  if (!state.locations) state.locations = {};
  if (Object.keys(state.locations).length === 0 && state.onboarded) {
    const loc = locationFromFlatEquipment('My Gym', state.equipment || []);
    state.locations = { [loc.id]: loc };
    state.activeLocationId = loc.id;
  }
  Object.values(state.locations).forEach(migrateLocation);
  return state;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const Store = {
  state: loadState(),
  save() { saveState(this.state); },
  reset() { this.state = defaultState(); this.save(); },
};
