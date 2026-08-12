// WODshed UI controller — plain-JS, full-screen re-render per state change.
// Timer onTick callbacks always re-query the DOM by id, so a re-render never
// breaks an in-flight timer.

const ICON = {
  back: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="10,3 5,8 10,13"/></svg>',
  play: '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><polygon points="3,2 14,8 3,14"/></svg>',
  pause: '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="3,8 6,11 13,4"/></svg>',
  chev: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="6,3 11,8 6,13"/></svg>',
  weight: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="9" width="3" height="6" rx="1"/><rect x="4.5" y="7" width="2.5" height="10" rx="1"/><rect x="17" y="7" width="2.5" height="10" rx="1"/><rect x="19.5" y="9" width="3" height="6" rx="1"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
  history: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg>',
  kettlebell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0V10h-5V8.5z"/><circle cx="12" cy="15.5" r="6"/></svg>',
  person: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="2,4 14,4"/><path d="M5 4V2.5A1.5 1.5 0 0 1 6.5 1h3A1.5 1.5 0 0 1 11 2.5V4"/><path d="M4 4l.6 9a1.5 1.5 0 0 0 1.5 1.4h3.8a1.5 1.5 0 0 0 1.5-1.4L12 4"/></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3-7.5 7.5-3.8 1 1-3.8z"/><path d="M9.2 3.8l3 3"/></svg>',
};

const SECTION_TITLES = { warmup: 'Warm-Up', skill: 'Skill', wod: 'WOD', core: 'Extra Core' };
const RATING_LABEL = { easy: 'Easy', right: 'Right', hard: 'Hard' };
const RATING_TAG_CLASS = { easy: 'tag-good', right: 'tag-neutral', hard: 'tag-warn' };

const UI = {
  screen: 'boot', tab: 'today', execSection: null, timer: null, dialog: null, sheet: null,
  warmupChecks: [], skillSetIndex: 0, skillWeight: 0, skillWeightsC: [], skillResting: false, skillRoundIndex: 1,
  bRoundIndex: 1, wodElapsed: 0, wodStepIndex: 0, wodRftRound: 0, wodAmrapRounds: 0, wodAmrapReps: 0,
  coreRound: 1, coreIntervalIndex: 0, corePhase: 'work', coreChecks: [], pendingResult: null, running: false,
  activityType: null, activityCustomType: '', activityDuration: 30, activityNotes: '', nextSection: null,
  scrollPos: {}, // pill-row scroll-left by data-skey — survives the next full re-render
  profileTab: 'equipment', // 'equipment' | 'skills' — sub-tab within Profile
};

function app() { return document.getElementById('app'); }
function esc(s) { return String(s); }
function byId(id) { return document.getElementById(id); }

function render() {
  const root = app();
  let html = '';
  if (UI.screen === 'onboarding') html = renderOnboarding();
  else if (UI.screen === 'today') html = renderShell(renderToday(), 'today');
  else if (UI.screen === 'countdown') html = renderCountdownScreen();
  else if (UI.screen === 'exec') html = renderExecScreen();
  else if (UI.screen === 'rating') html = renderRating();
  else if (UI.screen === 'nextPreview') html = renderNextPreviewScreen();
  else if (UI.screen === 'summary') html = renderSummary();
  else if (UI.screen === 'log') html = renderShell(renderLog(), 'log');
  else if (UI.screen === 'profile') html = renderShell(renderProfileTab(), 'profile');

  if (UI.dialog) html += renderDialog();
  if (UI.sheet) html += renderSheet();
  root.innerHTML = html;
  restorePillScroll();
}

// Every render() rebuilds #app from scratch, which would otherwise snap any
// horizontally-scrolled pill row back to the start — including right after
// the user drags to a chip and taps it. Re-apply the last known scrollLeft
// (tracked per data-skey by initPillDragScroll's capture-phase listener).
function restorePillScroll() {
  app().querySelectorAll('.preset-row[data-skey]').forEach(row => {
    const pos = UI.scrollPos[row.dataset.skey];
    if (pos) row.scrollLeft = pos;
  });
}

// Mouse click-drag scrolling for pill rows (touch already scrolls natively).
// A drag longer than a few px suppresses the click that would otherwise fire
// on whatever chip the cursor lands on, so dragging never accidentally
// selects something.
function initPillDragScroll() {
  const root = app();
  let drag = null;
  let justDragged = false;
  root.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.preset-row');
    if (!row) return;
    drag = { row, startX: e.clientX, startLeft: row.scrollLeft, moved: false };
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 4) drag.moved = true;
    drag.row.scrollLeft = drag.startLeft - dx;
  });
  window.addEventListener('mouseup', () => {
    if (drag && drag.moved) justDragged = true;
    drag = null;
  });
  root.addEventListener('click', (e) => {
    if (justDragged) { e.stopPropagation(); e.preventDefault(); justDragged = false; }
  }, true);
  // scroll doesn't bubble, but a capture-phase listener on an ancestor still
  // sees it fire on the way down, so this catches every pill row without
  // needing a fresh listener per row on every re-render.
  root.addEventListener('scroll', (e) => {
    const row = e.target;
    if (row.classList && row.classList.contains('preset-row') && row.dataset.skey) {
      UI.scrollPos[row.dataset.skey] = row.scrollLeft;
    }
  }, true);
}

function renderShell(innerHtml, activeTab) {
  return `<div class="screen">${innerHtml}</div>${renderBottomNav(activeTab)}`;
}

function renderBottomNav(active) {
  const item = (key, icon, label) => `<button class="nav-item ${active === key ? 'active' : ''}" onclick="App.goTab('${key}')">${icon}<span>${label}</span></button>`;
  return `<div class="bottomnav">${item('today', ICON.weight, 'Today')}${item('log', ICON.history, 'Log')}${item('profile', ICON.person, 'Profile')}</div>`;
}

function infoBtn(key) { return `<button class="info-btn" onclick="App.showInfo('${key}')">i</button>`; }

function renderDialog() {
  const g = GLOSSARY[UI.dialog];
  const title = UI.dialog.charAt(0) + UI.dialog.slice(1).toLowerCase();
  return `<div class="dialog-backdrop" onclick="App.closeDialog()">
    <div class="dialog" onclick="event.stopPropagation()">
      <div class="dialog-title">${title}</div>
      <div class="dialog-body">${g || ''}</div>
      <button class="btn btn-primary btn-block" onclick="App.closeDialog()">Got it</button>
    </div>
  </div>`;
}

function renderSheet() {
  if (UI.sheet === 'focusPicker') return renderFocusPickerSheet();
  if (UI.sheet === 'addActivity') return renderAddActivitySheet();
  return '';
}

function renderFocusPickerSheet() {
  const plan = Store.state.today;
  const rows = FOCUSES.map(f => `<div class="equip-toggle" style="cursor:pointer" onclick="App.selectFocus('${f}')">
      <div>
        <div style="font-weight:600">${FOCUS_LABELS[f]}</div>
        <div class="section-meta">${FOCUS_SUBTITLES[f]}</div>
      </div>
      ${plan.focus === f ? `<span class="tag tag-accent">CURRENT</span>` : ICON.chev}
    </div>`).join('');
  return `<div class="dialog-backdrop" onclick="App.closeSheet()">
    <div class="dialog" onclick="event.stopPropagation()">
      <div class="dialog-title">Change today's focus</div>
      <div class="dialog-body">Picking a new focus regenerates today's whole plan. Anything you've already completed today will be cleared.</div>
      <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>
    </div>
  </div>`;
}

function renderAddActivitySheet() {
  const type = UI.activityType || ACTIVITY_TYPES[0];
  const chips = ACTIVITY_TYPES.map(t => `<div class="preset-chip ${type === t ? 'active' : ''}" onclick="App.setActivityType('${t}')">${t}</div>`).join('');
  const customField = type === 'Other' ? `<div class="field">
      <label>Activity name</label>
      <input class="input" type="text" value="${UI.activityCustomType}" oninput="App.setActivityCustom(this.value)" placeholder="e.g. Rock climbing">
    </div>` : '';
  return `<div class="dialog-backdrop" onclick="App.closeSheet()">
    <div class="dialog" onclick="event.stopPropagation()">
      <div class="dialog-title">Log an outside activity</div>
      <div class="preset-row" data-skey="activity-types" style="padding:0;margin:0 -4px">${chips}</div>
      ${customField}
      <div class="field">
        <label>Duration (minutes)</label>
        <div class="stepper-controls">
          <button class="stepper-btn" onclick="App.adjustActivityDuration(-5)">−</button>
          <div class="stepper-val" style="min-width:64px">${UI.activityDuration}</div>
          <button class="stepper-btn" onclick="App.adjustActivityDuration(5)">+</button>
        </div>
      </div>
      <div class="field">
        <label>Notes (optional)</label>
        <input class="input" type="text" value="${UI.activityNotes}" oninput="App.setActivityNotes(this.value)" placeholder="How'd it go?">
      </div>
      <button class="btn btn-primary btn-block" onclick="App.submitActivity()">Log Activity</button>
      <button class="btn btn-ghost btn-block" onclick="App.closeSheet()">Cancel</button>
    </div>
  </div>`;
}

