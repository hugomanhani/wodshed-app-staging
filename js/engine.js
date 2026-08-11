// WODshed generator + adaptive progression engine.

const MATURITY_SESSIONS = 6;
const LAYOFF_DAYS = 14;
const DEFAULT_START_WEIGHT = {
  back_squat: 135, front_squat: 95, deadlift: 155, bench_press: 95,
  push_press: 65, shoulder_press: 65, power_clean: 95, power_snatch: 65,
};
const LIFT_INCREMENT = {
  back_squat: 10, front_squat: 10, deadlift: 10, bench_press: 5,
  push_press: 5, shoulder_press: 5, power_clean: 5, power_snatch: 5,
};
const DEFAULT_ACCESSORY_WEIGHT = {
  bench_press: 45, bent_row_db: 25, db_lunge: 20, push_press: 45,
  kb_goblet_squat: 35, kb_swing: 35, db_snatch: 25, farmer_kb: 35, farmer_db: 25,
};

const BODYWEIGHT_FALLBACK = {
  strength: { id: 'fb_strength', shape: 'C', rest: 90, rounds: 4, moves: ['air_squat', 'push_up', 'pistol'], reps: 12 },
  weightlifting: { id: 'fb_weightlifting', shape: 'B', intervalSec: 60, rounds: 8, movesOdd: ['burpee'], movesEven: ['air_squat'], reps: 10 },
  gymnastics: { id: 'fb_gymnastics', shape: 'B', intervalSec: 60, rounds: 8, movesOdd: ['push_up'], movesEven: ['air_squat'], reps: 12 },
  accessory: { id: 'fb_accessory', shape: 'C', rest: 60, rounds: 4, moves: ['push_up', 'walking_lunge', 'plank_hold'], reps: 12 },
  conditioning: { id: 'fb_conditioning', shape: 'B', intervalSec: 60, rounds: 8, movesOdd: ['burpee'], movesEven: ['mtn_climber'], reps: 15 },
};

const WOD_MOVEMENT_BASE = {
  run: { amount: 200, unit: 'm' }, row_cal: { amount: 15, unit: 'cal' }, row_m: { amount: 250, unit: 'm' },
  bike_cal: { amount: 15, unit: 'cal' }, double_under: { amount: 40, unit: 'reps' }, box_jump: { amount: 12, unit: 'reps' },
  wall_ball: { amount: 12, unit: 'reps' }, kb_swing: { amount: 15, unit: 'reps' }, burpee: { amount: 10, unit: 'reps' },
  ttb: { amount: 12, unit: 'reps' }, kipping_pullup: { amount: 8, unit: 'reps' }, thruster_bb: { amount: 10, unit: 'reps' },
  thruster_db: { amount: 10, unit: 'reps' }, power_clean: { amount: 6, unit: 'reps' }, push_jerk: { amount: 8, unit: 'reps' },
  sdhp: { amount: 12, unit: 'reps' }, db_snatch: { amount: 10, unit: 'reps' }, sled_push: { amount: 20, unit: 'm' },
  push_up: { amount: 12, unit: 'reps' },
};

const LADDER_PATTERNS = [
  { id: 'ladder_12', steps: [12, 10, 8, 6] },
  { id: 'ladder_21', steps: [21, 15, 9] },
  { id: 'ladder_9', steps: [9, 7, 5, 3] },
  { id: 'ladder_15', steps: [15, 12, 9, 6, 3] },
];

function hasEquip(userEquip, needed) {
  return needed.every(e => userEquip.includes(e));
}

function getActiveLocation(state) {
  return state.locations[state.activeLocationId] || null;
}

// Flattens a location's structured gear into the plain id list the rest of
// the engine's equipment-eligibility checks already understand. 'dumbbell_pair'
// is a synthetic id — only present if at least one owned DB weight is a
// matched pair, so two-handed movements never get prescribed off a single.
function getActiveEquipmentList(state) {
  const loc = getActiveLocation(state);
  if (!loc) return [];
  const list = loc.simple.slice();
  if (loc.barbell && loc.barbell.has) list.push('barbell');
  if (kbWeightNumbers(loc).length) list.push('kettlebell');
  const dbWeights = dbWeightObjs(loc);
  if (dbWeights.length) {
    list.push('dumbbell');
    if (dbWeights.some(w => w.unit === 'pair')) list.push('dumbbell_pair');
  }
  // 'canrun' (what the Run exercise actually checks) is available if either
  // outdoor running is realistic OR a treadmill is owned — either one covers it.
  if (list.includes('run_outdoor') || list.includes('treadmill')) list.push('canrun');
  return list;
}

