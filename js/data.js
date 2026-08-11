// WODshed data layer — equipment, exercise library, templates, benchmarks, glossary.
// Every exercise's `equip` array lists ALL equipment ids required; [] = always available (bodyweight).

const ACTIVITY_TYPES = [
  'Jiu-Jitsu', 'Run', 'Bike', 'Swim', 'Yoga', 'Hike', 'Climbing', 'Boxing', 'Soccer', 'Basketball', 'Other',
];

// Barbell, kettlebells, and dumbbells are NOT simple toggles — each location
// tracks granular load info for them (bar weight + plate inventory, kettlebell
// mode + owned weights, dumbbell owned weights). See storage.js blankLocation().
const EQUIPMENT_GROUPS = [
  { id: 'barbell_plates', label: 'Rack & Bench', items: [
    { id: 'rack', label: 'Squat Rack / Rig' },
    { id: 'bench', label: 'Weight Bench' },
  ]},
  { id: 'gymnastics', label: 'Pull-Up / Gymnastics', items: [
    { id: 'pullupbar', label: 'Pull-Up Bar' },
    { id: 'rings', label: 'Gymnastics Rings' },
    { id: 'parallettes', label: 'Parallettes' },
    { id: 'rope', label: 'Climbing Rope' },
  ]},
  { id: 'machines', label: 'Cardio & Machines', items: [
    { id: 'run_outdoor', label: 'Running outdoors is an option?' },
    { id: 'rower', label: 'Rower' },
    { id: 'bike', label: 'Assault / Echo Bike' },
    { id: 'skierg', label: 'Ski Erg' },
    { id: 'treadmill', label: 'Treadmill' },
  ]},
  { id: 'plyo', label: 'Plyo & Throwing', items: [
    { id: 'plyobox', label: 'Plyo Box' },
    { id: 'medball', label: 'Medicine Ball / Wall Ball' },
    { id: 'slamball', label: 'Slam Ball' },
  ]},
  { id: 'core_post', label: 'Core & Posterior', items: [
    { id: 'ghd', label: 'GHD' },
    { id: 'abmat', label: 'Ab Mat' },
  ]},
  { id: 'odd', label: 'Odd Object / Carries', items: [
    { id: 'sandbag', label: 'Sandbag' },
    { id: 'farmer', label: "Farmer's Carry Handles" },
    { id: 'sled', label: 'Sled' },
  ]},
  { id: 'misc', label: 'Misc Conditioning', items: [
    { id: 'jumprope', label: 'Jump Rope' },
    { id: 'bands', label: 'Resistance Bands' },
  ]},
  { id: 'mobility', label: 'Mobility & Recovery', items: [
    { id: 'pvc', label: 'PVC Pipe' },
    { id: 'yogamat', label: 'Yoga Mat' },
  ]},
];

const ALL_SIMPLE_EQUIPMENT = EQUIPMENT_GROUPS.flatMap(g => g.items.map(i => i.id));

// Bar types a garage or commercial gym might have on hand. Picking one sets
// a sensible default bar weight; the stepper below it still allows fine
// adjustment for bars that don't match the catalog exactly.
const BAR_TYPES = [
  { id: 'oly_m', label: "Men's Olympic", weight: 45 },
  { id: 'oly_w', label: "Women's Olympic", weight: 35 },
  { id: 'technique', label: 'Technique Bar', weight: 15 },
  { id: 'ez_curl', label: 'EZ-Curl (W) Bar', weight: 18 },
  { id: 'trap_hex', label: 'Trap / Hex Bar', weight: 45 },
  { id: 'ssb', label: 'Safety Squat Bar', weight: 65 },
  { id: 'custom', label: 'Other', weight: null },
];

// Auto-filled the first time a location's barbell is switched on — a
// reasonable default garage-gym plate set (one pair each), easy to add to.
const DEFAULT_PLATE_SET = [
  { weight: 45, count: 2, type: 'bumper' }, { weight: 25, count: 2, type: 'bumper' },
  { weight: 15, count: 2, type: 'bumper' }, { weight: 10, count: 2, type: 'bumper' },
  { weight: 5, count: 2, type: 'iron' }, { weight: 2.5, count: 2, type: 'iron' },
];
const COMMON_BUMPER_WEIGHTS = [10, 15, 25, 35, 45, 55];
const COMMON_IRON_WEIGHTS = [1.25, 2.5, 5, 10, 15, 25, 35, 45, 100];
const COMMON_KB_WEIGHTS = [18, 26, 35, 44, 53, 62, 70];
const COMMON_DB_WEIGHTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];

