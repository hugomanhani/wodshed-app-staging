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
    barbell: { has: false, bars: [], plates: [] }, // bars: [{type, weight}] — can own more than one
    kettlebells: { mode: 'fixed', weights: [] },
    dumbbells: { mode: 'fixed', weights: [] }, // weights: [{weight, unit: 'pair'|'single'}]
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
    loc.barbell = { has: true, bars: [{ type: 'oly_m', weight: 45 }], plates: DEFAULT_PLATE_SET.map(p => ({ ...p })) };
  }
  if (flatEquip.includes('kettlebell')) {
    loc.kettlebells = { mode: 'fixed', weights: [26, 35, 44] };
  }
  if (flatEquip.includes('dumbbell')) {
    loc.dumbbells = { mode: 'fixed', weights: [{ weight: 20, unit: 'pair' }, { weight: 30, unit: 'pair' }, { weight: 40, unit: 'pair' }] };
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
  // Migrate the older single-bar shape ({barType, barWeight}) to bars[].
  Object.values(state.locations).forEach(loc => {
    if (loc.barbell && !loc.barbell.bars) {
      loc.barbell.bars = loc.barbell.has ? [{ type: loc.barbell.barType || 'oly_m', weight: loc.barbell.barWeight || 45 }] : [];
      delete loc.barbell.barType;
      delete loc.barbell.barWeight;
    }
  });
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