// ─── Onboarding / Equipment picker ─────────────────────────────────────────

function locationSwitcherHtml() {
  const locs = Object.values(Store.state.locations);
  const chips = locs.map(l => `<div class="preset-chip ${l.id === Store.state.activeLocationId ? 'active' : ''}" onclick="App.switchLocation('${l.id}')">${l.name}</div>`).join('');
  return `<div class="preset-row" data-skey="locations">${chips}<div class="preset-chip" style="border-style:dashed" onclick="App.createLocation()">+ New Location</div></div>`;
}

function locationHeaderHtml(loc) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 var(--space-4) var(--space-2)">
    <h3 style="margin:0">${loc.name}</h3>
    <div style="display:flex;gap:6px">
      <button class="info-btn" style="width:28px;height:28px" onclick="App.renameLocation('${loc.id}')">${ICON.edit}</button>
      ${Object.keys(Store.state.locations).length > 1 ? `<button class="info-btn" style="width:28px;height:28px" onclick="App.deleteLocation('${loc.id}')">${ICON.trash}</button>` : ''}
    </div>
  </div>`;
}

// ─── Weight display units (lb canonical everywhere in storage; this is a
// display-only conversion, never touches what's actually saved) ────────────
function fmtW(lb) {
  if (Store.state.units === 'kg') return String(Math.round(lb * 0.453592 * 2) / 2);
  return String(lb);
}
function fmtWLabel(lb) { return `${fmtW(lb)} ${Store.state.units}`; }

// ─── Shared building blocks for the flat, consistent Profile > Equipment list ─

function toggleRow(label, on, onClick) {
  return `<div class="equip-toggle" onclick="${onClick}"><span>${label}</span><div class="switch ${on ? 'on' : ''}"></div></div>`;
}

function selectAllRowHtml(count, total, itemLabel, selectFn, deselectFn) {
  const allSelected = total > 0 && count >= total;
  const label = allSelected ? 'Deselect all' : 'Select all';
  const fn = allSelected ? deselectFn : selectFn;
  return `<div class="select-all-row">
    <span class="select-all-count">${count} of ${total} ${itemLabel} selected</span>
    <button class="link-btn" onclick="${fn}">${label}</button>
  </div>`;
}

function unitsRowHtml() {
  const u = Store.state.units;
  return `<div class="equip-group">
    <div class="equip-toggle" style="cursor:default"><span>Units</span>
      <div style="display:flex;gap:6px">
        <div class="preset-chip ${u === 'lb' ? 'active' : ''}" onclick="App.setUnits('lb')">lb</div>
        <div class="preset-chip ${u === 'kg' ? 'active' : ''}" onclick="App.setUnits('kg')">kg</div>
      </div>
    </div>
  </div>`;
}

// A deletable "line" for one owned variant (a bar type, a plate weight) with
// 1-2 steppable fields shown side by side — the shared pattern behind
// Barbell and Bumper/Iron Plates.
function gearLineHtml(label, fields, removeFn) {
  const fieldsHtml = fields.map(f => `
    <div class="gear-line-field">
      <span class="gear-line-label">${f.label}</span>
      <div class="stepper-controls">
        <button class="stepper-btn" style="width:32px;height:32px;font-size:16px" onclick="${f.decFn}">−</button>
        <div class="stepper-val" style="min-width:40px;height:32px;font-size:16px">${f.value}</div>
        <button class="stepper-btn" style="width:32px;height:32px;font-size:16px" onclick="${f.incFn}">+</button>
      </div>
    </div>`).join('');
  return `<div class="gear-line">
    <div class="gear-line-head"><span>${label}</span><button class="info-btn" onclick="${removeFn}">✕</button></div>
    <div class="gear-line-fields">${fieldsHtml}</div>
  </div>`;
}

function barbellBlockHtml(loc) {
  const b = loc.barbell;
  if (!b.has) return `<div class="equip-group">${toggleRow('Barbell', false, "App.toggleBarbellHas()")}</div>`;
  const addPills = BAR_TYPES.filter(t => !b.bars.some(x => x.type === t.id))
    .map(t => `<div class="preset-chip" style="border-style:dashed" onclick="App.addBar('${t.id}')">+ ${t.label}</div>`).join('');
  const lines = b.bars.map((bar, i) => {
    const t = BAR_TYPES.find(x => x.id === bar.type);
    return gearLineHtml(t ? t.label : bar.type, [
      { label: 'Weight', value: fmtW(bar.weight), decFn: `App.adjustBarWeight(${i},-5)`, incFn: `App.adjustBarWeight(${i},5)` },
      { label: 'Qty', value: bar.count, decFn: `App.adjustBarCount(${i},-1)`, incFn: `App.adjustBarCount(${i},1)` },
    ], `App.removeBar(${i})`);
  }).join('');
  return `<div class="equip-group">
    ${toggleRow('Barbell', true, "App.toggleBarbellHas()")}
    <div class="preset-row" data-skey="bar-add" style="padding:var(--space-2) var(--space-4) 0">${addPills}</div>
    ${lines || `<div class="section-sub" style="padding:4px var(--space-4) var(--space-2)">Pick a bar type above.</div>`}
    <div class="card" style="margin:var(--space-2) var(--space-4) 0"><div class="section-meta">Max loadable: <strong style="color:var(--color-text)">${fmtWLabel(maxBarbellLoad(loc))}</strong></div></div>
  </div>`;
}

function plateBlockHtml(loc, kind, label, commonList) {
  const p = loc[kind];
  if (!p.has) return `<div class="equip-group">${toggleRow(label, false, `App.togglePlateGroup('${kind}')`)}</div>`;
  const addPills = commonList.filter(w => !p.items.some(x => x.weight === w))
    .map(w => `<div class="preset-chip" style="border-style:dashed" onclick="App.addPlateItem('${kind}',${w})">+ ${fmtW(w)}</div>`).join('');
  const lines = p.items.map((item, i) => gearLineHtml(fmtWLabel(item.weight), [
    { label: 'Pairs', value: item.pairs, decFn: `App.adjustPlatePairs('${kind}',${i},-1)`, incFn: `App.adjustPlatePairs('${kind}',${i},1)` },
  ], `App.removePlateItem('${kind}',${i})`)).join('');
  return `<div class="equip-group">
    ${toggleRow(label, true, `App.togglePlateGroup('${kind}')`)}
    <div class="preset-row" data-skey="${kind}-add" style="padding:var(--space-2) var(--space-4) 0">${addPills}</div>
    ${lines || `<div class="section-sub" style="padding:4px var(--space-4) var(--space-2)">Pick a weight above.</div>`}
  </div>`;
}

function kbBlockHtml(loc, kind, label) {
  const kb = loc[kind];
  if (!kb.has) return `<div class="equip-group">${toggleRow(label, false, `App.toggleKb('${kind}')`)}</div>`;
  const owned = kb.weights.map(w => `<div class="preset-chip active" style="display:flex;align-items:center;gap:6px" onclick="App.removeKbWeight('${kind}',${w})">${fmtWLabel(w)} ✕</div>`).join('');
  const addable = COMMON_KB_WEIGHTS.filter(w => !kb.weights.includes(w)).map(w =>
    `<div class="preset-chip" style="border-style:dashed" onclick="App.addKbWeight('${kind}',${w})">+ ${fmtW(w)}</div>`).join('');
  return `<div class="equip-group">
    ${toggleRow(label, true, `App.toggleKb('${kind}')`)}
    <div class="preset-row" data-skey="${kind}-owned" style="padding:var(--space-2) var(--space-4) 0">${owned}</div>
    <div class="preset-row" data-skey="${kind}-add" style="padding:4px var(--space-4) var(--space-2)">${addable}</div>
  </div>`;
}

function dbBlockHtml(loc, kind, label) {
  const db = loc[kind];
  if (!db.has) return `<div class="equip-group">${toggleRow(label, false, `App.toggleDb('${kind}')`)}</div>`;
  const rows = db.weights.map((w, i) => `<div class="equip-toggle" style="padding-left:var(--space-4);padding-right:var(--space-4)">
      <span>${fmtWLabel(w.weight)}</span>
      <div class="stepper-controls">
        <button class="preset-chip ${w.unit === 'single' ? 'active' : ''}" style="padding:6px 10px;font-size:12px" onclick="App.setDbUnit('${kind}',${i},'single')">Single</button>
        <button class="preset-chip ${w.unit === 'pair' ? 'active' : ''}" style="padding:6px 10px;font-size:12px" onclick="App.setDbUnit('${kind}',${i},'pair')">Pair</button>
        <button class="info-btn" onclick="App.removeDbWeight('${kind}',${w.weight})">✕</button>
      </div>
    </div>`).join('');
  const addable = COMMON_DB_WEIGHTS.filter(w => !db.weights.some(x => x.weight === w)).map(w =>
    `<div class="preset-chip" style="border-style:dashed" onclick="App.addDbWeight('${kind}',${w})">+ ${fmtW(w)}</div>`).join('');
  return `<div class="equip-group">
    ${toggleRow(label, true, `App.toggleDb('${kind}')`)}
    ${rows}
    <div class="preset-row" data-skey="${kind}-add" style="padding:var(--space-2) var(--space-4) 0">${addable}</div>
  </div>`;
}

const COMPLEX_EQUIPMENT_KINDS = ['barbell', 'bumperPlates', 'ironPlates', 'kbAdjustable', 'kbFixed', 'dbAdjustable', 'dbFixed'];

function equipmentSelectedCount(loc) {
  return loc.simple.length + COMPLEX_EQUIPMENT_KINDS.filter(k => loc[k].has).length;
}
function equipmentTotalCount() {
  return ALL_SIMPLE_EQUIPMENT.length + COMPLEX_EQUIPMENT_KINDS.length;
}

function equipmentBlocksHtml(loc) {
  return PROFILE_EQUIPMENT_LAYOUT.map(item => {
    if (item.kind === 'simple') return `<div class="equip-group">${toggleRow(item.label, loc.simple.includes(item.id), `App.toggleSimpleEquip('${item.id}')`)}</div>`;
    if (item.kind === 'barbell') return barbellBlockHtml(loc);
    if (item.kind === 'bumperPlates') return plateBlockHtml(loc, 'bumperPlates', item.label, COMMON_BUMPER_WEIGHTS);
    if (item.kind === 'ironPlates') return plateBlockHtml(loc, 'ironPlates', item.label, COMMON_IRON_WEIGHTS);
    if (item.kind === 'kbAdjustable' || item.kind === 'kbFixed') return kbBlockHtml(loc, item.kind, item.label);
    if (item.kind === 'dbAdjustable' || item.kind === 'dbFixed') return dbBlockHtml(loc, item.kind, item.label);
    return '';
  }).join('');
}

function renderOnboarding() {
  const loc = getActiveLocation(Store.state);
  return `<div class="onboard-wrap">
    <div class="onboard-header">
      <h1>Welcome to WODshed</h1>
      <p class="section-sub" style="padding:0;margin-top:8px">Tell us what you've got — toggle it on below. You can add more locations (like a commercial gym) later.</p>
    </div>
    <div class="scroll-content">${unitsRowHtml()}${equipmentBlocksHtml(loc)}</div>
    <div class="onboard-footer">
      <button class="btn btn-primary btn-block" onclick="App.finishOnboarding()">Continue</button>
    </div>
  </div>`;
}

function renderProfileEquipment(loc) {
  return `${locationSwitcherHtml()}
  ${locationHeaderHtml(loc)}
  ${unitsRowHtml()}
  ${selectAllRowHtml(equipmentSelectedCount(loc), equipmentTotalCount(), 'equipment', 'App.selectAllEquipment()', 'App.deselectAllEquipment()')}
  ${equipmentBlocksHtml(loc)}`;
}

function renderProfileSkills() {
  const disabled = Store.state.disabledExercises || [];
  const sorted = [...EXERCISES].sort((a, b) => a.name.localeCompare(b.name));
  const rows = sorted.map(ex => `<div class="equip-group">${toggleRow(ex.name, !disabled.includes(ex.id), `App.toggleSkill('${ex.id}')`)}</div>`).join('');
  return `<div class="section-sub">Every movement WODshed can prescribe — turn one off to keep it out of your workouts entirely.</div>
  ${selectAllRowHtml(EXERCISES.length - disabled.length, EXERCISES.length, 'skills', 'App.selectAllSkills()', 'App.deselectAllSkills()')}
  ${rows}`;
}

function renderProfileTab() {
  const loc = getActiveLocation(Store.state);
  const tab = UI.profileTab;
  const switcher = `<div class="profile-tabs">
    <div class="profile-tab ${tab === 'equipment' ? 'active' : ''}" onclick="App.setProfileTab('equipment')">Equipment</div>
    <div class="profile-tab ${tab === 'skills' ? 'active' : ''}" onclick="App.setProfileTab('skills')">Skills</div>
  </div>`;
  return `<div class="section-heading">Profile</div>
  <div class="section-sub">${tab === 'equipment' ? 'Switch locations for a garage day vs. a commercial-gym day — changes apply to your next generated day.' : 'Choose which movements are fair game for your workouts.'}</div>
  ${switcher}
  ${tab === 'equipment' ? renderProfileEquipment(loc) : renderProfileSkills()}
  <div style="padding:var(--space-4)">
    <button class="btn btn-danger btn-block" onclick="App.confirmReset()">Reset All Data</button>
  </div>`;
}

// ─── Today screen ───────────────────────────────────────────────────────────

function renderToday() {
  const plan = Store.state.today;
  const order = ['warmup', 'skill', 'wod', 'core'];
  const doneCount = order.filter(s => plan.completed[s]).length;
  const startLabel = doneCount === 0 ? 'Start Workout' : (doneCount === 4 ? 'Workout Done' : 'Resume Workout');
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const segs = order.map(s => `<div class="progress-seg ${plan.completed[s] ? 'done' : ''}"></div>`).join('');

  const cards = order.map(s => sectionCardHtml(s, plan)).join('');

  let banner = '';
  if (plan.benchmarkOffer && !plan.isBenchmark && !plan.completed.wod) {
    const b = BENCHMARKS.find(x => x.id === plan.benchmarkOffer);
    banner = `<div class="banner">
      <div class="banner-title">Ready for a milestone? ${infoBtn('BENCHMARK')}</div>
      <div class="banner-sub">Swap today's WOD for ${b.name} — ${b.line}</div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-secondary" style="flex:1" onclick="App.dismissBenchmark()">Not today</button>
        <button class="btn btn-primary" style="flex:1" onclick="App.acceptBenchmark()">Test ${b.name}</button>
      </div>
    </div>`;
  }

  return `
    <div class="topbar">
      <div>
        <div class="date-label">${dateStr}</div>
        <h1>Today</h1>
      </div>
      <button class="tag tag-accent" style="border:none;cursor:pointer" onclick="App.openFocusPicker()">${FOCUS_LABELS[plan.focus].toUpperCase()} FOCUS ▾</button>
    </div>
    <div class="progress-row">${segs}</div>
    <div style="padding:0 var(--space-4) var(--space-4)">
      <button class="btn btn-primary btn-block" ${doneCount === 4 ? 'disabled' : ''} onclick="App.startOrResume()">
        ${doneCount < 4 ? ICON.play : ''} ${startLabel}
      </button>
    </div>
    ${banner}
    <div class="card-list">${cards}</div>
    <div style="height:24px"></div>
  `;
}

function sectionCardHtml(section, plan) {
  const done = plan.completed[section];
  const rating = plan.ratings[section];
  let title, meta;
  if (section === 'warmup') { title = 'Warm-Up'; meta = metaBlock('2 Rounds', warmupMoveList(plan.warmup)); }
  else if (section === 'skill') {
    title = 'Skill' + (plan.skill.liftName ? ' · ' + plan.skill.liftName : '');
    meta = skillMetaBlock(plan.skill);
  } else if (section === 'wod') {
    title = 'WOD · ' + (plan.isBenchmark ? plan.benchmarkName : plan.wod.label);
    meta = metaBlock(plan.wod.badge, plan.wod.lines || [plan.wod.movements]);
  } else { title = 'Extra Core'; meta = coreMetaBlock(plan.core); }

  const icon = done ? ICON.check : ICON.play;
  const iconCls = done ? 'section-icon done' : 'section-icon';
  const right = done
    ? (rating ? `<span class="tag ${RATING_TAG_CLASS[rating]}">${RATING_LABEL[rating]}</span>` : `<span class="tag tag-neutral">Done</span>`)
    : ICON.chev;

  return `<div class="section-card ${done ? 'disabled' : ''}" onclick="${done ? '' : `App.enterExec('${section}')`}">
    <div class="${iconCls}">${icon}</div>
    <div class="section-body">
      <div class="section-title">${title}</div>
      <div class="section-meta">${meta}</div>
    </div>
    <div class="chev">${right}</div>
  </div>`;
}

function metaBlock(header, lines) {
  return `<div>${header}</div>${lines.map(l => `<div>${l}</div>`).join('')}`;
}

function warmupMoveList(warmup) {
  return warmup.moves.map(m => `${WARMUP_PRESCRIPTION[m] || ''} ${exerciseById(m).name}`.trim());
}

function skillMetaBlock(skill) {
  if (skill.shape === 'A') return metaBlock(`${skill.scheme.length} Sets · ${skill.scheme.join('-')} reps`, [`@ ${fmtWLabel(skill.weight)}`]);
  if (skill.shape === 'B') {
    const desc = skill.secHold ? `${skill.secHold}s Hold` : `${skill.reps} Reps`;
    return metaBlock(`EMOM ${skill.rounds}'`, [`Odd: ${desc} ${skill.oddName}`, `Even: ${desc} ${skill.evenName}`]);
  }
  const lines = skill.moveNames.map((n, i) => `${skill.reps} ${n}${skill.weighted[i] ? ' @ ' + fmtWLabel(skill.weights[i]) : ''}`);
  return metaBlock(`${skill.rounds} Sets`, lines);
}
function coreMetaBlock(core) {
  if (core.shape === 'tabata') return metaBlock(`Tabata ${core.workSec}"/${core.restSec}" · ${core.rounds} Rounds`, core.moves.map(m => exerciseById(m).name));
  if (core.shape === 'holds') return metaBlock(`${core.rounds} Rounds · ${core.holdSec}s Hold / ${core.restSec}s Rest`, core.moves.map(m => exerciseById(m).name));
  return metaBlock(`${core.rounds} Rounds`, core.moves.map(m => `${core.reps} ${exerciseById(m).name}`));
}