const FOCUSES = ['strength', 'gymnastics', 'weightlifting', 'accessory', 'conditioning'];
const FOCUS_LABELS = {
  strength: 'Strength', gymnastics: 'Gymnastics', weightlifting: 'Weightlifting',
  accessory: 'Accessory', conditioning: 'Conditioning',
};
const FOCUS_SUBTITLES = {
  strength: 'Tracked barbell lifts', gymnastics: 'Bodyweight skill work', weightlifting: 'Olympic lift technique',
  accessory: 'Supplementary strength', conditioning: 'Metabolic engine work',
};

const GLOSSARY = {
  AMRAP: 'As Many Rounds (or Reps) As Possible. The clock counts down from a fixed time — your score is how far you got.',
  EMOM: 'Every Minute On the Minute. A new minute starts automatically — do the work, rest whatever time is left. The clock paces it for you.',
  RFT: 'Rounds For Time. A fixed number of identical rounds — the clock counts up, and your score is the total time to finish them all.',
  LADDER: 'One set of movements repeated across rounds where the rep count changes each round (e.g. 21 → 15 → 9). Scored the same way as RFT — total time.',
  FORTIME: 'Do the prescribed work once, as fast as possible, usually against a time cap.',
  TABATA: 'Short, fixed work/rest intervals (classically 20 sec work / 10 sec rest), repeated for a set number of rounds.',
  TIMECAP: 'A ceiling on how long you get. Hit it before finishing and "how far you got" becomes your result instead of a clean time.',
  BENCHMARK: 'A fixed, never-randomized named workout used to test your fitness at a point in time and compare against your own past scores.',
  RPE: 'How a lift or WOD felt — Easy, Right, or Hard. This one honest read is what drives all of WODshed’s load and volume decisions.',
  ONERM: 'One-rep max — the heaviest weight you can lift for a single rep of a given lift.',
  DELOAD: 'A deliberate, temporary drop in load or volume, triggered by how training has actually been going — never scheduled in advance.',
};

// ─── Exercise library ───────────────────────────────────────────────────────
// modality: weightlifting | gymnastics | monostructural | functional
// focus: which of the 5 training focuses this movement suits
// tracked: true if this is a load-progressed lift (Skill shape A candidate)
// pattern: squat | hinge | press | pull — used for deliberate sub-focus rotation