// Kettlebells/dumbbells can be owned as an adjustable bell AND a rack of
// fixed ones at once — each is gated by its own 'has' toggle, so a group
// that's off never leaks its (possibly still-populated) weights into eligibility.
function kbWeightNumbers(loc) {
  if (!loc) return [];
  const adj = (loc.kbAdjustable && loc.kbAdjustable.has) ? loc.kbAdjustable.weights : [];
  const fix = (loc.kbFixed && loc.kbFixed.has) ? loc.kbFixed.weights : [];
  return [...adj, ...fix];
}
function dbWeightObjs(loc) {
  if (!loc) return [];
  const adj = (loc.dbAdjustable && loc.dbAdjustable.has) ? loc.dbAdjustable.weights : [];
  const fix = (loc.dbFixed && loc.dbFixed.has) ? loc.dbFixed.weights : [];
  return [...adj, ...fix];
}
function dbWeightNumbers(loc) {
  return dbWeightObjs(loc).map(w => w.weight);
}
function dbPairWeightNumbers(loc) {
  return dbWeightObjs(loc).filter(w => w.unit === 'pair').map(w => w.weight);
}

// Bumper/Iron Plates are independent toggles from Barbell — a plate group
// that's off never contributes weight even if its items array still has
// entries from before it was switched off.
function ownedPlates(loc) {
  if (!loc) return [];
  const bumper = (loc.bumperPlates && loc.bumperPlates.has) ? loc.bumperPlates.items : [];
  const iron = (loc.ironPlates && loc.ironPlates.has) ? loc.ironPlates.items : [];
  return [...bumper, ...iron];
}

// A gym can own several bar types (Oly, trap, EZ-curl...) at once. Load math
// always anchors to the lightest owned bar — it's always achievable (swap to
// it and add 0 plates), so it never suggests a weight nothing can hit.
function primaryBarWeight(barbell) {
  if (barbell && barbell.bars && barbell.bars.length) return Math.min(...barbell.bars.map(b => b.weight));
  return 45;
}

function maxBarbellLoad(loc) {
  const barbell = loc && loc.barbell;
  if (!barbell || !barbell.has) return 0;
  const platesWeight = ownedPlates(loc).reduce((sum, p) => sum + p.weight * 2 * p.pairs, 0);
  return primaryBarWeight(barbell) + platesWeight;
}

function barbellIncrement(loc) {
  const plates = ownedPlates(loc);
  if (!plates.length) return 5;
  const smallest = plates.filter(p => p.pairs >= 1).reduce((min, p) => Math.min(min, p.weight), Infinity);
  return isFinite(smallest) ? smallest * 2 : 5;
}

// Rounds a suggested barbell weight down to something actually loadable from
// the owned plate inventory, never exceeding the max the plates allow.
function clampBarbellWeight(loc, suggestion) {
  const barbell = loc && loc.barbell;
  if (!barbell || !barbell.has) return suggestion;
  const bw = primaryBarWeight(barbell);
  const max = maxBarbellLoad(loc);
  const inc = barbellIncrement(loc);
  let target = Math.min(suggestion, max);
  target = bw + Math.floor((target - bw) / inc) * inc;
  return Math.max(bw, target);
}

// Snaps to the closest weight actually owned (kettlebells / dumbbells).
function nearestOwnedWeight(weights, target) {
  if (!weights || weights.length === 0) return target;
  return weights.reduce((best, w) => Math.abs(w - target) < Math.abs(best - target) ? w : best, weights[0]);
}