// ─── Execution screens ───────────────────────────────────────────────────

function execHeader(title, infoKey) {
  return `<div class="exec-header">
    <button class="btn btn-icon btn-ghost" onclick="App.exitExec()">${ICON.back}</button>
    <div class="kicker">${title}${infoKey ? infoBtn(infoKey) : ''}</div>
    <div style="width:44px"></div>
  </div>`;
}

function playPauseBtn(big) {
  const size = big ? 'width:64px;height:64px' : 'width:52px;height:52px';
  return `<button class="btn btn-primary btn-icon" style="${size}" onclick="App.toggleTimer()">${UI.running ? ICON.pause : ICON.play}</button>`;
}

function renderCountdownScreen() {
  const section = UI.execSection;
  return `<div class="screen no-nav">
    ${execHeader(SECTION_TITLES[section].toUpperCase())}
    <div class="exec-body" style="justify-content:center;align-items:center">
      <div class="time-label">GET READY</div>
      <div class="big-time" style="font-size:130px" id="countdownNum">${UI.timer ? Math.ceil(UI.timer.remainingMs() / 1000) : 10}</div>
      <button class="btn btn-secondary btn-block" style="margin-top:auto" onclick="App.skipCountdown()">Skip</button>
    </div>
  </div>`;
}

function renderExecScreen() {
  const plan = Store.state.today;
  const section = UI.execSection;
  const title = SECTION_TITLES[section].toUpperCase();

  if (section === 'warmup') return `<div class="screen no-nav">${execHeader(title)}${renderWarmupBody(plan.warmup)}</div>`;
  if (section === 'skill') return `<div class="screen no-nav">${execHeader(title)}${renderSkillBody(plan.skill)}</div>`;
  if (section === 'wod') {
    const fmtKey = plan.wod.format.toUpperCase() === 'FORTIME' ? 'FORTIME' : plan.wod.format.toUpperCase();
    return `<div class="screen no-nav">${execHeader(title, fmtKey)}${renderWodBody(plan.wod, plan)}</div>`;
  }
  if (section === 'core') return `<div class="screen no-nav">${execHeader(title)}${renderCoreBody(plan.core)}</div>`;
  return '';
}