const EXERCISES = [
  // Weightlifting
  { id: 'air_squat', name: 'Air Squat', modality: 'weightlifting', equip: [], focus: ['strength', 'conditioning', 'gymnastics'] },
  { id: 'back_squat', name: 'Back Squat', modality: 'weightlifting', equip: ['barbell', 'rack'], focus: ['strength'], tracked: true, pattern: 'squat' },
  { id: 'front_squat', name: 'Front Squat', modality: 'weightlifting', equip: ['barbell', 'rack'], focus: ['strength'], tracked: true, pattern: 'squat' },
  { id: 'overhead_squat', name: 'Overhead Squat', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'], pattern: 'squat' },
  { id: 'zercher_squat', name: 'Zercher Squat', modality: 'weightlifting', equip: ['barbell'], focus: ['accessory'], pattern: 'squat' },
  { id: 'deadlift', name: 'Conventional Deadlift', modality: 'weightlifting', equip: ['barbell'], focus: ['strength'], tracked: true, pattern: 'hinge' },
  { id: 'sumo_deadlift', name: 'Sumo Deadlift', modality: 'weightlifting', equip: ['barbell'], focus: ['strength'], pattern: 'hinge' },
  { id: 'rdl', name: 'Romanian Deadlift', modality: 'weightlifting', equip: ['barbell'], focus: ['accessory'], pattern: 'hinge' },
  { id: 'good_morning', name: 'Good Morning', modality: 'weightlifting', equip: ['barbell'], focus: ['accessory'], pattern: 'hinge' },
  { id: 'clean', name: 'Clean', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'power_clean', name: 'Power Clean', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'], tracked: true },
  { id: 'squat_clean', name: 'Squat Clean', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'hang_clean', name: 'Hang Clean', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'hang_power_clean', name: 'Hang Power Clean', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'snatch', name: 'Snatch', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'power_snatch', name: 'Power Snatch', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'], tracked: true },
  { id: 'hang_snatch', name: 'Hang Snatch', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'muscle_snatch', name: 'Muscle Snatch', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'squat_snatch', name: 'Squat Snatch', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'split_jerk', name: 'Split Jerk', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'push_jerk', name: 'Push Jerk', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'push_press', name: 'Push Press', modality: 'weightlifting', equip: ['barbell'], focus: ['accessory'], tracked: true, pattern: 'press' },
  { id: 'shoulder_press', name: 'Shoulder Press', modality: 'weightlifting', equip: ['barbell'], focus: ['accessory'], tracked: true, pattern: 'press' },
  { id: 'thruster_bb', name: 'Thruster', modality: 'weightlifting', equip: ['barbell'], focus: ['conditioning'] },
  { id: 'thruster_db', name: 'DB Thruster', modality: 'weightlifting', equip: ['dumbbell_pair'], focus: ['conditioning'] },
  { id: 'sdhp', name: 'Sumo Deadlift High Pull', modality: 'weightlifting', equip: ['barbell'], focus: ['conditioning'] },
  { id: 'bench_press', name: 'Bench Press', modality: 'weightlifting', equip: ['barbell', 'bench'], focus: ['accessory'], tracked: true, pattern: 'press' },
  { id: 'snatch_balance', name: 'Snatch Balance', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'sots_press', name: 'Sots Press', modality: 'weightlifting', equip: ['barbell'], focus: ['weightlifting'] },
  { id: 'db_clean', name: 'DB Clean', modality: 'weightlifting', equip: ['dumbbell'], focus: ['weightlifting'] },
  { id: 'db_snatch', name: 'DB Snatch', modality: 'weightlifting', equip: ['dumbbell'], focus: ['weightlifting', 'conditioning'] },
  { id: 'db_deadlift', name: 'DB Deadlift', modality: 'weightlifting', equip: ['dumbbell_pair'], focus: ['accessory'], pattern: 'hinge' },
  { id: 'db_front_squat', name: 'DB Front Squat', modality: 'weightlifting', equip: ['dumbbell_pair'], focus: ['accessory'], pattern: 'squat' },
  { id: 'db_ohs', name: 'DB Overhead Squat', modality: 'weightlifting', equip: ['dumbbell_pair'], focus: ['weightlifting'] },
  { id: 'db_lunge', name: 'DB Front-Rack Lunge', modality: 'weightlifting', equip: ['dumbbell_pair'], focus: ['accessory'] },
  { id: 'db_oh_lunge', name: 'DB Overhead Walking Lunge', modality: 'weightlifting', equip: ['dumbbell_pair'], focus: ['accessory'] },
  { id: 'db_tgu', name: 'DB Turkish Get-Up', modality: 'weightlifting', equip: ['dumbbell'], focus: ['accessory'] },
  { id: 'kb_swing', name: 'Kettlebell Swing', modality: 'weightlifting', equip: ['kettlebell'], focus: ['conditioning'] },
  { id: 'kb_snatch', name: 'Kettlebell Snatch', modality: 'weightlifting', equip: ['kettlebell'], focus: ['conditioning'] },
  { id: 'kb_clean', name: 'Kettlebell Clean', modality: 'weightlifting', equip: ['kettlebell'], focus: ['conditioning'] },
  { id: 'kb_goblet_squat', name: 'Kettlebell Goblet Squat', modality: 'weightlifting', equip: ['kettlebell'], focus: ['accessory'], pattern: 'squat' },
  { id: 'kb_tgu', name: 'Kettlebell Turkish Get-Up', modality: 'weightlifting', equip: ['kettlebell'], focus: ['accessory'] },
  { id: 'farmer_kb', name: "Farmer's Carry (KB)", modality: 'weightlifting', equip: ['kettlebell'], focus: ['accessory', 'conditioning'] },
  { id: 'farmer_db', name: "Farmer's Carry (DB)", modality: 'weightlifting', equip: ['dumbbell'], focus: ['accessory', 'conditioning'] },
  { id: 'farmer_handles', name: "Farmer's Carry", modality: 'weightlifting', equip: ['farmer'], focus: ['accessory', 'conditioning'] },
  { id: 'mb_clean', name: 'Medicine-Ball Clean', modality: 'weightlifting', equip: ['medball'], focus: ['accessory'] },
  { id: 'wall_ball', name: 'Wall-Ball Shot', modality: 'weightlifting', equip: ['medball'], focus: ['conditioning'] },
  { id: 'slam_ball', name: 'Slam Ball', modality: 'weightlifting', equip: ['slamball'], focus: ['conditioning'] },
  { id: 'sandbag_clean', name: 'Sandbag Clean', modality: 'weightlifting', equip: ['sandbag'], focus: ['accessory'] },
  { id: 'sandbag_carry', name: 'Sandbag Carry', modality: 'weightlifting', equip: ['sandbag'], focus: ['accessory', 'conditioning'] },
  { id: 'sled_push', name: 'Sled Push', modality: 'weightlifting', equip: ['sled'], focus: ['conditioning'] },
  { id: 'sled_pull', name: 'Sled Pull', modality: 'weightlifting', equip: ['sled'], focus: ['conditioning'] },

  // Gymnastics
  { id: 'push_up', name: 'Push-Up', modality: 'gymnastics', equip: [], focus: ['gymnastics', 'conditioning'] },
  { id: 'ring_push_up', name: 'Ring Push-Up', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics'] },
  { id: 'strict_pullup', name: 'Strict Pull-Up', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics'] },
  { id: 'kipping_pullup', name: 'Kipping Pull-Up', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics', 'conditioning'] },
  { id: 'butterfly_pullup', name: 'Butterfly Pull-Up', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics'] },
  { id: 'c2b_pullup', name: 'Chest-to-Bar Pull-Up', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics'] },
  { id: 'strict_mu_bar', name: 'Strict Bar Muscle-Up', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics'] },
  { id: 'kipping_mu_bar', name: 'Kipping Bar Muscle-Up', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics'] },
  { id: 'strict_mu_ring', name: 'Strict Ring Muscle-Up', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics'] },
  { id: 'kipping_mu_ring', name: 'Kipping Ring Muscle-Up', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics'] },
  { id: 'ring_dip', name: 'Ring Dip', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics'] },
  { id: 'ring_row', name: 'Ring Row', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics', 'accessory'] },
  { id: 'parallette_dip', name: 'Parallette Dip', modality: 'gymnastics', equip: ['parallettes'], focus: ['gymnastics'] },
  { id: 'ttb', name: 'Toes-to-Bar', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics', 'conditioning'] },
  { id: 'kte', name: 'Knees-to-Elbow', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics'] },
  { id: 'toes_to_rings', name: 'Toes-to-Rings', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics'] },
  { id: 'lsit_floor', name: 'L-Sit', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'lsit_hang', name: 'Hanging L-Sit', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics'] },
  { id: 'lsit_rings', name: 'L-Sit on Rings', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics'] },
  { id: 'l_pullup', name: 'L Pull-Up', modality: 'gymnastics', equip: ['pullupbar'], focus: ['gymnastics'] },
  { id: 'hs_hold', name: 'Handstand Hold', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'hs_walk', name: 'Handstand Walk', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'strict_hspu', name: 'Strict Handstand Push-Up', modality: 'gymnastics', equip: [], focus: ['gymnastics'], tracked: true },
  { id: 'kipping_hspu', name: 'Kipping Handstand Push-Up', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'deficit_hspu', name: 'Deficit Handstand Push-Up', modality: 'gymnastics', equip: ['parallettes'], focus: ['gymnastics'] },
  { id: 'wall_walk', name: 'Wall Walk', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'freestanding_hs', name: 'Freestanding Handstand', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'hs_pirouette', name: 'Handstand Pirouette', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'walking_lunge', name: 'Walking Lunge', modality: 'gymnastics', equip: [], focus: ['gymnastics', 'conditioning'] },
  { id: 'pistol', name: 'Pistol (Single-Leg Squat)', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'burpee', name: 'Burpee', modality: 'gymnastics', equip: [], focus: ['gymnastics', 'conditioning'] },
  { id: 'burpee_bjo', name: 'Burpee Box Jump-Over', modality: 'gymnastics', equip: ['plyobox'], focus: ['conditioning'] },
  { id: 'box_jump', name: 'Box Jump', modality: 'gymnastics', equip: ['plyobox'], focus: ['conditioning'] },
  { id: 'box_step_up', name: 'Box Step-Up', modality: 'gymnastics', equip: ['plyobox'], focus: ['accessory'] },
  { id: 'situp', name: 'Sit-Up', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'abmat_situp', name: 'AbMat Sit-Up', modality: 'gymnastics', equip: ['abmat'], focus: ['gymnastics'] },
  { id: 'vup', name: 'V-Up', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'ghd_situp', name: 'GHD Sit-Up', modality: 'gymnastics', equip: ['ghd'], focus: ['gymnastics'] },
  { id: 'ghd_extension', name: 'GHD Hip/Back Extension', modality: 'gymnastics', equip: ['ghd'], focus: ['gymnastics'] },
  { id: 'hollow_rock', name: 'Hollow Rock', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'superman_hold', name: 'Superman Hold', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'rope_climb_legless', name: 'Legless Rope Climb', modality: 'gymnastics', equip: ['rope'], focus: ['gymnastics'] },
  { id: 'rope_climb', name: 'Rope Climb', modality: 'gymnastics', equip: ['rope'], focus: ['gymnastics'] },
  { id: 'skin_the_cat', name: 'Skin the Cat', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics'] },
  { id: 'forward_roll', name: 'Forward Roll', modality: 'gymnastics', equip: [], focus: ['gymnastics'] },
  { id: 'shoot_through', name: 'Shoot-Through', modality: 'gymnastics', equip: ['rings'], focus: ['gymnastics'] },

  // Monostructural
  { id: 'run', name: 'Run', modality: 'monostructural', equip: ['canrun'], focus: ['conditioning'] },
  { id: 'row_cal', name: 'Row (Calories)', modality: 'monostructural', equip: ['rower'], focus: ['conditioning'] },
  { id: 'row_m', name: 'Row (Meters)', modality: 'monostructural', equip: ['rower'], focus: ['conditioning'] },
  { id: 'bike_cal', name: 'Assault Bike (Calories)', modality: 'monostructural', equip: ['bike'], focus: ['conditioning'] },
  { id: 'skierg_cal', name: 'Ski Erg (Calories)', modality: 'monostructural', equip: ['skierg'], focus: ['conditioning'] },
  { id: 'single_under', name: 'Single-Under', modality: 'monostructural', equip: ['jumprope'], focus: ['conditioning'] },
  { id: 'double_under', name: 'Double-Under', modality: 'monostructural', equip: ['jumprope'], focus: ['conditioning'] },
  { id: 'treadmill_run', name: 'Treadmill Run', modality: 'monostructural', equip: ['treadmill'], focus: ['conditioning'] },

  // General / functional
  { id: 'mtn_climber', name: 'Mountain Climber', modality: 'functional', equip: [], focus: ['gymnastics', 'conditioning'] },
  { id: 'high_knees', name: 'High Knees', modality: 'functional', equip: [], focus: ['conditioning'] },
  { id: 'jumping_jack', name: 'Jumping Jack', modality: 'functional', equip: [], focus: ['conditioning'] },
  { id: 'plank_hold', name: 'Plank Hold', modality: 'functional', equip: [], focus: ['gymnastics'] },
  { id: 'side_plank', name: 'Side Plank', modality: 'functional', equip: [], focus: ['gymnastics'] },
  { id: 'glute_bridge', name: 'Glute Bridge', modality: 'functional', equip: [], focus: ['gymnastics'] },
  { id: 'bicycle_crunch', name: 'Bicycle Crunch', modality: 'functional', equip: [], focus: ['gymnastics'] },
  { id: 'flutter_kick', name: 'Flutter Kick', modality: 'functional', equip: [], focus: ['gymnastics'] },
  { id: 'russian_twist', name: 'Russian Twist', modality: 'functional', equip: [], focus: ['gymnastics'] },
  { id: 'bent_row_db', name: 'Bent-Over Row', modality: 'functional', equip: ['dumbbell'], focus: ['accessory'] },
  { id: 'bicep_curl', name: 'Bicep Curl', modality: 'functional', equip: ['dumbbell'], focus: ['accessory'] },
  { id: 'skull_crusher', name: 'Skull Crusher', modality: 'functional', equip: ['dumbbell'], focus: ['accessory'] },
  { id: 'tricep_ext', name: 'Tricep Extension', modality: 'functional', equip: ['dumbbell'], focus: ['accessory'] },
  { id: 'lateral_raise', name: 'Lateral Raise', modality: 'functional', equip: ['dumbbell'], focus: ['accessory'] },
  { id: 'arnold_press', name: 'Arnold Press', modality: 'functional', equip: ['dumbbell'], focus: ['accessory'] },
];

function exerciseById(id) { return EXERCISES.find(e => e.id === id); }

// ─── Warm-up templates (2 rounds of 4 bodyweight movements, no progression) ─
const WARMUP_TEMPLATES = [
  { id: 'w1', moves: ['air_squat', 'push_up', 'mtn_climber', 'jumping_jack'] },
  { id: 'w2', moves: ['walking_lunge', 'plank_hold', 'high_knees', 'glute_bridge'] },
  { id: 'w3', moves: ['air_squat', 'situp', 'burpee', 'mtn_climber'] },
  { id: 'w4', moves: ['push_up', 'russian_twist', 'jumping_jack', 'walking_lunge'] },
  { id: 'w5', moves: ['high_knees', 'plank_hold', 'air_squat', 'superman_hold'] },
  { id: 'w6', moves: ['mtn_climber', 'glute_bridge', 'push_up', 'situp'] },
];

// Prescription shown alongside each warm-up movement — reps, or a hold/duration string.
const WARMUP_PRESCRIPTION = {
  air_squat: '15', push_up: '10', mtn_climber: '20', jumping_jack: '20',
  walking_lunge: '10/leg', plank_hold: '30 sec', high_knees: '20',
  glute_bridge: '15', situp: '15', burpee: '8', russian_twist: '20',
  superman_hold: '20 sec',
};

// ─── Skill templates — 3 shapes per spec 2.5 ────────────────────────────────
// shape A: straight sets, load-tracked. shape B: EMOM. shape C: rest-interval superset.
const SKILL_TEMPLATES = {
  strength: [
    { id: 'str_straight_5x5', shape: 'A', scheme: [5, 5, 5, 5, 5], rest: 120, lifts: ['back_squat', 'front_squat', 'deadlift'] },
    { id: 'str_descend', shape: 'A', scheme: [5, 5, 3, 3, 2, 2], rest: 120, lifts: ['back_squat', 'front_squat', 'deadlift'] },
  ],
  weightlifting: [
    { id: 'oly_complex_emom', shape: 'B', intervalSec: 120, rounds: 5, movesOdd: ['power_clean'], movesEven: ['power_snatch'], reps: 3 },
    { id: 'oly_straight', shape: 'A', scheme: [3, 3, 3, 3, 3], rest: 120, lifts: ['power_clean', 'power_snatch'] },
  ],
  gymnastics: [
    { id: 'gym_emom_alt', shape: 'B', intervalSec: 60, rounds: 10, movesOdd: ['ttb'], movesEven: ['lsit_hang'], secHold: 30 },
    { id: 'gym_emom_single', shape: 'B', intervalSec: 60, rounds: 10, movesOdd: ['strict_pullup'], movesEven: ['strict_pullup'], reps: 5 },
  ],
  accessory: [
    { id: 'acc_superset', shape: 'C', rest: 90, rounds: 4, moves: ['bench_press', 'bent_row_db', 'db_lunge'], reps: 10 },
    { id: 'acc_superset2', shape: 'C', rest: 90, rounds: 4, moves: ['push_press', 'kb_goblet_squat', 'russian_twist'], reps: 12 },
  ],
  conditioning: [
    { id: 'cond_emom_interval', shape: 'B', intervalSec: 90, rounds: 6, movesOdd: ['double_under'], movesEven: ['box_jump'], reps: 20 },
    { id: 'cond_superset', shape: 'C', rest: 60, rounds: 4, moves: ['kb_swing', 'burpee', 'mtn_climber'], reps: 15 },
  ],
};

// ─── Extra Core templates (Tabata / holds / straight rep work) ─────────────
const CORE_TEMPLATES = [
  { id: 'core_tabata1', shape: 'tabata', rounds: 8, workSec: 20, restSec: 10, moves: ['hollow_rock', 'superman_hold'] },
  { id: 'core_tabata2', shape: 'tabata', rounds: 8, workSec: 20, restSec: 10, moves: ['plank_hold', 'side_plank'] },
  { id: 'core_holds', shape: 'holds', rounds: 3, holdSec: 45, restSec: 30, moves: ['plank_hold', 'glute_bridge'] },
  { id: 'core_straight', shape: 'straight', rounds: 3, reps: 20, moves: ['situp', 'vup', 'russian_twist'] },
  { id: 'core_straight2', shape: 'straight', rounds: 3, reps: 15, moves: ['flutter_kick', 'bicycle_crunch', 'mtn_climber'] },
];

// ─── Benchmark WODs (fixed, never randomized) ───────────────────────────────
const BENCHMARKS = [
  { id: 'cindy', name: 'Cindy', format: 'amrap', capSec: 1200, line: '5 Pull-Ups, 10 Push-Ups, 15 Air Squats', equip: ['pullupbar'] },
  { id: 'annie', name: 'Annie', format: 'fortime', line: '50-40-30-20-10 Double-Unders, 50-40-30-20-10 Sit-Ups', equip: ['jumprope'] },
  { id: 'fran', name: 'Fran', format: 'fortime', line: '21-15-9 Thrusters (95/65), 21-15-9 Pull-Ups', equip: ['barbell', 'pullupbar'] },
  { id: 'isabel', name: 'Isabel', format: 'fortime', line: '30 Snatches (135/95)', equip: ['barbell'] },
  { id: 'jackie', name: 'Jackie', format: 'fortime', line: '1000m Row, 50 Thrusters (45), 30 Pull-Ups', equip: ['rower', 'barbell', 'pullupbar'] },
  { id: 'chelsea', name: 'Chelsea', format: 'emom', capSec: 1800, line: '5 Pull-Ups, 10 Push-Ups, 15 Air Squats — every minute', equip: ['pullupbar'] },
  { id: 'murph', name: 'Murph', format: 'fortime', line: '1 Mile Run, 100 Pull-Ups, 200 Push-Ups, 300 Squats, 1 Mile Run', equip: ['pullupbar'] },
];

// ─── WOD movement pools per focus, tagged by equipment via EXERCISES ───────
const WOD_MOVEMENT_POOL_BY_FOCUS = {
  strength: ['air_squat', 'kb_swing', 'wall_ball', 'box_jump', 'burpee', 'push_up', 'run', 'row_cal', 'double_under'],
  gymnastics: ['ttb', 'kipping_pullup', 'burpee', 'box_jump', 'push_up', 'run', 'double_under', 'wall_ball'],
  weightlifting: ['thruster_bb', 'power_clean', 'push_jerk', 'burpee', 'sdhp', 'kb_swing', 'run', 'row_cal', 'wall_ball'],
  accessory: ['kb_swing', 'db_snatch', 'burpee', 'box_jump', 'wall_ball', 'run', 'row_cal', 'push_up'],
  conditioning: ['burpee', 'row_cal', 'bike_cal', 'run', 'double_under', 'wall_ball', 'box_jump', 'kb_swing', 'thruster_db', 'sled_push', 'ttb'],
};