// Steps to the next/previous weight actually owned, rather than a flat ± increment.
function stepOwnedWeight(weights, current, dir) {
  if (!weights || weights.length === 0) return Math.max(0, current + dir * 5);
  const sorted = [...weights].sort((a, b) => a - b);
  const nearestIdx = sorted.reduce((bi, w, i) => Math.abs(w - current) < Math.abs(sorted[bi] - current) ? i : bi, 0);
  const nextIdx = Math.min(sorted.length - 1, Math.max(0, nearestIdx + dir));
  return sorted[nextIdx];
}

// Profile > Skills lets the athlete turn individual movements off entirely,
// independent of equipment ownership — folded in here so every existing
// equipment-eligibility filter (templateEligible, pickWodMovements, generateSkill,
// generateCore, generateWarmup) respects it automatically with no extra call sites.
function skillEnabled(exId) {
  return !(Store.state.disabledExercises || []).includes(exId);
}

function equipmentEligible(exId, userEquip) {
  const ex = exerciseById(exId);
  if (!ex) return false;
  return hasEquip(userEquip, ex.equip) && skillEnabled(exId);
}

function lruPick(ids, lruMap, bonusMap) {
  if (ids.length === 0) return null;
  let best = null, bestKey = null;
  for (const id of ids) {
    let key = lruMap[id] || '0000-00-00';
    if (bonusMap && bonusMap[id]) key = shiftDateStr(key, -bonusMap[id]);
    if (bestKey === null || key < bestKey || (key === bestKey && Math.random() < 0.5)) {
      best = id; bestKey = key;
    }
  }
  return best;
}