function renderWarmupBody(warmup) {
  const items = UI.warmupChecks.map((c, i) => {
    const moveId = warmup.moves[i % warmup.moves.length];
    const round = Math.floor(i / warmup.moves.length) + 1;
    const rx = WARMUP_PRESCRIPTION[moveId] || '';
    return `<div class="check-item" onclick="App.toggleWarmupCheck(${i})">
      <div class="check-box ${c ? 'checked' : ''}">${c ? ICON.check : ''}</div>
      <div class="check-label ${c ? 'checked' : ''}">${rx} ${exerciseById(moveId).name}</div>
      <div class="check-round">R${round}</div>
    </div>`;
  }).join('');

  return `<div class="exec-body">
    <div class="big-time" id="warmupTime">${fmtClock(UI.timer ? UI.timer.elapsedMs() : 0)}</div>
    ${playPauseBtn(true)}
    <div class="checklist">${items}</div>
    <button class="btn btn-primary btn-block" style="margin-top:auto" onclick="App.finishWarmup()">Finish Warm-Up</button>
  </div>`;
}

function renderSkillBody(skill) {
  if (skill.shape === 'A') {
    const reps = skill.scheme[UI.skillSetIndex];
    const isLast = UI.skillSetIndex + 1 >= skill.scheme.length;
    const rest = UI.skillResting ? `<div class="card" style="width:100%;align-items:center;gap:8px;display:flex;flex-direction:column">
        <div class="time-label">Rest</div>
        <div class="mid-time" id="restTime">${fmtClock(UI.timer ? UI.timer.remainingMs() : 0)}</div>
        <button class="btn btn-ghost" onclick="App.skipRest()">Skip Rest</button>
      </div>` : '';
    return `<div class="exec-body">
      <div class="time-label">${skill.liftName}</div>
      <div class="exec-meta">SET ${UI.skillSetIndex + 1} / ${skill.scheme.length}</div>
      <div class="big-time">${reps}<span style="font-size:18px;color:var(--color-neutral-500)"> reps</span></div>
      <div class="weight-row">
        <button class="stepper-btn" onclick="App.adjustWeight(-1)">−</button>
        <div class="weight-value">${fmtW(UI.skillWeight)}<span class="unit"> ${Store.state.units}</span></div>
        <button class="stepper-btn" onclick="App.adjustWeight(1)">+</button>
      </div>
      ${rest}
      <button class="btn btn-primary btn-block" style="margin-top:auto" ${UI.skillResting ? 'disabled' : ''} onclick="App.completeSet()">${isLast ? 'Finish Skill' : 'Complete Set'}</button>
    </div>`;
  }

  if (skill.shape === 'B') {
    const isOdd = UI.bRoundIndex % 2 === 1;
    const moveName = isOdd ? skill.oddName : skill.evenName;
    const desc = skill.secHold ? `${skill.secHold}s Hold` : `${skill.reps} Reps`;
    const isLastRound = UI.bRoundIndex >= skill.rounds;
    const nextName = (UI.bRoundIndex + 1) % 2 === 1 ? skill.oddName : skill.evenName;
    return `<div class="exec-body">
      <div class="time-label">MIN ${UI.bRoundIndex} / ${skill.rounds}</div>
      <div class="exec-meta">${isOdd ? 'ODD' : 'EVEN'}: ${desc} ${moveName}</div>
      <div class="big-time" id="bTime">${fmtClock(UI.timer ? UI.timer.remainingMs() : 0)}</div>
      ${playPauseBtn(true)}
      <button class="btn btn-ghost" style="margin-top:auto" onclick="App.skillSkipRound()">${isLastRound ? 'Finish Skill' : 'Skip to Next: ' + nextName}</button>
    </div>`;
  }

  // shape C
  const moves = skill.moveNames.map((n, i) => {
    if (skill.weighted[i]) {
      return `<div class="move-line" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div>${skill.reps} ${n}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="stepper-btn" style="width:32px;height:32px;font-size:16px" onclick="App.adjustWeightC(${i},-5)">−</button>
          <div style="min-width:52px;text-align:center;font-variant-numeric:tabular-nums">${fmtWLabel(UI.skillWeightsC[i])}</div>
          <button class="stepper-btn" style="width:32px;height:32px;font-size:16px" onclick="App.adjustWeightC(${i},5)">+</button>
        </div>
      </div>`;
    }
    return `<div class="move-line">${skill.reps} ${n}</div>`;
  }).join('');
  const rest = UI.skillResting ? `<div class="card" style="width:100%;align-items:center;gap:8px;display:flex;flex-direction:column">
      <div class="time-label">Rest</div>
      <div class="mid-time" id="restTime">${fmtClock(UI.timer ? UI.timer.remainingMs() : 0)}</div>
      <button class="btn btn-ghost" onclick="App.skipRest()">Skip Rest</button>
    </div>` : '';
  const isLast = UI.skillRoundIndex >= skill.rounds;
  return `<div class="exec-body">
    <div class="exec-meta">ROUND (SET) ${UI.skillRoundIndex} / ${skill.rounds}</div>
    <div class="move-list">${moves}</div>
    ${rest}
    <button class="btn btn-primary btn-block" style="margin-top:auto" ${UI.skillResting ? 'disabled' : ''} onclick="App.completeSkillRound()">${isLast ? 'Finish Skill' : 'Complete Round'}</button>
  </div>`;
}

function capTagHtml(elapsedMs, capSec) {
  if (!capSec) return '';
  return elapsedMs / 1000 >= capSec ? `<span class="tag tag-warn">TIME CAP</span>` : '';
}

// Ladder, RFT, and single-pass For Time are all the same scoring family per
// spec 2.8 — completion speed is the point — so they share this "For Time"
// naming in the UI even though they're tracked with different internals.
function forTimeCardHtml(movementLine) {
  return `<div class="card" style="width:100%;text-align:center">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-accent);margin-bottom:4px">For Time</div>
    <div style="font-size:14px;color:var(--color-neutral-300)">${movementLine}</div>
  </div>`;
}