function shiftDateStr(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function markUsed(state, id) {
  state.contentLRU[id] = todayISO();
}

function pickFocus(state) {
  let best = FOCUSES[0], bestKey = state.focusHistory[FOCUSES[0]] || '0000-00-00';
  for (const f of FOCUSES) {
    const key = state.focusHistory[f] || '0000-00-00';
    if (key < bestKey) { best = f; bestKey = key; }
  }
  return best;
}

// Shape B templates fill two independent slots (odd/even minute) from two
// separate lists — each slot needs its OWN eligible option. Checking the
// combined pool with .some() would pass a template where only one side is
// actually satisfiable, and generateSkill's per-side fallback would then
// silently serve an unowned-equipment movement on the other side.
function templateEligible(tpl, userEquip) {
  if (tpl.movesOdd || tpl.movesEven) {
    const oddOk = !tpl.movesOdd || tpl.movesOdd.some(id => equipmentEligible(id, userEquip));
    const evenOk = !tpl.movesEven || tpl.movesEven.some(id => equipmentEligible(id, userEquip));
    return oddOk && evenOk;
  }
  const ids = [];
  if (tpl.lifts) ids.push(...tpl.lifts);
  if (tpl.moves) ids.push(...tpl.moves);
  return ids.some(id => equipmentEligible(id, userEquip));
}

function estimateOneRM(weight, reps) {
  return Math.round(weight * (1 + reps / 30));
}

function liftMaturity(state, liftId) {
  const l = state.lifts[liftId];
  return l ? l.history.length : 0;
}

function daysSinceLastSession(state, liftId) {
  const l = state.lifts[liftId];
  if (!l || l.history.length === 0) return Infinity;
  const last = l.history[l.history.length - 1].date;
  return daysBetween(last, todayISO());
}

function suggestNextLoad(state, liftId) {
  const l = state.lifts[liftId];
  const inc = LIFT_INCREMENT[liftId] || 5;
  if (!l || l.history.length === 0) {
    const startWeight = DEFAULT_START_WEIGHT[liftId] || 45;
    const startLoc = getActiveLocation(state);
    return (startLoc && startLoc.barbell && startLoc.barbell.has) ? clampBarbellWeight(startLoc, startWeight) : startWeight;
  }
  const hist = l.history;
  const lastEntry = hist[hist.length - 1];
  const mature = hist.length >= MATURITY_SESSIONS;
  let suggestion;

  if (!mature) {
    const half = Math.max(2.5, Math.round((inc / 2) / 2.5) * 2.5);
    if (hist.length >= 2 && hist[hist.length - 1].rating === 'hard' && hist[hist.length - 2].rating === 'hard') {
      suggestion = Math.round((lastEntry.weight * 0.9) / 2.5) * 2.5;
    } else if (lastEntry.rating === 'easy') {
      suggestion = lastEntry.weight + inc;
    } else if (lastEntry.rating === 'hard') {
      suggestion = lastEntry.weight;
    } else {
      suggestion = lastEntry.weight + half;
    }
  } else {
    const best = hist.slice(-6).reduce((acc, h) => {
      const e1 = estimateOneRM(h.weight, h.reps || 5);
      return e1 > acc ? e1 : acc;
    }, 0);
    let pct = l.targetPct || 0.70;
    if (hist.length >= 2 && hist[hist.length - 1].rating === 'hard' && hist[hist.length - 2].rating === 'hard') {
      pct = Math.max(0.5, pct - 0.10);
    } else if (lastEntry.rating === 'easy') {
      pct = Math.min(0.90, pct + 0.025);
    } else if (lastEntry.rating === 'hard') {
      pct = Math.max(0.5, pct - 0.025);
    } else {
      pct = Math.min(0.90, pct + 0.01);
    }
    l.targetPct = pct;
    suggestion = Math.round((best * pct) / 2.5) * 2.5;
  }

  const layoff = daysSinceLastSession(state, liftId);
  if (layoff >= LAYOFF_DAYS) suggestion = Math.round((suggestion * 0.85) / 2.5) * 2.5;

  suggestion = Math.max(inc, suggestion);
  const loc = getActiveLocation(state);
  if (loc && loc.barbell && loc.barbell.has) suggestion = clampBarbellWeight(loc, suggestion);
  return suggestion;
}

function recordLiftResult(state, liftId, weight, reps, rating) {
  if (!state.lifts[liftId]) state.lifts[liftId] = { history: [] };
  state.lifts[liftId].history.push({ date: todayISO(), weight, reps, rating });
  if (state.lifts[liftId].history.length > 40) state.lifts[liftId].history.shift();
}

function adjustVolume(state, focus, rating, isBenchmark) {
  if (isBenchmark) return;
  const cur = state.volumeMultiplier[focus] || 1.0;
  let next = cur;
  if (rating === 'easy') next = Math.min(1.4, cur + 0.05);
  else if (rating === 'hard') next = Math.max(0.7, cur - 0.05);
  state.volumeMultiplier[focus] = Math.round(next * 100) / 100;
}

function scaledAmount(base, unit, mult) {
  const step = unit === 'reps' ? 1 : 5;
  const scaled = base * mult;
  return Math.max(step, Math.round(scaled / step) * step);
}

function formatMovementLine(exId, amount, unit) {
  const ex = exerciseById(exId);
  const name = ex ? ex.name : exId;
  if (unit === 'm') return `${amount}m ${name}`;
  if (unit === 'cal') return `${amount} Cal ${name}`;
  return `${amount} ${name}`;
}

function pickWodMovements(state, focus, userEquip, count) {
  const pool = WOD_MOVEMENT_POOL_BY_FOCUS[focus].filter(id => equipmentEligible(id, userEquip));
  const chosen = [];
  const remaining = pool.slice();
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const pick = lruPick(remaining, state.contentLRU);
    chosen.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return chosen;
}

function generateWarmup(state, userEquip) {
  const eligible = WARMUP_TEMPLATES.filter(t => t.moves.every(m => equipmentEligible(m, userEquip)));
  const pool = eligible.length ? eligible : WARMUP_TEMPLATES;
  const chosenId = lruPick(pool.map(t => t.id), state.contentLRU);
  const chosen = pool.find(t => t.id === chosenId) || pool[0];
  // Defensive: every warmup move is bodyweight today, so this substitution
  // never actually triggers — but it means an ineligible move can never leak
  // through even if that stops being true later.
  const safeMoves = chosen.moves.map(m => equipmentEligible(m, userEquip) ? m : 'air_squat');
  return { templateId: chosen.id, moves: safeMoves, rounds: 2 };
}

function generateSkill(state, focus, userEquip) {
  const templates = SKILL_TEMPLATES[focus] || [];
  const eligibleTpls = templates.filter(t => templateEligible(t, userEquip));
  let tpl;
  if (eligibleTpls.length === 0) {
    const fb = BODYWEIGHT_FALLBACK[focus];
    tpl = fb || templates[0];
  } else {
    const id = lruPick(eligibleTpls.map(t => t.id), state.contentLRU);
    tpl = eligibleTpls.find(t => t.id === id);
  }

  if (tpl.shape === 'A') {
    const availableLifts = tpl.lifts.filter(l => equipmentEligible(l, userEquip));
    const liftId = availableLifts.length ? lruPick(availableLifts, state.contentLRU) : tpl.lifts[0];
    const weight = suggestNextLoad(state, liftId);
    return {
      shape: 'A', templateId: tpl.id, liftId, scheme: tpl.scheme, rest: tpl.rest,
      weight, liftName: exerciseById(liftId) ? exerciseById(liftId).name : liftId,
    };
  }
  if (tpl.shape === 'B') {
    // templateEligible already guarantees both sides have an eligible option
    // whenever this runs — 'air_squat' (always available) is only a safety
    // net, never a path that should actually execute.
    const odd = tpl.movesOdd.find(m => equipmentEligible(m, userEquip)) || 'air_squat';
    const even = tpl.movesEven.find(m => equipmentEligible(m, userEquip)) || 'air_squat';
    return {
      shape: 'B', templateId: tpl.id, intervalSec: tpl.intervalSec, rounds: tpl.rounds,
      odd, even, reps: tpl.reps, secHold: tpl.secHold,
      oddName: exerciseById(odd) ? exerciseById(odd).name : odd,
      evenName: exerciseById(even) ? exerciseById(even).name : even,
    };
  }
  const moves = tpl.moves.filter(m => equipmentEligible(m, userEquip));
  const finalMoves = moves.length ? moves : tpl.moves;
  const loc = getActiveLocation(state);
  return {
    shape: 'C', templateId: tpl.id, moves: finalMoves, reps: tpl.reps, rest: tpl.rest, rounds: tpl.rounds || 4,
    moveNames: finalMoves.map(m => exerciseById(m) ? exerciseById(m).name : m),
    weighted: finalMoves.map(m => DEFAULT_ACCESSORY_WEIGHT[m] != null),
    weights: finalMoves.map(m => accessoryWeightGuess(m, loc)),
  };
}

function accessoryWeightGuess(moveId, loc) {
  const base = DEFAULT_ACCESSORY_WEIGHT[moveId];
  if (base == null) return 0;
  const ex = exerciseById(moveId);
  if (loc && ex.equip.includes('kettlebell') && kbWeightNumbers(loc).length) return nearestOwnedWeight(kbWeightNumbers(loc), base);
  if (loc && ex.equip.includes('dumbbell_pair')) {
    const pairs = dbPairWeightNumbers(loc);
    if (pairs.length) return nearestOwnedWeight(pairs, base);
  }
  if (loc && ex.equip.includes('dumbbell')) {
    const nums = dbWeightNumbers(loc);
    if (nums.length) return nearestOwnedWeight(nums, base);
  }
  if (loc && ex.equip.includes('barbell') && loc.barbell.has) return clampBarbellWeight(loc, base);
  return base;
}

function generateCore(state, userEquip) {
  const eligible = CORE_TEMPLATES.filter(t => t.moves.some(m => equipmentEligible(m, userEquip)));
  const pool = eligible.length ? eligible : CORE_TEMPLATES;
  const id = lruPick(pool.map(t => t.id), state.contentLRU);
  const tpl = pool.find(t => t.id === id) || pool[0];
  const moves = tpl.moves.filter(m => equipmentEligible(m, userEquip));
  // Defensive: same reasoning as generateWarmup — 'tpl.moves' unfiltered
  // would be unsafe if it ever happened, so fall back to guaranteed-bodyweight
  // movements instead of the template's own (possibly ineligible) list.
  return { ...tpl, moves: moves.length ? moves : ['situp', 'plank_hold'] };
}

function generateWod(state, focus, userEquip) {
  const mult = state.volumeMultiplier[focus] || 1.0;
  const formats = ['amrap', 'rft', 'ladder', 'fortime', 'emom'];
  const bonus = { ladder: 3 };
  const format = lruPick(formats, state.contentLRU, bonus);
  markUsed(state, format);

  if (format === 'ladder') {
    const patId = lruPick(LADDER_PATTERNS.map(p => p.id), state.contentLRU, { ladder_12: 2 });
    const pat = LADDER_PATTERNS.find(p => p.id === patId);
    markUsed(state, patId);
    const moves = pickWodMovements(state, focus, userEquip, 2);
    moves.forEach(m => markUsed(state, m));
    const capMin = 14 + Math.round((pat.steps.length - 3) * 1.5);
    const moveNames = moves.map(m => exerciseById(m).name);
    return {
      format: 'ladder', label: 'Ladder', badge: `CAP ${capMin}:00`, capSec: capMin * 60,
      steps: pat.steps, movements: moveNames.join(' + '), lines: moveNames,
      moveIds: moves,
    };
  }
  if (format === 'rft') {
    const rounds = [3, 4, 5][Math.floor(Math.random() * 3)];
    const moves = pickWodMovements(state, focus, userEquip, 2);
    moves.forEach(m => markUsed(state, m));
    const lines = moves.map(m => {
      const base = WOD_MOVEMENT_BASE[m] || { amount: 10, unit: 'reps' };
      const amt = scaledAmount(base.amount * 0.5, base.unit, mult);
      return formatMovementLine(m, amt, base.unit);
    });
    return {
      format: 'rft', label: 'RFT', badge: `${rounds} ROUNDS`, rounds,
      movements: lines.join(' + '), lines, moveIds: moves,
    };
  }
  if (format === 'amrap') {
    const capMin = [8, 10, 12, 14, 15, 20][Math.floor(Math.random() * 6)];
    const moves = pickWodMovements(state, focus, userEquip, 3);
    moves.forEach(m => markUsed(state, m));
    const lines = moves.map(m => {
      const base = WOD_MOVEMENT_BASE[m] || { amount: 10, unit: 'reps' };
      const amt = scaledAmount(base.amount * 0.6, base.unit, mult);
      return formatMovementLine(m, amt, base.unit);
    });
    return {
      format: 'amrap', label: 'AMRAP', badge: `${capMin}:00 AMRAP`, capSec: capMin * 60,
      movements: lines.join(' + '), lines, moveIds: moves,
    };
  }
  if (format === 'emom') {
    const rounds = [8, 10, 12, 14][Math.floor(Math.random() * 4)];
    const moves = pickWodMovements(state, focus, userEquip, 2);
    moves.forEach(m => markUsed(state, m));
    const rawLines = moves.map(m => {
      const base = WOD_MOVEMENT_BASE[m] || { amount: 10, unit: 'reps' };
      const amt = scaledAmount(base.amount * 0.5, base.unit, mult);
      return formatMovementLine(m, amt, base.unit);
    });
    const lines = rawLines.map((l, i) => `${i === 0 ? 'Odd' : 'Even'} Min: ${l}`);
    return {
      format: 'emom', label: 'EMOM', badge: `EMOM ${rounds}`, rounds,
      movements: lines.join(' · '), lines, moveIds: moves,
      oddLine: rawLines[0], evenLine: rawLines[1] || rawLines[0],
    };
  }
  // fortime
  const capMin = [10, 12, 15, 18][Math.floor(Math.random() * 4)];
  const moves = pickWodMovements(state, focus, userEquip, 2);
  moves.forEach(m => markUsed(state, m));
  const lines = moves.map(m => {
    const base = WOD_MOVEMENT_BASE[m] || { amount: 10, unit: 'reps' };
    const amt = scaledAmount(base.amount * 0.8, base.unit, mult);
    return formatMovementLine(m, amt, base.unit);
  });
  return {
    format: 'fortime', label: 'For Time', badge: `CAP ${capMin}:00`, capSec: capMin * 60,
    movements: lines.join(' + '), lines, moveIds: moves,
  };
}

// Only worth offering if the athlete can actually do at least one — every
// benchmark needs some piece of gear (a pull-up bar at minimum), so a fully
// bodyweight-only user should never see the "ready for a milestone" banner.
function benchmarkReady(state, userEquip) {
  if ((state.conditioningStreak || 0) < 12) return false;
  return BENCHMARKS.some(b => hasEquip(userEquip, b.equip));
}

function pickBenchmark(state, userEquip) {
  const eligible = BENCHMARKS.filter(b => hasEquip(userEquip, b.equip));
  const pool = eligible.length ? eligible : BENCHMARKS;
  let best = pool[0], bestKey = (state.benchmarks[pool[0].id] || {}).lastTested || '0000-00-00';
  for (const b of pool) {
    const key = (state.benchmarks[b.id] || {}).lastTested || '0000-00-00';
    if (key < bestKey) { best = b; bestKey = key; }
  }
  return best;
}

function buildPlan(state, focus) {
  const equip = getActiveEquipmentList(state);
  const warmup = generateWarmup(state, equip);
  const skill = generateSkill(state, focus, equip);
  const wod = generateWod(state, focus, equip);
  const core = generateCore(state, equip);

  markUsed(state, warmup.templateId);
  markUsed(state, skill.templateId);
  markUsed(state, core.id);

  return {
    date: todayISO(), focus, warmup, skill, wod, core,
    completed: { warmup: false, skill: false, wod: false, core: false },
    ratings: { warmup: null, skill: null, wod: null, core: null },
    results: {},
    benchmarkOffer: benchmarkReady(state, equip) ? pickBenchmark(state, equip).id : null,
  };
}

function generateToday(state) {
  const date = todayISO();
  if (state.today && state.today.date === date) return state.today;
  const focus = pickFocus(state);
  const plan = buildPlan(state, focus);
  state.today = plan;
  Store.save();
  return plan;
}

function regenerateForFocus(state, focus) {
  const plan = buildPlan(state, focus);
  state.today = plan;
  Store.save();
  return plan;
}

function logActivity(state, entry) {
  state.activityLog.push({
    id: 'act_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    date: todayISO(), type: entry.type, duration: entry.duration || null, notes: entry.notes || '',
  });
  if (state.activityLog.length > 300) state.activityLog.shift();
  Store.save();
}

function deleteActivity(state, id) {
  state.activityLog = state.activityLog.filter(a => a.id !== id);
  Store.save();
}

function completeSection(state, section, rating, resultData) {
  const plan = state.today;
  plan.completed[section] = true;
  plan.ratings[section] = rating;
  plan.results[section] = resultData || {};

  if (section === 'skill' && plan.skill.shape === 'A' && resultData && resultData.weight != null) {
    recordLiftResult(state, plan.skill.liftId, resultData.weight, resultData.reps || plan.skill.scheme[plan.skill.scheme.length - 1], rating);
  }
  if (section === 'wod') {
    adjustVolume(state, plan.focus, rating, !!plan.isBenchmark);
    state.conditioningStreak = plan.isBenchmark ? 0 : (state.conditioningStreak || 0) + 1;
    if (plan.isBenchmark) {
      if (!state.benchmarks[plan.benchmarkId]) state.benchmarks[plan.benchmarkId] = { results: [] };
      state.benchmarks[plan.benchmarkId].lastTested = todayISO();
      state.benchmarks[plan.benchmarkId].results.push({ date: todayISO(), result: resultData ? resultData.score : '' });
    }
  }

  const allDone = ['warmup', 'skill', 'wod', 'core'].every(s => plan.completed[s]);
  if (allDone) {
    state.focusHistory[plan.focus] = todayISO();
    state.sessionLog.push({
      date: plan.date, focus: plan.focus, wodFormat: plan.wod.format,
      wodBadge: plan.wod.isBenchmark ? plan.benchmarkName : plan.wod.badge,
      wodMovements: plan.wod.movements, skillLift: plan.skill.liftName || plan.skill.templateId,
      ratings: { ...plan.ratings }, results: { ...plan.results },
    });
    if (state.sessionLog.length > 200) state.sessionLog.shift();
  }
  Store.save();
}

function swapWodToBenchmark(state) {
  const plan = state.today;
  const b = pickBenchmark(state, getActiveEquipmentList(state));
  plan.wod = {
    format: b.format, label: 'Benchmark', badge: b.name.toUpperCase(),
    movements: b.line, lines: b.line.split(', '), moveIds: [], capSec: b.capSec || 1200,
    steps: null,
  };
  plan.isBenchmark = true;
  plan.benchmarkId = b.id;
  plan.benchmarkName = b.name;
  Store.save();
  return plan;
}