function renderWodBody(wod, plan) {
  if (wod.format === 'ladder') {
    const step = wod.steps[UI.wodStepIndex];
    const isLast = UI.wodStepIndex + 1 >= wod.steps.length;
    const movementLine = wod.lines.map(name => `${step} ${name}`).join(' + ');
    return `<div class="exec-body">
      ${forTimeCardHtml(movementLine)}
      <div class="exec-meta">ROUND ${UI.wodStepIndex + 1} / ${wod.steps.length}</div>
      <div class="big-time">${step}<span style="font-size:22px;color:var(--color-neutral-500)"> Reps</span></div>
      <div class="mid-time" id="wodTime" style="color:var(--color-neutral-400)">${fmtClock(UI.timer ? UI.timer.elapsedMs() : 0)}</div>
      ${capTagHtml(UI.timer ? UI.timer.elapsedMs() : 0, wod.capSec)}
      <div class="action-row">
        ${playPauseBtn(false)}
        <button class="btn btn-primary" style="flex:1" onclick="App.wodRoundDone()">${isLast ? 'Finish WOD' : 'Round Done'}</button>
      </div>
    </div>`;
  }
  if (wod.format === 'rft') {
    const isLast = UI.wodRftRound + 1 >= wod.rounds;
    return `<div class="exec-body">
      ${forTimeCardHtml(wod.movements)}
      <div class="exec-meta">ROUND ${UI.wodRftRound + 1} / ${wod.rounds}</div>
      <div class="mid-time" id="wodTime">${fmtClock(UI.timer ? UI.timer.elapsedMs() : 0)}</div>
      ${capTagHtml(UI.timer ? UI.timer.elapsedMs() : 0, wod.capSec)}
      <div class="action-row">
        ${playPauseBtn(false)}
        <button class="btn btn-primary" style="flex:1" onclick="App.wodRoundDone()">${isLast ? 'Finish WOD' : 'Round Done'}</button>
      </div>
    </div>`;
  }
  if (wod.format === 'fortime') {
    return `<div class="exec-body">
      ${forTimeCardHtml(wod.movements)}
      <div class="mid-time" id="wodTime">${fmtClock(UI.timer ? UI.timer.elapsedMs() : 0)}</div>
      ${capTagHtml(UI.timer ? UI.timer.elapsedMs() : 0, wod.capSec)}
      <div class="action-row">
        ${playPauseBtn(false)}
        <button class="btn btn-primary" style="flex:1" onclick="App.finishFortime()">Finish</button>
      </div>
    </div>`;
  }
  if (wod.format === 'amrap') {
    return `<div class="exec-body">
      <div class="card" style="width:100%"><div style="font-size:13px;color:var(--color-neutral-400)">${wod.movements}</div></div>
      <div class="big-time" id="wodTime">${fmtClock(UI.timer ? UI.timer.remainingMs() : 0)}</div>
      <div class="stepper-row">
        <div class="stepper">
          <div class="stepper-label">Rounds</div>
          <button class="stepper-val" style="border:none;font-size:20px" onclick="App.amrapAddRound()">${UI.wodAmrapRounds}</button>
        </div>
        <div class="stepper">
          <div class="stepper-label">+ Reps</div>
          <div class="stepper-controls">
            <button class="stepper-btn" onclick="App.amrapAddRep(-1)">−</button>
            <div class="stepper-val">${UI.wodAmrapReps}</div>
            <button class="stepper-btn" onclick="App.amrapAddRep(1)">+</button>
          </div>
        </div>
      </div>
      <div style="margin-top:auto;display:flex;gap:12px;align-items:center">
        ${playPauseBtn(true)}
        <button class="btn btn-ghost" onclick="App.finishAmrap()">Finish Early</button>
      </div>
    </div>`;
  }
  // emom
  const isOdd = UI.bRoundIndex % 2 === 1;
  const line = plan.isBenchmark ? wod.movements : (isOdd ? wod.oddLine : wod.evenLine);
  const isLastRound = UI.bRoundIndex >= wod.rounds;
  const nextLine = plan.isBenchmark ? null : ((UI.bRoundIndex + 1) % 2 === 1 ? wod.oddLine : wod.evenLine);
  const skipLabel = isLastRound ? 'Finish WOD' : (nextLine ? 'Skip to Next: ' + nextLine : 'Skip to Next Minute');
  return `<div class="exec-body">
    <div class="time-label">MIN ${UI.bRoundIndex} / ${wod.rounds}</div>
    <div class="exec-meta" style="text-align:center">${line}</div>
    <div class="big-time" id="bTime">${fmtClock(UI.timer ? UI.timer.remainingMs() : 0)}</div>
    ${playPauseBtn(true)}
    <button class="btn btn-ghost" style="margin-top:auto" onclick="App.wodSkipRound()">${skipLabel}</button>
  </div>`;
}

function renderCoreBody(core) {
  if (core.shape === 'tabata' || core.shape === 'holds') {
    const isHolds = core.shape === 'holds';
    // Tabata alternates across a fixed TOTAL round count (the real Tabata
    // protocol is always N rounds total). Holds instead does N rounds of
    // EACH movement, so it tracks a separate running interval index.
    const idx = isHolds ? UI.coreIntervalIndex : (UI.coreRound - 1);
    const moveName = exerciseById(core.moves[idx % core.moves.length]).name;
    const nextMoveName = exerciseById(core.moves[(idx + 1) % core.moves.length]).name;
    const roundDisplay = isHolds ? Math.floor(UI.coreIntervalIndex / core.moves.length) + 1 : UI.coreRound;
    const isRest = UI.corePhase === 'rest';
    const phaseLabel = isRest ? 'REST' : (core.shape === 'tabata' ? 'WORK' : 'HOLD');
    return `<div class="exec-body" style="justify-content:center">
      <span class="tag ${isRest ? 'tag-neutral' : 'tag-accent'}">${phaseLabel}</span>
      <div class="exec-meta">${isRest ? 'Up Next: ' + nextMoveName : moveName}</div>
      <div class="big-time" style="font-size:88px" id="coreTime">${Math.ceil((UI.timer ? UI.timer.remainingMs() : 0) / 1000)}</div>
      <div class="time-label">ROUND ${roundDisplay} / ${core.rounds}</div>
      ${playPauseBtn(true)}
    </div>`;
  }
  // straight
  const items = UI.coreChecks.map((c, i) => {
    const moveId = core.moves[i % core.moves.length];
    const round = Math.floor(i / core.moves.length) + 1;
    return `<div class="check-item" onclick="App.toggleCoreCheck(${i})">
      <div class="check-box ${c ? 'checked' : ''}">${c ? ICON.check : ''}</div>
      <div class="check-label ${c ? 'checked' : ''}">${core.reps} ${exerciseById(moveId).name}</div>
      <div class="check-round">R${round}</div>
    </div>`;
  }).join('');
  return `<div class="exec-body">
    <div class="big-time" id="coreTimeUp">${fmtClock(UI.timer ? UI.timer.elapsedMs() : 0)}</div>
    ${playPauseBtn(true)}
    <div class="checklist">${items}</div>
    <button class="btn btn-primary btn-block" style="margin-top:auto" onclick="App.finishCore()">Finish Extra Core</button>
  </div>`;
}

// ─── Rating / Summary ───────────────────────────────────────────────────────

function renderRating() {
  return `<div class="screen no-nav">
    <div class="rating-screen">
      <span class="tag tag-neutral">${SECTION_TITLES[UI.execSection].toUpperCase()} COMPLETE</span>
      <h3>How did that feel?</h3>
      <div class="rating-buttons">
        <button class="btn btn-secondary btn-block" onclick="App.rate('easy')">Easy</button>
        <button class="btn btn-primary btn-block" onclick="App.rate('right')">Right</button>
        <button class="btn btn-secondary btn-block" onclick="App.rate('hard')">Hard</button>
      </div>
    </div>
  </div>`;
}

function renderNextPreviewScreen() {
  const plan = Store.state.today;
  const section = UI.nextSection;
  let title, meta;
  if (section === 'warmup') { title = 'Warm-Up'; meta = metaBlock('2 Rounds', warmupMoveList(plan.warmup)); }
  else if (section === 'skill') { title = 'Skill' + (plan.skill.liftName ? ' · ' + plan.skill.liftName : ''); meta = skillMetaBlock(plan.skill); }
  else if (section === 'wod') { title = 'WOD · ' + (plan.isBenchmark ? plan.benchmarkName : plan.wod.label); meta = metaBlock(plan.wod.badge, plan.wod.lines || [plan.wod.movements]); }
  else { title = 'Extra Core'; meta = coreMetaBlock(plan.core); }
  return `<div class="screen no-nav">
    <div class="exec-body" style="justify-content:center;padding-top:var(--space-6)">
      <span class="tag tag-good">SECTION COMPLETE</span>
      <div class="time-label" style="margin-top:var(--space-4)">UP NEXT</div>
      <h2 style="text-align:center;margin:0">${title}</h2>
      <div class="card" style="width:100%">${meta}</div>
      <div style="width:100%;margin-top:auto;display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary btn-block" onclick="App.enterExec('${section}')">${ICON.play} Start</button>
        <button class="btn btn-ghost btn-block" onclick="App.goToday()">Back to Today</button>
      </div>
    </div>
  </div>`;
}

function completionMessage(ratings) {
  const vals = Object.values(ratings).filter(Boolean);
  if (vals.includes('hard')) return "Tough one — that's how you get stronger. Recover well.";
  if (vals.length && vals.every(v => v === 'easy')) return "Crushed it today. We'll nudge things up next time.";
  return 'Solid work today. See you next session.';
}

function renderSummary() {
  const plan = Store.state.today;
  const order = ['warmup', 'skill', 'wod', 'core'];
  const rows = order.map(s => {
    const rating = plan.ratings[s];
    const tag = rating ? `<span class="tag ${RATING_TAG_CLASS[rating]}">${RATING_LABEL[rating]}</span>` : `<span class="tag tag-neutral">Done</span>`;
    return `<div class="card" style="flex-direction:row;justify-content:space-between;align-items:center;display:flex">
    <div class="section-title" style="font-size:15px">${SECTION_TITLES[s]}</div>
    ${tag}
  </div>`;
  }).join('');
  const nextFocus = pickFocus(Store.state);
  return `<div class="screen no-nav">
    <div class="exec-body" style="padding-top:var(--space-6)">
      <h2 style="text-align:center">Workout Complete</h2>
      <p class="section-sub" style="padding:0;text-align:center;margin-top:-8px">${completionMessage(plan.ratings)}</p>
      <div class="move-list">${rows}</div>
      <div class="card" style="width:100%;text-align:center;gap:4px">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-neutral-500)">Up Next</div>
        <div style="font-size:19px;font-weight:700">${FOCUS_LABELS[nextFocus]} Focus</div>
        <div class="section-meta">${FOCUS_SUBTITLES[nextFocus]}</div>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:auto" onclick="App.goToday()">Back to Today</button>
    </div>
  </div>`;
}

// ─── Log ─────────────────────────────────────────────────────────────────

function renderLog() {
  const workouts = Store.state.sessionLog.map(e => ({ kind: 'workout', date: e.date, data: e }));
  const activities = Store.state.activityLog.map(e => ({ kind: 'activity', date: e.date, data: e }));
  const combined = workouts.concat(activities).sort((a, b) => b.date < a.date ? -1 : b.date > a.date ? 1 : 0);

  const header = `<div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-6) var(--space-4) var(--space-2)">
    <h2 style="margin:0">Log</h2>
    <button class="btn btn-secondary btn-icon" onclick="App.openAddActivity()">${ICON.plus}</button>
  </div>`;

  if (combined.length === 0) {
    return `${header}<div class="empty-state"><h3>Nothing logged yet</h3><p>Finish a workout, or tap + to log an outside activity like a run or Jiu-Jitsu.</p></div>`;
  }

  const items = combined.map(entry => entry.kind === 'workout' ? workoutCardHtml(entry.data) : activityCardHtml(entry.data)).join('');
  return `${header}<div class="card-list" style="padding-bottom:24px">${items}</div>`;
}

function workoutCardHtml(entry) {
  const chips = ['warmup', 'skill', 'wod', 'core'].map(s => entry.ratings[s]
    ? `<span class="tag ${RATING_TAG_CLASS[entry.ratings[s]]}">${SECTION_TITLES[s]}: ${RATING_LABEL[entry.ratings[s]]}</span>` : '').join('');
  return `<div class="card history-item">
    <div class="history-top">
      <div class="history-date">${entry.date}</div>
      <span class="tag tag-accent">${FOCUS_LABELS[entry.focus].toUpperCase()}</span>
    </div>
    <div class="history-line">${entry.wodBadge} · ${entry.wodMovements}</div>
    <div class="rating-chips">${chips}</div>
  </div>`;
}

function activityCardHtml(entry) {
  return `<div class="card history-item">
    <div class="history-top">
      <div class="history-date">${entry.date}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="tag tag-neutral">${entry.type.toUpperCase()}</span>
        <button class="info-btn" style="width:22px;height:22px" onclick="App.removeActivity('${entry.id}')">${ICON.trash}</button>
      </div>
    </div>
    <div class="history-line">${entry.duration ? entry.duration + ' min' : 'Outside activity'}${entry.notes ? ' · ' + entry.notes : ''}</div>
  </div>`;
}

// ─── App controller ─────────────────────────────────────────────────────────

const App = {
  init() {
    if (Object.keys(Store.state.locations).length === 0) {
      const loc = blankLocation('My Gym');
      Store.state.locations = { [loc.id]: loc };
      Store.state.activeLocationId = loc.id;
      Store.save();
    }
    UI.screen = Store.state.onboarded ? 'today' : 'onboarding';
    if (Store.state.onboarded) generateToday(Store.state);
    render();
  },

  goTab(tab) {
    UI.tab = tab;
    UI.screen = tab;
    if (tab === 'today') generateToday(Store.state);
    render();
  },
  goToday() { this.goTab('today'); },

  showInfo(key) { UI.dialog = key; render(); },
  closeDialog() { UI.dialog = null; render(); },
  closeSheet() { UI.sheet = null; render(); },

  openFocusPicker() { UI.sheet = 'focusPicker'; render(); },
  selectFocus(focus) {
    regenerateForFocus(Store.state, focus);
    UI.sheet = null;
    render();
  },

  openAddActivity() {
    UI.activityType = ACTIVITY_TYPES[0]; UI.activityCustomType = '';
    UI.activityDuration = 30; UI.activityNotes = '';
    UI.sheet = 'addActivity'; render();
  },
  setActivityType(t) { UI.activityType = t; render(); },
  setActivityCustom(v) { UI.activityCustomType = v; },
  adjustActivityDuration(d) { UI.activityDuration = Math.max(5, UI.activityDuration + d); render(); },
  setActivityNotes(v) { UI.activityNotes = v; },
  submitActivity() {
    const type = UI.activityType === 'Other' && UI.activityCustomType.trim() ? UI.activityCustomType.trim() : UI.activityType;
    logActivity(Store.state, { type, duration: UI.activityDuration, notes: UI.activityNotes });
    UI.sheet = null;
    render();
  },
  removeActivity(id) {
    deleteActivity(Store.state, id);
    render();
  },

  // ─ Locations ─
  createLocation() {
    const name = prompt('Name this location (e.g. "Commercial Gym"):', '');
    if (!name || !name.trim()) return;
    const loc = blankLocation(name.trim());
    Store.state.locations[loc.id] = loc;
    Store.state.activeLocationId = loc.id;
    Store.save(); render();
  },
  renameLocation(id) {
    const loc = Store.state.locations[id];
    const name = prompt('Rename location:', loc.name);
    if (!name || !name.trim()) return;
    loc.name = name.trim();
    Store.save(); render();
  },
  deleteLocation(id) {
    if (Object.keys(Store.state.locations).length <= 1) return;
    if (!confirm('Delete this location and its equipment setup?')) return;
    delete Store.state.locations[id];
    if (Store.state.activeLocationId === id) {
      Store.state.activeLocationId = Object.keys(Store.state.locations)[0];
    }
    Store.save(); render();
  },
  switchLocation(id) {
    Store.state.activeLocationId = id;
    Store.save(); render();
  },

  // ─ Simple toggles ─
  toggleSimpleEquip(id) {
    const loc = getActiveLocation(Store.state);
    const idx = loc.simple.indexOf(id);
    if (idx >= 0) loc.simple.splice(idx, 1); else loc.simple.push(id);
    Store.save(); render();
  },

  // ─ Barbell ─
  toggleBarbellHas() {
    const loc = getActiveLocation(Store.state);
    loc.barbell.has = !loc.barbell.has;
    if (loc.barbell.has && loc.barbell.bars.length === 0) loc.barbell.bars = [{ type: 'oly_m', weight: 45, count: 1 }];
    Store.save(); render();
  },
  addBar(typeId) {
    const loc = getActiveLocation(Store.state);
    if (loc.barbell.bars.some(b => b.type === typeId)) return;
    const t = BAR_TYPES.find(x => x.id === typeId);
    loc.barbell.bars.push({ type: typeId, weight: (t && t.weight != null) ? t.weight : 45, count: 1 });
    Store.save(); render();
  },
  removeBar(i) {
    const loc = getActiveLocation(Store.state);
    loc.barbell.bars.splice(i, 1);
    Store.save(); render();
  },
  adjustBarWeight(i, d) {
    const loc = getActiveLocation(Store.state);
    const bar = loc.barbell.bars[i];
    bar.weight = Math.min(65, Math.max(10, bar.weight + d));
    Store.save(); render();
  },
  adjustBarCount(i, d) {
    const loc = getActiveLocation(Store.state);
    const bar = loc.barbell.bars[i];
    bar.count = Math.max(1, bar.count + d);
    Store.save(); render();
  },

  // ─ Bumper / Iron Plates (kind: 'bumperPlates' | 'ironPlates') ─
  togglePlateGroup(kind) {
    const loc = getActiveLocation(Store.state);
    const grp = loc[kind];
    grp.has = !grp.has;
    if (grp.has && grp.items.length === 0) {
      const type = kind === 'bumperPlates' ? 'bumper' : 'iron';
      grp.items = DEFAULT_PLATE_SET.filter(p => p.type === type).map(p => ({ weight: p.weight, pairs: p.pairs }));
    }
    Store.save(); render();
  },
  addPlateItem(kind, weight) {
    const loc = getActiveLocation(Store.state);
    loc[kind].items.push({ weight, pairs: 1 });
    loc[kind].items.sort((a, b) => b.weight - a.weight);
    Store.save(); render();
  },
  removePlateItem(kind, i) {
    const loc = getActiveLocation(Store.state);
    loc[kind].items.splice(i, 1);
    Store.save(); render();
  },
  adjustPlatePairs(kind, i, d) {
    const loc = getActiveLocation(Store.state);
    const item = loc[kind].items[i];
    item.pairs = Math.max(0, item.pairs + d);
    Store.save(); render();
  },

  // ─ Kettlebells (kind: 'kbAdjustable' | 'kbFixed') ─
  toggleKb(kind) {
    const loc = getActiveLocation(Store.state);
    loc[kind].has = !loc[kind].has;
    Store.save(); render();
  },
  addKbWeight(kind, w) {
    const loc = getActiveLocation(Store.state);
    const arr = loc[kind].weights;
    if (!arr.includes(w)) { arr.push(w); arr.sort((a, b) => a - b); }
    Store.save(); render();
  },
  removeKbWeight(kind, w) {
    const loc = getActiveLocation(Store.state);
    loc[kind].weights = loc[kind].weights.filter(x => x !== w);
    Store.save(); render();
  },

  // ─ Dumbbells (kind: 'dbAdjustable' | 'dbFixed') ─
  toggleDb(kind) {
    const loc = getActiveLocation(Store.state);
    loc[kind].has = !loc[kind].has;
    Store.save(); render();
  },
  addDbWeight(kind, w) {
    const loc = getActiveLocation(Store.state);
    const arr = loc[kind].weights;
    if (!arr.some(x => x.weight === w)) { arr.push({ weight: w, unit: 'pair' }); arr.sort((a, b) => a.weight - b.weight); }
    Store.save(); render();
  },
  removeDbWeight(kind, w) {
    const loc = getActiveLocation(Store.state);
    loc[kind].weights = loc[kind].weights.filter(x => x.weight !== w);
    Store.save(); render();
  },
  setDbUnit(kind, i, unit) {
    const loc = getActiveLocation(Store.state);
    loc[kind].weights[i].unit = unit;
    Store.save(); render();
  },

  // ─ Units / Select-all ─
  setUnits(u) { Store.state.units = u; Store.save(); render(); },
  selectAllEquipment() {
    const loc = getActiveLocation(Store.state);
    loc.barbell.has = true;
    if (loc.barbell.bars.length === 0) loc.barbell.bars = [{ type: 'oly_m', weight: 45, count: 1 }];
    ['bumperPlates', 'ironPlates'].forEach(kind => {
      loc[kind].has = true;
      if (loc[kind].items.length === 0) {
        const type = kind === 'bumperPlates' ? 'bumper' : 'iron';
        loc[kind].items = DEFAULT_PLATE_SET.filter(p => p.type === type).map(p => ({ weight: p.weight, pairs: p.pairs }));
      }
    });
    loc.kbAdjustable.has = true; loc.kbFixed.has = true;
    loc.dbAdjustable.has = true; loc.dbFixed.has = true;
    loc.simple = ALL_SIMPLE_EQUIPMENT.slice();
    Store.save(); render();
  },
  deselectAllEquipment() {
    const loc = getActiveLocation(Store.state);
    loc.barbell.has = false;
    loc.bumperPlates.has = false; loc.ironPlates.has = false;
    loc.kbAdjustable.has = false; loc.kbFixed.has = false;
    loc.dbAdjustable.has = false; loc.dbFixed.has = false;
    loc.simple = [];
    Store.save(); render();
  },

  // ─ Skills ─
  toggleSkill(id) {
    const idx = Store.state.disabledExercises.indexOf(id);
    if (idx >= 0) Store.state.disabledExercises.splice(idx, 1); else Store.state.disabledExercises.push(id);
    Store.save(); render();
  },
  selectAllSkills() { Store.state.disabledExercises = []; Store.save(); render(); },
  deselectAllSkills() { Store.state.disabledExercises = EXERCISES.map(e => e.id); Store.save(); render(); },

  setProfileTab(tab) { UI.profileTab = tab; render(); },

  finishOnboarding() {
    Store.state.onboarded = true;
    Store.save();
    generateToday(Store.state);
    UI.screen = 'today'; UI.tab = 'today';
    render();
  },
  confirmReset() {
    if (confirm('Reset all WODshed data on this device? This cannot be undone.')) {
      Store.reset();
      this.init();
    }
  },

  acceptBenchmark() {
    swapWodToBenchmark(Store.state);
    render();
  },
  dismissBenchmark() {
    Store.state.today.benchmarkOffer = null;
    Store.save(); render();
  },

  startOrResume() {
    const plan = Store.state.today;
    const order = ['warmup', 'skill', 'wod', 'core'];
    const next = order.find(s => !plan.completed[s]);
    if (next) this.enterExec(next);
  },

  // Skill shapes A (straight sets) and C (superset) don't auto-start a timer
  // on entry — the athlete paces sets manually — so a "get ready" countdown
  // has nothing to lead into. Only warmup, skill shape B, WOD, and core do.
  sectionIsTimed(section) {
    if (section === 'skill') return Store.state.today.skill.shape === 'B';
    return true;
  },

  enterExec(section) {
    if (!this.sectionIsTimed(section)) { this.beginExecSection(section); return; }
    UI.execSection = section; UI.screen = 'countdown';
    if (UI.timer) { UI.timer.destroy(); UI.timer = null; }
    UI.timer = new WTimer({
      mode: 'down', durationMs: 10000, completeSound: 'start',
      onTick: () => { const e = byId('countdownNum'); if (e) e.textContent = Math.ceil(UI.timer.remainingMs() / 1000); },
      onComplete: () => this.beginExecSection(section),
    });
    UI.timer.start();
    render();
  },

  skipCountdown() {
    if (UI.timer) { UI.timer.destroy(); UI.timer = null; }
    this.beginExecSection(UI.execSection);
  },

  beginExecSection(section) {
    UI.execSection = section; UI.screen = 'exec';
    if (UI.timer) { UI.timer.destroy(); UI.timer = null; }
    const plan = Store.state.today;

    if (section === 'warmup') {
      UI.warmupChecks = new Array(plan.warmup.moves.length * plan.warmup.rounds).fill(false);
      UI.timer = new WTimer({ mode: 'up', onTick: () => { const e = byId('warmupTime'); if (e) e.textContent = fmtClock(UI.timer.elapsedMs()); } });
      UI.timer.start(); UI.running = true;
    } else if (section === 'skill') {
      const s = plan.skill;
      if (s.shape === 'A') {
        UI.skillSetIndex = 0; UI.skillWeight = s.weight; UI.skillResting = false;
      } else if (s.shape === 'B') {
        UI.bRoundIndex = 1;
        UI.timer = new WTimer({
          mode: 'down', durationMs: s.intervalSec * 1000, completeSound: 'start',
          onTick: () => { const e = byId('bTime'); if (e) e.textContent = fmtClock(UI.timer.remainingMs()); },
          onComplete: () => this.advanceSkillB(),
        });
        UI.timer.start(); UI.running = true;
      } else {
        UI.skillRoundIndex = 1; UI.skillResting = false;
        UI.skillWeightsC = s.weights.slice();
      }
    } else if (section === 'wod') {
      const w = plan.wod;
      UI.wodStepIndex = 0; UI.wodRftRound = 0; UI.wodAmrapRounds = 0; UI.wodAmrapReps = 0; UI.bRoundIndex = 1;
      if (w.format === 'amrap') {
        UI.timer = new WTimer({
          mode: 'down', durationMs: w.capSec * 1000,
          onTick: () => { const e = byId('wodTime'); if (e) e.textContent = fmtClock(UI.timer.remainingMs()); },
          onComplete: () => this.finishAmrap(),
        });
      } else if (w.format === 'emom') {
        UI.timer = new WTimer({
          mode: 'down', durationMs: 60 * 1000, completeSound: 'start',
          onTick: () => { const e = byId('bTime'); if (e) e.textContent = fmtClock(UI.timer.remainingMs()); },
          onComplete: () => this.advanceWodEmom(),
        });
      } else {
        UI.timer = new WTimer({ mode: 'up', onTick: () => { const e = byId('wodTime'); if (e) e.textContent = fmtClock(UI.timer.elapsedMs()); } });
      }
      UI.timer.start(); UI.running = true;
    } else if (section === 'core') {
      const c = plan.core;
      if (c.shape === 'tabata' || c.shape === 'holds') {
        UI.coreRound = 1; UI.coreIntervalIndex = 0; UI.corePhase = c.shape === 'tabata' ? 'work' : 'hold';
        const dur = (c.shape === 'tabata' ? c.workSec : c.holdSec) * 1000;
        UI.timer = new WTimer({
          mode: 'down', durationMs: dur, completeSound: 'final',
          onTick: () => { const e = byId('coreTime'); if (e) e.textContent = Math.ceil(UI.timer.remainingMs() / 1000); },
          onComplete: () => this.advanceCorePhase(),
        });
        UI.timer.start(); UI.running = true;
      } else {
        UI.coreChecks = new Array(c.moves.length * c.rounds).fill(false);
        UI.timer = new WTimer({ mode: 'up', onTick: () => { const e = byId('coreTimeUp'); if (e) e.textContent = fmtClock(UI.timer.elapsedMs()); } });
        UI.timer.start(); UI.running = true;
      }
    }
    render();
  },

  exitExec() {
    if (UI.timer) { UI.timer.destroy(); UI.timer = null; }
    UI.screen = 'today'; render();
  },

  toggleTimer() {
    if (!UI.timer) return;
    UI.timer.toggle(); UI.running = UI.timer.running; render();
  },

  toggleWarmupCheck(i) { UI.warmupChecks[i] = !UI.warmupChecks[i]; render(); },
  finishWarmup() {
    const result = { checked: UI.warmupChecks.filter(Boolean).length, total: UI.warmupChecks.length };
    this.finishSilent('warmup', result);
  },

  adjustWeight(dir) {
    const s = Store.state.today.skill;
    const loc = getActiveLocation(Store.state);
    if (loc && loc.barbell.has) {
      const inc = barbellIncrement(loc);
      const max = maxBarbellLoad(loc);
      UI.skillWeight = Math.min(max, Math.max(primaryBarWeight(loc.barbell), UI.skillWeight + dir * inc));
    } else {
      const inc = LIFT_INCREMENT[s.liftId] || 5;
      UI.skillWeight = Math.max(0, UI.skillWeight + dir * inc);
    }
    render();
  },
  completeSet() {
    const s = Store.state.today.skill;
    if (UI.skillSetIndex + 1 >= s.scheme.length) {
      UI.pendingResult = { weight: UI.skillWeight, reps: s.scheme[s.scheme.length - 1], sets: s.scheme.length };
      this.goToRating('skill');
      return;
    }
    UI.skillSetIndex += 1;
    UI.skillResting = true;
    UI.timer = new WTimer({
      mode: 'down', durationMs: s.rest * 1000, completeSound: 'start',
      onTick: () => { const e = byId('restTime'); if (e) e.textContent = fmtClock(UI.timer.remainingMs()); },
      onComplete: () => { UI.skillResting = false; render(); },
    });
    UI.timer.start();
    render();
  },
  skipRest() {
    if (UI.timer) UI.timer.destroy();
    UI.skillResting = false; render();
  },
  adjustWeightC(i, dir) {
    const s = Store.state.today.skill;
    const moveId = s.moves[i];
    const ex = exerciseById(moveId);
    const loc = getActiveLocation(Store.state);
    const step = dir > 0 ? 1 : -1;
    if (loc && ex.equip.includes('kettlebell')) {
      UI.skillWeightsC[i] = stepOwnedWeight(kbWeightNumbers(loc), UI.skillWeightsC[i], step);
    } else if (loc && ex.equip.includes('dumbbell_pair')) {
      UI.skillWeightsC[i] = stepOwnedWeight(dbPairWeightNumbers(loc), UI.skillWeightsC[i], step);
    } else if (loc && ex.equip.includes('dumbbell')) {
      UI.skillWeightsC[i] = stepOwnedWeight(dbWeightNumbers(loc), UI.skillWeightsC[i], step);
    } else if (loc && ex.equip.includes('barbell') && loc.barbell.has) {
      const inc = barbellIncrement(loc);
      const max = maxBarbellLoad(loc);
      UI.skillWeightsC[i] = Math.min(max, Math.max(primaryBarWeight(loc.barbell), UI.skillWeightsC[i] + step * inc));
    } else {
      UI.skillWeightsC[i] = Math.max(0, UI.skillWeightsC[i] + step * 5);
    }
    render();
  },
  completeSkillRound() {
    const s = Store.state.today.skill;
    if (UI.skillRoundIndex >= s.rounds) {
      UI.pendingResult = {
        sets: s.rounds,
        moves: s.moves.map((m, i) => ({ move: m, reps: s.reps, weight: s.weighted[i] ? UI.skillWeightsC[i] : null })),
      };
      this.goToRating('skill');
      return;
    }
    UI.skillRoundIndex += 1;
    UI.skillResting = true;
    UI.timer = new WTimer({
      mode: 'down', durationMs: s.rest * 1000, completeSound: 'start',
      onTick: () => { const e = byId('restTime'); if (e) e.textContent = fmtClock(UI.timer.remainingMs()); },
      onComplete: () => { UI.skillResting = false; render(); },
    });
    UI.timer.start();
    render();
  },
  advanceSkillB() {
    const s = Store.state.today.skill;
    if (UI.bRoundIndex >= s.rounds) {
      UI.pendingResult = {};
      this.goToRating('skill');
      return;
    }
    UI.bRoundIndex += 1;
    UI.timer.reset(s.intervalSec * 1000);
    UI.timer.start();
    render();
  },
  skillSkipRound() { this.advanceSkillB(); },

  wodRoundDone() {
    const w = Store.state.today.wod;
    if (w.format === 'ladder') {
      if (UI.wodStepIndex + 1 >= w.steps.length) { this.finishWodWithClock(); return; }
      UI.wodStepIndex += 1;
    } else if (w.format === 'rft') {
      if (UI.wodRftRound + 1 >= w.rounds) { this.finishWodWithClock(); return; }
      UI.wodRftRound += 1;
    }
    render();
  },
  finishFortime() { this.finishWodWithClock(); },
  finishWodWithClock() {
    UI.pendingResult = { score: fmtClock(UI.timer ? UI.timer.elapsedMs() : 0) };
    this.goToRating('wod');
  },
  amrapAddRound() { UI.wodAmrapRounds += 1; render(); },
  amrapAddRep(d) { UI.wodAmrapReps = Math.max(0, UI.wodAmrapReps + d); render(); },
  finishAmrap() {
    UI.pendingResult = { score: `${UI.wodAmrapRounds}+${UI.wodAmrapReps}` };
    this.goToRating('wod');
  },
  advanceWodEmom() {
    const w = Store.state.today.wod;
    if (UI.bRoundIndex >= w.rounds) {
      UI.pendingResult = { score: `${w.rounds} rounds` };
      this.goToRating('wod');
      return;
    }
    UI.bRoundIndex += 1;
    UI.timer.reset(60 * 1000);
    UI.timer.start();
    render();
  },
  wodSkipRound() { this.advanceWodEmom(); },

  // Checks "was that the last interval" at the work/hold boundary, before
  // ever entering rest — so there's never a trailing rest after the final
  // round with nothing to lead into (which would leave "Up Next" showing a
  // movement that isn't actually coming).
  advanceCorePhase() {
    const c = Store.state.today.core;
    if (c.shape === 'tabata') {
      if (UI.corePhase === 'work') {
        if (UI.coreRound >= c.rounds) {
          this.finishCore();
        } else {
          UI.corePhase = 'rest';
          UI.timer.reset(c.restSec * 1000); UI.timer.completeSound = 'start'; UI.timer.start();
        }
      } else {
        UI.coreRound += 1; UI.corePhase = 'work';
        UI.timer.reset(c.workSec * 1000); UI.timer.completeSound = 'final'; UI.timer.start();
      }
    } else {
      // holds: c.rounds is rounds PER movement, so the finish line is
      // rounds * moves.length total intervals, not just c.rounds.
      const totalIntervals = c.rounds * c.moves.length;
      if (UI.corePhase === 'hold') {
        if (UI.coreIntervalIndex + 1 >= totalIntervals) {
          this.finishCore();
        } else {
          UI.corePhase = 'rest';
          UI.timer.reset(c.restSec * 1000); UI.timer.completeSound = 'start'; UI.timer.start();
        }
      } else {
        UI.coreIntervalIndex += 1; UI.corePhase = 'hold';
        UI.timer.reset(c.holdSec * 1000); UI.timer.completeSound = 'final'; UI.timer.start();
      }
    }
    render();
  },
  toggleCoreCheck(i) { UI.coreChecks[i] = !UI.coreChecks[i]; render(); },
  finishCore() {
    this.finishSilent('core', {});
  },

  goToRating(section) {
    if (UI.timer) { UI.timer.destroy(); UI.timer = null; }
    UI.execSection = section; UI.screen = 'rating';
    render();
  },

  // Warm-Up and Extra Core aren't rated (spec 2.6.1: rating drives progression
  // for tracked lifts and WODs only) — mark done and move straight on.
  finishSilent(section, resultData) {
    if (UI.timer) { UI.timer.destroy(); UI.timer = null; }
    completeSection(Store.state, section, null, resultData);
    this.goToNextOrSummary();
  },

  rate(value) {
    completeSection(Store.state, UI.execSection, value, UI.pendingResult);
    this.goToNextOrSummary();
  },

  goToNextOrSummary() {
    const plan = Store.state.today;
    const order = ['warmup', 'skill', 'wod', 'core'];
    const next = order.find(s => !plan.completed[s]);
    if (next) { UI.screen = 'nextPreview'; UI.nextSection = next; render(); }
    else { UI.screen = 'summary'; render(); }
  },
};

document.addEventListener('DOMContentLoaded', () => { initPillDragScroll(); App.init(); });

// iOS Safari sometimes reports a stale env(safe-area-inset-*) on first paint
// in standalone PWA mode — the fixed bottom nav sits slightly high until the
// next reflow. Nudging a 1px scroll forces that reflow invisibly.
window.addEventListener('load', () => {
  setTimeout(() => {
    window.scrollTo(0, 1);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, 60);
});
