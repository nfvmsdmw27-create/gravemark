import { useState, useEffect, useRef, useMemo } from "react";

const roll  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
const pct   = (val, max) => clamp((val / max) * 100, 0, 100);

// ============================================================
// NAMES
// ============================================================

const CLASS_NAMES = {
  warrior:["Aldric","Brynn","Gorn","Marta","Daven","Thessa","Bram","Kira","Oswin","Helda"],
  rogue:  ["Sable","Corvin","Liss","Dusk","Wren","Fenn","Shade","Vex","Nim","Cray"],
  mage:   ["Serath","Vela","Orin","Zaya","Kael","Miren","Pell","Sorin","Lyra","Tavish"],
  druid:  ["Alder","Fern","Moss","Briar","Sylva","Rook","Thorn","Ivy","Gale","Cedar"],
  necromancer:["Mord","Vesper","Drace","Nyx","Grim","Sevar","Lorne","Crypt","Asha","Bael"],
};

const randomName = (k) => { const p=CLASS_NAMES[k]||CLASS_NAMES.warrior; return p[Math.floor(Math.random()*p.length)]; };

function epitaph(r) {
  if (r<=2)  return "Barely a memory.";
  if (r<=5)  return "The dungeon swallowed them whole.";
  if (r<=9)  return "They fought well, and were forgotten.";
  if (r<=14) return "A legend in the making, cut short.";
  if (r<=24) return "The deep floors claimed another soul.";
  return "Songs were sung. Briefly.";
}

// ============================================================
// WORLD TREE
// ============================================================


// ============================================================
// SOUND ENGINE — Dark Fantasy (synthesised, no audio files)
// ============================================================

const SoundEngine = (() => {
  let ctx = null;
  let muted = false;
  let initialised = false;
  let ambientNodes = null; // {osc1, osc2, gainNode}
  let ambientActive = false;

  function init() {
    if (initialised) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      initialised = true;
    } catch(e) {}
  }

  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function setMuted(m) {
    muted = m;
    if (ambientNodes) {
      ambientNodes.gainNode.gain.setTargetAtTime(m ? 0 : 0.06, ctx.currentTime, 0.5);
    }
  }
  function isMuted() { return muted; }

  // Core tone builder — smoother envelopes, no clicky square waves
  function tone({ freq=220, type="sine", attack=0.02, sustain=0.15, release=0.3,
                   gain=0.25, detune=0, filterFreq=null, filterQ=1 } = {}) {
    if (muted || !ctx) return;
    resume();
    try {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      let node  = osc;
      if (filterFreq) {
        const flt = ctx.createBiquadFilter();
        flt.type = "lowpass";
        flt.frequency.value = filterFreq;
        flt.Q.value = filterQ;
        osc.connect(flt);
        flt.connect(g);
      } else {
        osc.connect(g);
      }
      g.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.setValueAtTime(gain, t + attack + sustain);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + sustain + release);
      osc.start(t);
      osc.stop(t + attack + sustain + release + 0.1);
    } catch(e) {}
  }

  // Noise burst — for impact/hit sounds using white noise
  function noiseBurst({ duration=0.08, gain=0.3, filterFreq=800, attack=0.002 } = {}) {
    if (muted || !ctx) return;
    resume();
    try {
      const bufSize = ctx.sampleRate * duration;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const flt = ctx.createBiquadFilter();
      flt.type = "bandpass";
      flt.frequency.value = filterFreq;
      flt.Q.value = 1.5;
      const g = ctx.createGain();
      src.connect(flt); flt.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      src.start(t); src.stop(t + duration + 0.05);
    } catch(e) {}
  }

  // Layered hit — sub bass + noise
  function layeredHit({ bassPitch=80, noiseFreq=1200, bassGain=0.4, noiseGain=0.25 } = {}) {
    tone({ freq:bassPitch, type:"sine", attack:0.005, sustain:0.05, release:0.15, gain:bassGain });
    noiseBurst({ duration:0.06, gain:noiseGain, filterFreq:noiseFreq });
  }

  // Dynamic ambient — layered drone with random events
  let ambientTimers = [];
  let ambientIsBoss = false;

  function clearAmbientTimers() {
    ambientTimers.forEach(t => clearTimeout(t));
    ambientTimers = [];
  }

  function scheduleRumble() {
    if (!ambientActive || !ctx) return;
    const delay = 8000 + Math.random() * 12000;
    const t = setTimeout(() => {
      if (!ambientActive || !ctx || muted) { scheduleRumble(); return; }
      try {
        // Swell noise burst — low rumble fading in and out
        const bufSize = ctx.sampleRate * 2.5;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const flt = ctx.createBiquadFilter();
        flt.type = "lowpass"; flt.frequency.value = 120;
        const g = ctx.createGain();
        src.connect(flt); flt.connect(g); g.connect(ctx.destination);
        const t2 = ctx.currentTime;
        g.gain.setValueAtTime(0, t2);
        g.gain.linearRampToValueAtTime(0.18, t2 + 0.8);
        g.gain.linearRampToValueAtTime(0.12, t2 + 1.4);
        g.gain.linearRampToValueAtTime(0, t2 + 2.5);
        src.start(t2); src.stop(t2 + 2.6);
      } catch(e) {}
      scheduleRumble();
    }, delay);
    ambientTimers.push(t);
  }

  function scheduleBossStab() {
    if (!ambientActive || !ctx || !ambientIsBoss) return;
    const delay = 6000 + Math.random() * 10000;
    const t = setTimeout(() => {
      if (!ambientActive || !ctx || muted || !ambientIsBoss) { scheduleBossStab(); return; }
      try {
        // Dissonant interval stab — tritone for maximum tension
        [55, 77.8].forEach((f, i) => {
          setTimeout(() => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const flt = ctx.createBiquadFilter();
            flt.type = "lowpass"; flt.frequency.value = 200;
            osc.type = "sawtooth"; osc.frequency.value = f;
            osc.connect(flt); flt.connect(g); g.connect(ctx.destination);
            const now = ctx.currentTime;
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(0.22, now + 0.05);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
            osc.start(now); osc.stop(now + 1.3);
          }, i * 40);
        });
      } catch(e) {}
      scheduleBossStab();
    }, delay);
    ambientTimers.push(t);
  }

  function scheduleBossHeartbeat() {
    if (!ambientActive || !ctx || !ambientIsBoss) return;
    // Slow heartbeat: two quick thumps, long pause
    function thump(offset) {
      const t = setTimeout(() => {
        if (!ambientActive || !ctx || muted || !ambientIsBoss) return;
        try {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine"; osc.frequency.value = 50;
          osc.connect(g); g.connect(ctx.destination);
          const now = ctx.currentTime;
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(0.35, now + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
          osc.start(now); osc.stop(now + 0.3);
        } catch(e) {}
      }, offset);
      ambientTimers.push(t);
    }
    function cycle() {
      if (!ambientActive || !ambientIsBoss) return;
      const interval = 2200 + Math.random() * 800;
      thump(0);
      thump(220);
      const t = setTimeout(cycle, interval);
      ambientTimers.push(t);
    }
    cycle();
  }

  function scheduleTensionSweep() {
    // High shimmer sweep every 15-25s
    const delay = 15000 + Math.random() * 10000;
    const t = setTimeout(() => {
      if (!ambientActive || !ctx || muted) { scheduleTensionSweep(); return; }
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const flt = ctx.createBiquadFilter();
        flt.type = "highpass"; flt.frequency.value = 1200;
        osc.type = "sine"; osc.frequency.value = 1800;
        osc.connect(flt); flt.connect(g); g.connect(ctx.destination);
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.linearRampToValueAtTime(2400, now + 3);
        osc.frequency.linearRampToValueAtTime(600, now + 5);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.06, now + 1);
        g.gain.linearRampToValueAtTime(0.03, now + 4);
        g.gain.linearRampToValueAtTime(0, now + 5);
        osc.start(now); osc.stop(now + 5.1);
      } catch(e) {}
      scheduleTensionSweep();
    }, delay);
    ambientTimers.push(t);
  }

  function startAmbient(boss=false) {
    if (!ctx || muted) return;
    resume();
    if (ambientActive) stopAmbient();
    ambientIsBoss = boss;
    try {
      const baseFreq = boss ? 55 : 80;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const o3 = ctx.createOscillator();
      const g  = ctx.createGain();
      const flt = ctx.createBiquadFilter();
      flt.type = "lowpass";
      flt.frequency.value = boss ? 280 : 200;
      o1.type = "sine";     o1.frequency.value = baseFreq;
      o2.type = "sine";     o2.frequency.value = baseFreq * 1.5; o2.detune.value = boss ? -8 : -5;
      o3.type = "triangle"; o3.frequency.value = baseFreq * 0.5; o3.detune.value = 3;
      [o1,o2,o3].forEach(o => o.connect(flt));
      flt.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(boss ? 0.08 : 0.055, ctx.currentTime + 2.5);
      // Slow LFO
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = boss ? 0.25 : 0.12;
      lfoGain.gain.value = boss ? 12 : 7;
      lfo.connect(lfoGain); lfoGain.connect(o1.frequency);
      lfo.start(); o1.start(); o2.start(); o3.start();
      ambientNodes = { oscs:[o1,o2,o3,lfo], gainNode:g };
      ambientActive = true;
      // Schedule dynamic events
      setTimeout(() => scheduleRumble(), 4000);
      setTimeout(() => scheduleTensionSweep(), 8000);
      if (boss) {
        setTimeout(() => scheduleBossHeartbeat(), 2000);
        setTimeout(() => scheduleBossStab(), 5000);
      }
    } catch(e) {}
  }

  function stopAmbient() {
    ambientActive = false;
    ambientIsBoss = false;
    clearAmbientTimers();
    if (!ambientNodes || !ctx) return;
    try {
      ambientNodes.gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      const nodes = ambientNodes;
      ambientNodes = null;
      setTimeout(() => {
        try { nodes.oscs.forEach(o => o.stop()); } catch(e) {}
      }, 1600);
    } catch(e) { ambientNodes=null; }
  }

  // ── Named sounds ──
  const sounds = {
    // Warrior — heavy, blunt
    basicAttack: () => {
      layeredHit({ bassPitch:70, noiseFreq:900, bassGain:0.5, noiseGain:0.3 });
    },
    // Abilities — deeper magic/power feel
    abilityFire: () => {
      tone({ freq:180, type:"triangle", attack:0.02, sustain:0.1, release:0.3, gain:0.3 });
      tone({ freq:360, type:"sine",     attack:0.03, sustain:0.08, release:0.25, gain:0.2, detune:5 });
    },
    // Magic specifically — crystalline shimmer
    magebolt: () => {
      tone({ freq:880, type:"sine", attack:0.01, sustain:0.05, release:0.2, gain:0.2 });
      tone({ freq:1320,type:"sine", attack:0.02, sustain:0.04, release:0.18, gain:0.12, detune:-3 });
    },
    // Enemy hit — dull thud
    enemyHit: () => layeredHit({ bassPitch:55, noiseFreq:600, bassGain:0.45, noiseGain:0.2 }),
    // Player hurt — sharp impact with dissonance
    playerHurt: () => {
      tone({ freq:120, type:"sawtooth", attack:0.005, sustain:0.06, release:0.2, gain:0.35, filterFreq:400 });
      noiseBurst({ duration:0.1, gain:0.35, filterFreq:500 });
    },
    // Death — descending minor with reverb-like decay
    death: () => {
      [220,196,165,147].forEach((f,i) =>
        setTimeout(() =>
          tone({ freq:f, type:"triangle", attack:0.02, sustain:0.2, release:0.6, gain:0.3-i*0.04 }),
          i*220)
      );
      setTimeout(() => noiseBurst({ duration:0.4, gain:0.15, filterFreq:200 }), 200);
    },
    // Victory — warm ascending major chord
    victory: () => {
      [[523,0],[659,80],[784,160],[1047,260]].forEach(([f,d]) =>
        setTimeout(() => tone({ freq:f, type:"sine", attack:0.02, sustain:0.2, release:0.5, gain:0.22 }), d)
      );
    },
    // Boss phase 2 — ominous low rumble + dissonant hit
    bossPhase2: () => {
      tone({ freq:55, type:"sawtooth", attack:0.1, sustain:0.6, release:0.8, gain:0.4, filterFreq:150 });
      tone({ freq:73, type:"sawtooth", attack:0.1, sustain:0.5, release:0.8, gain:0.3, filterFreq:150, detune:-12 });
      setTimeout(() => noiseBurst({ duration:0.3, gain:0.4, filterFreq:300 }), 400);
    },
    // Node unlock — bright ascending chime
    nodeUnlock: () => {
      [[880,0],[1100,70],[1320,140],[1760,220]].forEach(([f,d]) =>
        setTimeout(() => tone({ freq:f, type:"sine", attack:0.01, sustain:0.08, release:0.3, gain:0.18 }), d)
      );
    },
    // UI tap — soft click, not jarring
    uiTap: () => {
      noiseBurst({ duration:0.03, gain:0.15, filterFreq:2000, attack:0.001 });
    },
    // Dungeon clear — triumphant fanfare
    dungeonClear: () => {
      [[523,0],[659,90],[784,180],[1047,280],[1319,400]].forEach(([f,d]) =>
        setTimeout(() => tone({ freq:f, type:"sine", attack:0.02, sustain:0.18, release:0.35, gain:0.25 }), d)
      );
    },
    // Purchase — satisfying coin-clink feel
    purchase: () => {
      tone({ freq:1200, type:"sine", attack:0.005, sustain:0.04, release:0.15, gain:0.2 });
      setTimeout(() => tone({ freq:1500, type:"sine", attack:0.005, sustain:0.03, release:0.12, gain:0.15 }), 60);
    },
    // Bleed tick — low pulse
    bleed: () => tone({ freq:160, type:"sine", attack:0.01, sustain:0.04, release:0.12, gain:0.18 }),
    // Stun — jarring dissonance
    stun: () => {
      tone({ freq:400, type:"sawtooth", attack:0.005, sustain:0.03, release:0.15, gain:0.25, filterFreq:600 });
      tone({ freq:415, type:"sawtooth", attack:0.005, sustain:0.03, release:0.15, gain:0.2,  filterFreq:600 });
    },
    startAmbient, stopAmbient,
  };

  return { init, setMuted, isMuted, ...sounds };
})();

// ============================================================
// HAPTICS
// ============================================================

const Haptics = {
  light:   () => { try { navigator.vibrate && navigator.vibrate(8);  } catch(e){} },
  medium:  () => { try { navigator.vibrate && navigator.vibrate(20); } catch(e){} },
  hit:     () => { try { navigator.vibrate && navigator.vibrate(25); } catch(e){} },
  hurt:    () => { try { navigator.vibrate && navigator.vibrate([30,10,30]); } catch(e){} },
  death:   () => { try { navigator.vibrate && navigator.vibrate([80,40,80,40,160]); } catch(e){} },
  victory: () => { try { navigator.vibrate && navigator.vibrate([40,20,40,20,80]); } catch(e){} },
  unlock:  () => { try { navigator.vibrate && navigator.vibrate([15,10,30]); } catch(e){} },
};

const WORLD_TREE_NODES = [
  // ── TRUNK ──
  { id:"hardened_body",    name:"Hardened Body",    icon:"🪨", branch:"trunk",   cost:20,  requires:null,                 description:"+5 max HP on every run." },
  { id:"sharp_eye",        name:"Sharp Eye",        icon:"👁️", branch:"trunk",   cost:25,  requires:"hardened_body",      description:"+1 attack on every run." },
  { id:"veteran_pack",     name:"Veteran's Pack",   icon:"🎒", branch:"trunk",   cost:30,  requires:"sharp_eye",          description:"+10 max HP on every run." },
  { id:"steady_hand",      name:"Steady Hand",      icon:"🤝", branch:"trunk",   cost:30,  requires:"veteran_pack",       description:"+1 defence on every run." },
  { id:"path_memorised",   name:"Path Memorised",   icon:"🧭", branch:"trunk",   cost:35,  requires:"steady_hand",        description:"Event rooms appear more often." },
  { id:"ancient_map",      name:"Ancient Map",      icon:"🗺️", branch:"trunk",   cost:50,  requires:"path_memorised",     description:"Merchant rooms appear more often." },
  { id:"survivors_will",   name:"Survivor's Will",  icon:"💪", branch:"trunk",   cost:45,  requires:"ancient_map",        description:"+3 max HP per dungeon cleared this run." },
  { id:"dungeon_lore",     name:"Dungeon Lore",     icon:"📖", branch:"trunk",   cost:80,  requires:"survivors_will",     description:"See each enemy's next action in combat." },
  // ── NATURE BRANCH ──
  { id:"wild_roots",       name:"Wild Roots",       icon:"🌱", branch:"nature",  cost:40,  requires:"veteran_pack",       description:"Rest rooms heal an extra 5% HP." },
  { id:"wild_growth",      name:"Wild Growth",      icon:"🌿", branch:"nature",  cost:60,  requires:"wild_roots",         description:"Rest rooms heal an extra 10% HP." },
  { id:"herbalist",        name:"Herbalist",        icon:"🌾", branch:"nature",  cost:60,  requires:"wild_roots",         description:"Merchant healing draught restores 50% HP." },
  { id:"symbiosis",        name:"Symbiosis",        icon:"🤝", branch:"nature",  cost:70,  requires:"herbalist",          description:"All healing effects restore 5% more HP." },
  { id:"forager",          name:"Forager",          icon:"🍄", branch:"nature",  cost:80,  requires:"wild_growth",        description:"Blood Ritual base HP cost drops to 15%." },
  { id:"resilience",       name:"Resilience",       icon:"🛡️", branch:"nature",  cost:80,  requires:"symbiosis",          description:"Start each run with +2 defence." },
  { id:"bloom",            name:"Bloom",            icon:"🌸", branch:"nature",  cost:90,  requires:"forager",            description:"Rest heal also restores 1 random ability charge." },
  { id:"natures_gift",     name:"Nature's Gift",    icon:"💚", branch:"nature",  cost:100, requires:"bloom",              description:"Restore 5 HP after every combat victory." },
  { id:"druid_unlock",     name:"Druid",            icon:"🌳", branch:"nature",  cost:120, requires:"natures_gift",       description:"Unlock the Druid class.", unlocks:"druid" },
  // ── DARK ARTS BRANCH ──
  { id:"blood_hunger",     name:"Blood Hunger",     icon:"🩸", branch:"dark",    cost:40,  requires:"veteran_pack",       description:"+1 attack on every run." },
  { id:"deaths_bargain",   name:"Death's Bargain",  icon:"💀", branch:"dark",    cost:60,  requires:"blood_hunger",       description:"Start each run with +3 ATK and +1 DEF." },
  { id:"grave_robber",     name:"Grave Robber",     icon:"💰", branch:"dark",    cost:60,  requires:"blood_hunger",       description:"Enemies drop +2 gold." },
  { id:"bone_armour",      name:"Bone Armour",      icon:"🦴", branch:"dark",    cost:70,  requires:"grave_robber",       description:"Take 2 less damage from every hit." },
  { id:"soul_harvest",     name:"Soul Harvest",     icon:"👻", branch:"dark",    cost:80,  requires:"deaths_bargain",     description:"20% chance to restore 5 HP on kill." },
  { id:"dark_pact",        name:"Dark Pact",        icon:"📜", branch:"dark",    cost:80,  requires:"bone_armour",        description:"Start each run with 20 bonus XP earned." },
  { id:"dark_ritual",      name:"Dark Ritual",      icon:"🕯️", branch:"dark",    cost:90,  requires:"dark_pact",          description:"Once per run, convert 20 HP into 15 XP." },
  { id:"undying_will",     name:"Undying Will",     icon:"⚡", branch:"dark",    cost:100, requires:"soul_harvest",       description:"Grit triggers twice per combat for all classes." },
  { id:"necro_unlock",     name:"Blood Knight",     icon:"🩸", branch:"dark",    cost:120, requires:"undying_will",       description:"Unlock the Blood Knight class.", unlocks:"blood_knight" },
  // ── LEGACY BRANCH (forks from sharp_eye) ──
  { id:"battle_tested",    name:"Battle Tested",    icon:"⚔️", branch:"legacy",  cost:40,  requires:"sharp_eye",          description:"Start each run with Frenzy active (2 turns, +6 ATK)." },
  { id:"inherited_skill",  name:"Inherited Skill",  icon:"🎓", branch:"legacy",  cost:70,  requires:"battle_tested",      description:"Start each run with 1 random run tree node." },
  { id:"chosen_path",      name:"Chosen Path",      icon:"🌟", branch:"legacy",  cost:110, requires:"inherited_skill",    description:"Choose 1 from 3 run tree nodes before each run starts." },
  // ── COMBAT MASTERY BRANCH (forks from steady_hand) ──
  { id:"weapon_training",  name:"Weapon Training",  icon:"⚔️", branch:"combat",  cost:40,  requires:"steady_hand",        description:"+2 attack on every run." },
  { id:"thick_skin",       name:"Thick Skin",       icon:"🧱", branch:"combat",  cost:40,  requires:"weapon_training",    description:"+2 defence on every run." },
  { id:"killing_instinct", name:"Killing Instinct", icon:"🎯", branch:"combat",  cost:60,  requires:"weapon_training",    description:"First attack each combat deals +8 bonus damage." },
  { id:"battle_momentum",  name:"Battle Momentum",  icon:"💥", branch:"combat",  cost:70,  requires:"thick_skin",         description:"Win a combat in ≤3 turns → +3 ATK for next combat." },
  { id:"war_veteran",      name:"War Veteran",      icon:"🎖️", branch:"combat",  cost:90,  requires:"killing_instinct",   description:"Start each run with +15 max HP and +2 ATK." },
  { id:"iron_discipline",  name:"Iron Discipline",  icon:"🔩", branch:"combat",  cost:100, requires:"battle_momentum",    description:"Ability charges also reset after resting." },
  { id:"warlords_presence",name:"Warlord's Presence",icon:"👑",branch:"combat",  cost:120, requires:"war_veteran",        description:"Finish-move HP thresholds raised to 60%." },
  // ── ANCIENT LORE BRANCH (forks from ancient_map) ──
  { id:"cartographer",     name:"Cartographer",     icon:"🗺️", branch:"lore",    cost:50,  requires:"ancient_map",        description:"Shrine rooms appear more often." },
  { id:"arcane_attunement",name:"Arcane Attunement",icon:"✨", branch:"lore",    cost:70,  requires:"cartographer",       description:"+2 attack and +1 defence on every run." },
  { id:"forbidden_knowledge",name:"Forbidden Knowledge",icon:"📚",branch:"lore", cost:80,  requires:"arcane_attunement",  description:"Blood Ritual can be performed twice per campfire." },
  { id:"leyline_tap",      name:"Leyline Tap",      icon:"🌀", branch:"lore",    cost:90,  requires:"forbidden_knowledge",description:"Gain 5 XP per combat victory." },
  { id:"void_sight",       name:"Void Sight",       icon:"👁️", branch:"lore",    cost:100, requires:"leyline_tap",        description:"See dungeon boss stats before entering." },
  { id:"transcendence",    name:"Transcendence",    icon:"💫", branch:"lore",    cost:150, requires:"void_sight",         description:"Once per run, survive death at 1 HP (all classes)." },
];

// ============================================================
// CLASS DATA
// ============================================================

const CLASSES = {
  warrior:{
    name:"Warrior", icon:"⚔️", color:"#C8A96E",
    maxHp:110, attack:12, defense:5,
    description:"Stalwart and relentless. Built to outlast.",
    basicAttack:{ name:"Slash", damage:[10,16] },
    abilities:[
      { id:"shield_bash", name:"Shield Bash", icon:"🛡️", description:"Damage + stun for 1 turn.",      charges:3, maxCharges:3, damage:[12,18] },
      { id:"battle_cry",  name:"Battle Cry",  icon:"📯", description:"+8 defence for 2 turns.",         charges:2, maxCharges:2, buffAmount:8, buffTurns:2 },
      { id:"execute",     name:"Execute",     icon:"💀", description:"Massive damage below 40% HP.",    charges:2, maxCharges:2, damage:[34,46] },
    ],
    passive:{ name:"Grit", icon:"🩸", description:"Once per combat, survive a lethal blow on 1 HP." },
  },
  rogue:{
    name:"Rogue", icon:"🗡️", color:"#9E7FD4",
    maxHp:85, attack:14, defense:2,
    description:"Fast and lethal. Bleeds enemies dry.",
    basicAttack:{ name:"Shiv", damage:[9,14], bleedDmg:6, bleedTurns:3 },
    abilities:[
      { id:"backstab",   name:"Backstab",   icon:"🗡️", description:"High damage. Crit x2.5 if Bleeding.", charges:3, maxCharges:3, damage:[18,26] },
      { id:"smoke_bomb", name:"Smoke Bomb", icon:"💨", description:"Next enemy attack misses.",           charges:2, maxCharges:2 },
      { id:"expose",     name:"Expose",     icon:"🎯", description:"Strip enemy defence for 2 turns.",   charges:2, maxCharges:2 },
    ],
    passive:{ name:"Predator", icon:"🐾", description:"Crits restore 1 Backstab charge." },
  },
  mage:{
    name:"Mage", icon:"🔮", color:"#6EA8C8",
    maxHp:75, attack:16, defense:1,
    description:"Devastating power. Dangerously fragile.",
    basicAttack:{ name:"Arcane Bolt", damage:[11,18] },
    abilities:[
      { id:"fireball",     name:"Fireball",     icon:"🔥", description:"High damage to ALL enemies.",            charges:2, maxCharges:2, damage:[26,38] },
      { id:"frost_nova",   name:"Frost Nova",   icon:"❄️", description:"Freeze + expose target.",               charges:2, maxCharges:2, damage:[15,22] },
      { id:"arcane_surge", name:"Arcane Surge", icon:"⚡", description:"Next ability FREE and double damage.",   charges:2, maxCharges:2 },
    ],
    passive:{ name:"Spellweave", icon:"✨", description:"Every 2 basic attacks restores 1 ability charge." },
  },
  druid:{
    name:"Druid", icon:"🌿", color:"#4caf6e",
    maxHp:95, attack:13, defense:4,
    description:"Nature's guardian. Controls the battlefield and outlasts foes.",
    basicAttack:{ name:"Thorn Lash", damage:[8,13], bleedDmg:5, bleedTurns:2 },
    abilities:[
      { id:"spore_cloud", name:"Spore Cloud",  icon:"🍄", description:"Damages all enemies and applies Bleed.", charges:2, maxCharges:2, damage:[12,18] },
      { id:"entangle",    name:"Entangle",     icon:"🌱", description:"Stun + expose target for 2 turns.",      charges:2, maxCharges:2 },
      { id:"barkskin",    name:"Barkskin",     icon:"🪵", description:"+10 defence for 3 turns. Reflect 2 dmg.",charges:1, maxCharges:1, buffAmount:10, buffTurns:3 },
    ],
    passive:{ name:"Overgrowth", icon:"🌳", description:"Restore 3 HP at the start of each room." },
  },
  blood_knight:{
    name:"Blood Knight", icon:"🩸", color:"#e05c5c",
    maxHp:100, attack:17, defense:3,
    description:"Trades life for power. The line between victory and death is razor thin.",
    basicAttack:{ name:"Bloodstrike", damage:[10,15], healOnHit:4 },
    abilities:[
      { id:"crimson_slash",  name:"Crimson Slash",  icon:"⚔️", description:"High damage. Costs 8 HP to use.",           charges:3, maxCharges:3, damage:[24,34], hpCost:8 },
      { id:"blood_surge",    name:"Blood Surge",    icon:"🩸", description:"Sacrifice 15% HP — next ability deals x2.",  charges:2, maxCharges:2 },
      { id:"deaths_embrace", name:"Death's Embrace",icon:"💀", description:"Damage = 30% of your missing HP.",           charges:2, maxCharges:2 },
    ],
    passive:{ name:"Vampiric", icon:"🧛", description:"Killing blows restore 12 HP." },
  },
};

// ============================================================
// RUN TREE
// ============================================================

// ============================================================
// DUNGEONS
// ============================================================

const DUNGEONS = [
  {
    id:"crypts", name:"The Forgotten Crypts", icon:"💀", color:"#9E7FD4",
    description:"Ancient burial halls where the dead refuse to rest.",
    rooms:8, enemyPool:["goblin","skeleton","crypt_shade","bone_archer"],
    boss:{
      id:"crypt_warden", name:"Crypt Warden", icon:"☠️",
      hp:120, maxHp:120, attack:[14,20], defense:4, xp:80, gold:[15,25],
      actions:["attack","attack","special","attack","attack","special"],
      special:"raise_dead", specialDesc:"Raises a fallen skeleton as a Revenant.",
      phase2Threshold:0.5, phase2Desc:"Phase 2: Attacks twice per turn!",
      phase2Actions:["attack","attack","attack","special","attack","attack"],
    },
  },
  {
    id:"warrens", name:"The Goblin Warrens", icon:"👺", color:"#C8A96E",
    description:"A labyrinth swarming with cunning goblins and their warchief.",
    rooms:10, enemyPool:["goblin","goblin_brute","orc","trap_setter"],
    boss:{
      id:"goblin_warchief", name:"Goblin Warchief", icon:"👑",
      hp:160, maxHp:160, attack:[12,18], defense:3, xp:100, gold:[20,35],
      actions:["attack","attack","attack","special","attack"],
      special:"reinforce", specialDesc:"Calls a goblin to fight!",
      phase2Threshold:0.5, phase2Desc:"Phase 2: Enraged — +50% damage!",
      phase2Actions:["attack","attack","special","attack"],
      phase2DamageBonus:0.5,
    },
  },
  {
    id:"ashwood", name:"The Ashwood Forest", icon:"🌲", color:"#4caf6e",
    description:"A corrupted forest where nature has turned predator.",
    rooms:12, enemyPool:["forest_troll","vine_horror","corrupted_wolf","dark_mage"],
    boss:{
      id:"treant", name:"Corrupted Treant", icon:"🌳",
      hp:220, maxHp:220, attack:[16,22], defense:6, xp:130, gold:[25,40],
      actions:["attack","bleed_spore","attack","attack","bleed_spore"],
      special:"bleed_spore", specialDesc:"Releases spores — you Bleed.",
      phase2Threshold:0.5, phase2Desc:"Phase 2: Bark hardens — 30% damage reduction!",
      phase2Actions:["attack","bleed_spore","attack","bleed_spore"],
      phase2DamageReduction:0.3,
    },
  },
  {
    id:"fortress", name:"The Iron Fortress", icon:"🏰", color:"#6EA8C8",
    description:"A stronghold manned by relentless soldiers of the old empire.",
    rooms:14, enemyPool:["iron_guard","war_knight","siege_mage","orc"],
    boss:{
      id:"iron_commander", name:"Iron Commander", icon:"⚔️",
      hp:280, maxHp:280, attack:[18,26], defense:8, xp:160, gold:[30,50],
      actions:["attack","brace_boss","attack","attack","brace_boss","attack"],
      special:"brace_boss", specialDesc:"Braces — takes half damage this turn.",
      phase2Threshold:0.5, phase2Desc:"Phase 2: Strips your defence and counterattacks!",
      phase2Actions:["attack","attack","strip_defence","attack","attack"],
    },
  },
  {
    id:"abyss", name:"The Abyssal Depths", icon:"🌀", color:"#e05c5c",
    description:"The deepest dark. Something ancient stirs below.",
    rooms:16, enemyPool:["void_spawn","abyssal_hound","void_cultist","void_spawn"],
    boss:{
      id:"void_sovereign", name:"The Void Sovereign", icon:"👁️",
      hp:350, maxHp:350, attack:[22,32], defense:6, xp:200, gold:[40,70],
      actions:["attack","silence","attack","attack","silence","magic_bolt"],
      special:"silence", specialDesc:"Silences a random ability — unusable next turn.",
      phase2Threshold:0.5, phase2Desc:"Phase 2: Reality fractures — double damage!",
      phase2Actions:["magic_bolt","silence","magic_bolt","attack","silence"],
      phase2DamageBonus:1.0,
    },
  },
];

// ============================================================
// RUN TREE — POOL (random 3 drawn per dungeon completion)
// ============================================================

const RUN_TREE_POOL = {
  warrior:[
    { id:"bloodlust",   name:"Bloodlust",   icon:"🩸", description:"Killing an enemy restores 8 HP.",               tag:"SUSTAIN" },
    { id:"iron_will",   name:"Iron Will",   icon:"🪨", description:"+15 max HP.",                                   tag:"DEFENCE" },
    { id:"bash_master", name:"Bash Master", icon:"🛡️", description:"Shield Bash gains +1 charge.",                tag:"ABILITY" },
    { id:"unstoppable", name:"Unstoppable", icon:"⚔️", description:"Execute usable below 50% enemy HP.",           tag:"OFFENCE" },
    { id:"fortress",    name:"Fortress",    icon:"🏰", description:"+4 permanent defence.",                        tag:"DEFENCE" },
    { id:"warlord",     name:"Warlord",     icon:"📯", description:"Battle Cry also grants +4 attack.",            tag:"ABILITY" },
    { id:"berserker",   name:"Berserker",   icon:"🔥", description:"Below 30% HP, gain +10 attack.",               tag:"OFFENCE" },
    { id:"juggernaut",  name:"Juggernaut",  icon:"💪", description:"+20 max HP and +3 defence.",                   tag:"DEFENCE" },
    { id:"executioner", name:"Executioner", icon:"💀", description:"Execute deals +25 bonus damage.",              tag:"ABILITY" },
    { id:"retaliation", name:"Retaliation", icon:"⚡", description:"Taking damage boosts your next attack by 6.",  tag:"OFFENCE" },
    { id:"last_stand",  name:"Last Stand",  icon:"🛡️", description:"Below 20% HP, abilities cost no charges.",    tag:"PASSIVE" },
    { id:"relentless",  name:"Relentless",  icon:"⚔️", description:"Each kill restores 1 charge to all abilities.",tag:"PASSIVE" },
    { id:"titan",       name:"Titan",       icon:"💎", description:"Blood Ritual grants +5 max HP instead of costing HP.", tag:"SUSTAIN" },
    { id:"shield_wall", name:"Shield Wall", icon:"🛡️", description:"Battle Cry reflects 3 damage to attackers.",  tag:"ABILITY" },
  ],
  rogue:[
    { id:"serrated",      name:"Serrated",      icon:"🩸", description:"Bleed deals +2 damage per tick.",           tag:"OFFENCE" },
    { id:"shadow_step",   name:"Shadow Step",   icon:"💨", description:"Smoke Bomb gains +1 charge.",               tag:"ABILITY" },
    { id:"quick_hands",   name:"Quick Hands",   icon:"🗡️", description:"Backstab gains +1 charge.",                tag:"ABILITY" },
    { id:"hemorrhage",    name:"Hemorrhage",    icon:"🩸", description:"Bleed lasts +1 additional turn.",           tag:"OFFENCE" },
    { id:"assassin",      name:"Assassin",      icon:"☠️", description:"Backstab crit multiplier to x2.5.",         tag:"OFFENCE" },
    { id:"knife_fan",     name:"Knife Fan",     icon:"🎯", description:"Shiv hits all enemies.",                    tag:"ABILITY" },
    { id:"death_mark",    name:"Death Mark",    icon:"🎯", description:"Exposed enemies take 25% more damage.",     tag:"OFFENCE" },
    { id:"ghost",         name:"Ghost",         icon:"👻", description:"Smoke Bomb gains +2 charges.",              tag:"ABILITY" },
    { id:"killing_spree", name:"Killing Spree", icon:"⚡", description:"Each kill restores 1 Backstab charge.",     tag:"PASSIVE" },
    { id:"venomous",      name:"Venomous",      icon:"☠️", description:"Bleed stacks — reapplying adds damage.",    tag:"OFFENCE" },
    { id:"shadowstrike",  name:"Shadowstrike",  icon:"🌑", description:"First attack each room is a guaranteed crit.",tag:"PASSIVE" },
    { id:"fleet_foot",    name:"Fleet Foot",    icon:"💨", description:"Smoke Bomb also restores 8 HP.",            tag:"SUSTAIN" },
    { id:"cutthroat",     name:"Cutthroat",     icon:"🗡️", description:"Basic attack deals +50% to Exposed targets.",tag:"OFFENCE" },
    { id:"opportunist",   name:"Opportunist",   icon:"🎯", description:"Expose also deals 12 damage.",              tag:"ABILITY" },
  ],
  druid:[
    { id:"deep_roots",       name:"Deep Roots",       icon:"🌱", description:"Entangle stuns for 2 turns instead of 1.",       tag:"ABILITY" },
    { id:"thorned_skin",     name:"Thorned Skin",     icon:"🌵", description:"Barkskin reflects 5 damage instead of 2.",        tag:"ABILITY" },
    { id:"wild_hunger",      name:"Wild Hunger",      icon:"🩸", description:"Killing blows restore 10 HP.",                    tag:"SUSTAIN" },
    { id:"regrowth",         name:"Regrowth",         icon:"🌿", description:"Overgrowth heals 6 HP per room instead of 3.",    tag:"SUSTAIN" },
    { id:"verdant_growth",   name:"Verdant Growth",   icon:"💚", description:"+15 max HP.",                                     tag:"DEFENCE" },
    { id:"ironbark",         name:"Ironbark",         icon:"🪵", description:"+4 permanent defence.",                           tag:"DEFENCE" },
    { id:"toxic_spores",     name:"Toxic Spores",     icon:"🍄", description:"Spore Cloud Bleed deals +3 damage per tick.",     tag:"OFFENCE" },
    { id:"spreading_spores", name:"Spreading Spores", icon:"🌫️", description:"Spore Cloud gains +1 charge per room.",          tag:"ABILITY" },
    { id:"thorn_shield",     name:"Thorn Shield",     icon:"🛡️", description:"Barkskin gains +1 charge per room.",             tag:"ABILITY" },
    { id:"ancient_bond",     name:"Ancient Bond",     icon:"🌳", description:"Thorn Lash Bleed lasts 1 extra turn.",            tag:"OFFENCE" },
    { id:"overgrowth_surge", name:"Overgrowth Surge", icon:"⚡", description:"Room start heal also removes a player status effect.", tag:"PASSIVE" },
    { id:"natural_armour",   name:"Natural Armour",   icon:"🪨", description:"Exposed enemies take 20% more damage.",           tag:"OFFENCE" },
    { id:"predators_mark",   name:"Predator's Mark",  icon:"🎯", description:"Bleeding enemies take +15% more damage.",         tag:"OFFENCE" },
    { id:"elder_bark",       name:"Elder Bark",       icon:"🌲", description:"Barkskin defence bonus increases to +15.",         tag:"ABILITY" },
  ],
  blood_knight:[
    { id:"iron_constitution",name:"Iron Constitution",icon:"🪨", description:"+20 max HP.",                                     tag:"DEFENCE" },
    { id:"battle_hardened",  name:"Battle Hardened",  icon:"🛡️", description:"+3 permanent defence.",                          tag:"DEFENCE" },
    { id:"bloodthirst",      name:"Bloodthirst",      icon:"🩸", description:"Bloodstrike heals 7 HP instead of 4.",            tag:"SUSTAIN" },
    { id:"open_wound",       name:"Open Wound",       icon:"⚔️", description:"Crimson Slash also applies Bleed.",               tag:"OFFENCE" },
    { id:"desperate_power",  name:"Desperate Power",  icon:"🔥", description:"Below 30% HP, +12 attack.",                      tag:"OFFENCE" },
    { id:"sacrifice",        name:"Sacrifice",        icon:"🩸", description:"Blood Surge costs only 10% HP instead of 15%.",   tag:"ABILITY" },
    { id:"death_dealer",     name:"Death Dealer",     icon:"💀", description:"Death's Embrace scales off 40% missing HP.",      tag:"OFFENCE" },
    { id:"last_rites",       name:"Last Rites",       icon:"✨", description:"Killing with Death's Embrace restores 20 HP.",    tag:"SUSTAIN" },
    { id:"crimson_fury",     name:"Crimson Fury",     icon:"⚔️", description:"Crimson Slash gains +1 charge per room.",         tag:"ABILITY" },
    { id:"blood_pact",       name:"Blood Pact",       icon:"📜", description:"Every kill restores 1 charge to all abilities.",  tag:"PASSIVE" },
    { id:"void_touched",     name:"Void Touched",     icon:"🌑", description:"Crimson Slash HP cost reduced to 4.",             tag:"ABILITY" },
    { id:"haemorrhage",      name:"Haemorrhage",      icon:"🩸", description:"Blood Surge empowers 2 abilities instead of 1.",  tag:"ABILITY" },
    { id:"eternal_hunger",   name:"Eternal Hunger",   icon:"🧛", description:"Vampiric kills restore 20 HP instead of 12.",     tag:"SUSTAIN" },
    { id:"pain_threshold",   name:"Pain Threshold",   icon:"⚡", description:"Taking 15+ damage in one hit grants +4 ATK next turn.", tag:"OFFENCE" },
  ],
  mage:[
    { id:"overload",       name:"Overload",       icon:"🔥", description:"Fireball deals +8 bonus damage.",         tag:"OFFENCE" },
    { id:"glacial",        name:"Glacial",        icon:"❄️", description:"Frost Nova freeze lasts 2 turns.",        tag:"ABILITY" },
    { id:"attunement",     name:"Attunement",     icon:"⚡", description:"Arcane Surge gains +1 charge.",           tag:"ABILITY" },
    { id:"chain_lightning",name:"Chain Lightning",icon:"⚡", description:"Arcane Bolt hits all at 50% damage.",     tag:"OFFENCE" },
    { id:"permafrost",     name:"Permafrost",     icon:"❄️", description:"Frozen enemies take 30% more damage.",    tag:"OFFENCE" },
    { id:"mana_torrent",   name:"Mana Torrent",   icon:"✨", description:"Spellweave triggers every hit.",          tag:"PASSIVE" },
    { id:"inferno",        name:"Inferno",        icon:"🔥", description:"Fireball applies Bleed to all targets.",  tag:"OFFENCE" },
    { id:"absolute_zero",  name:"Absolute Zero",  icon:"❄️", description:"Frost Nova kills instantly below 20% HP.",tag:"OFFENCE" },
    { id:"arcane_mastery", name:"Arcane Mastery", icon:"🔮", description:"Arcane Surge always active, free.",       tag:"PASSIVE" },
    { id:"arcane_echo",    name:"Arcane Echo",    icon:"✨", description:"10% chance any ability fires twice.",      tag:"PASSIVE" },
    { id:"shatter",        name:"Shatter",        icon:"❄️", description:"Frozen enemies take double damage from next hit.", tag:"OFFENCE" },
    { id:"volatile",       name:"Volatile",       icon:"🔥", description:"Fireball leaves burning — extra Bleed tick on all.", tag:"OFFENCE" },
    { id:"leyline",        name:"Leyline",        icon:"🌀", description:"Every 5th turn, restore 1 charge to all abilities.", tag:"PASSIVE" },
    { id:"null_field",     name:"Null Field",     icon:"🔮", description:"Enemies cannot regenerate or heal.",      tag:"PASSIVE" },
  ],
};

function drawRunTreeOptions(classKey, seenNodeIds) {
  const pool = RUN_TREE_POOL[classKey] || [];
  const available = pool.filter(n => !seenNodeIds.includes(n.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

// ============================================================
// ENEMIES
// ============================================================

// ============================================================
// ENEMIES
// ============================================================

const ENEMIES = [
  { id:"goblin",    name:"Goblin",    icon:"👺", hp:30, maxHp:30, attack:[7,12],  defense:1, xp:8,  gold:[2,4],  actions:["attack","attack","attack","cower"] },
  { id:"skeleton",  name:"Skeleton",  icon:"🦴", hp:40, maxHp:40, attack:[7,12],  defense:3, xp:12, gold:[3,6],  actions:["attack","attack","heavy_attack"] },
  { id:"orc",       name:"Orc",       icon:"👹", hp:58, maxHp:58, attack:[10,16], defense:4, xp:18, gold:[5,8],  actions:["attack","heavy_attack","attack","brace"] },
  { id:"dark_mage", name:"Dark Mage", icon:"🧙", hp:36, maxHp:36, attack:[12,18], defense:1, xp:20, gold:[6,10], actions:["attack","magic_bolt","magic_bolt","attack"] },
];

// ============================================================
// SCALING
// ============================================================

// Gradual curve: every 2 rooms, enemies get ~6% tougher
// Room 1 = 1.0x, Room 10 = 1.27x, Room 20 = 1.58x, Room 40 = 2.2x
function enemyScale(roomNumber, difficulty="normal") {
  const rate = difficulty === "hard" ? 0.045 : 0.03;
  return 1 + (roomNumber - 1) * rate;
}
function attackScale(roomNumber, difficulty="normal") {
  const rate = difficulty === "hard" ? 0.065 : 0.05;
  return 1 + (roomNumber - 1) * rate;
}

function scaleEnemy(enemy, roomNumber, difficulty="normal") {
  const s = enemyScale(roomNumber, difficulty);
  const atkS = attackScale(roomNumber, difficulty);
  return {
    ...enemy,
    hp:    Math.round(enemy.hp    * s),
    maxHp: Math.round(enemy.maxHp * s),
    attack: [Math.round(enemy.attack[0] * atkS), Math.round(enemy.attack[1] * atkS)],
    defense: Math.max(enemy.defense, Math.floor(enemy.defense + (s - 1) * 2)),
    xp: Math.round(enemy.xp * s),
    gold: [enemy.gold[0], Math.round(enemy.gold[1] * Math.min(s, 2))],
  };
}

// Blood Ritual cost scales with number of rituals performed this run
function ritualCost(maxHp, ritualCount, basePct) {
  const pct = basePct + ritualCount * 0.10;
  return Math.floor(maxHp * Math.min(pct, 0.60));
}

// ============================================================
// ROOM LOGIC
// ============================================================

// combatsSinceSpecial tracks how many combat rooms since last rest/merchant/shrine
const EVENTS = [
  {
    id:"wounded_soldier",
    title:"The Wounded Soldier",
    icon:"🪖",
    description:"A dying soldier from a previous expedition lies against the wall, clutching his chest.",
    choiceA:{ label:"Give your supplies — save him", desc:"Lose 10 HP. Gain +2 DEF permanently.", hpCost:10, defBonus:2 },
    choiceB:{ label:"Take his gold and move on", desc:"Gain 12 gold.", gold:12 },
  },
  {
    id:"whispering_wall",
    title:"The Whispering Wall",
    icon:"🪨",
    description:"Ancient runes pulse with cold light. A voice offers knowledge in exchange for pain.",
    choiceA:{ label:"Touch the runes", desc:"Take 12 damage. Gain a free run tree node.", hpCost:12, freeNode:true },
    choiceB:{ label:"Walk away", desc:"Nothing gained, nothing lost.", skip:true },
  },
  {
    id:"forgotten_cache",
    title:"The Forgotten Cache",
    icon:"📦",
    description:"A hidden stash from a previous adventurer who never made it out. Their loss is your gain.",
    choiceA:{ label:"Take the cache", desc:"Gain 20 gold.", gold:20, auto:true },
    choiceB:null,
  },
  {
    id:"blood_mirror",
    title:"The Blood Mirror",
    icon:"🪞",
    description:"A mirror that shows not your reflection but your potential. It demands a price.",
    choiceA:{ label:"Smash it", desc:"Take 15 damage. Gain +3 ATK permanently.", hpCost:15, atkBonus:3 },
    choiceB:{ label:"Leave it", desc:"Nothing gained.", skip:true },
  },
  {
    id:"starving_beast",
    title:"The Starving Beast",
    icon:"🐺",
    description:"A wounded creature blocks the path — dangerous but clearly suffering.",
    choiceA:{ label:"Feed it (15 gold)", desc:"Gain Beast's Favour: +4 ATK for 3 combats.", gold:-15, tempAtk:4, tempAtkDuration:3 },
    choiceB:{ label:"Drive it off", desc:"Take 10 damage. Gain 8 gold.", hpCost:10, gold:8 },
  },
  {
    id:"alchemist_remnants",
    title:"The Alchemist's Remnants",
    icon:"⚗️",
    description:"Scattered potions from a dead alchemist. Their labels have faded beyond reading.",
    choiceA:{ label:"Drink the unknown concoction", desc:"60% chance: heal 25 HP. 40% chance: lose 15 HP, gain +2 ATK.", gamble:true },
    choiceB:{ label:"Leave them", desc:"Nothing gained.", skip:true },
  },
  {
    id:"challengers_mark",
    title:"The Challenger's Mark",
    icon:"⚔️",
    description:"A duelling circle etched into the floor, still warm with residual energy.",
    choiceA:{ label:"Step into the circle", desc:"Next combat has double enemies. Double gold and XP reward.", challengerMark:true },
    choiceB:{ label:"Step around it", desc:"Nothing gained.", skip:true },
  },
  {
    id:"seers_vision",
    title:"The Seer's Vision",
    icon:"🔮",
    description:"A blind seer sits cross-legged, offering to read the path ahead.",
    choiceA:{ label:"Pay 10 gold for a reading", desc:"See the next 3 room types.", gold:-10, seerReading:true },
    choiceB:{ label:"Decline", desc:"Nothing gained.", skip:true },
  },
  {
    id:"ancient_shrine",
    title:"The Ancient Shrine",
    icon:"🗿",
    description:"A forgotten shrine hums with residual power. The runes are worn but legible.",
    choiceA:{ label:"Make an offering (10 HP)", desc:"Restore all ability charges.", hpCost:10, rechargeAll:true },
    choiceB:{ label:"Pass by", desc:"Nothing gained.", skip:true },
  },
  {
    id:"executioners_axe",
    title:"The Executioner's Axe",
    icon:"🪓",
    description:"A massive axe buried in a stump. Too heavy to carry — but you could sharpen your blade on it.",
    choiceA:{ label:"Sharpen your weapon", desc:"+3 ATK permanently.", atkBonus:3 },
    choiceB:{ label:"Leave it", desc:"Nothing gained.", skip:true },
  },
  {
    id:"trapped_merchant",
    title:"The Trapped Merchant",
    icon:"🤝",
    description:"A merchant trapped under rubble. You could help — or take what's in their pack.",
    choiceA:{ label:"Help them free", desc:"Gain 25 gold and their gratitude.", gold:25 },
    choiceB:{ label:"Take their pack", desc:"Gain 40 gold. Lose 10 HP.", gold:40, hpCost:10 },
  },
  {
    id:"whispering_idol",
    title:"The Whispering Idol",
    icon:"🗽",
    description:"A small idol whispers promises of power. The price is paid in blood.",
    choiceA:{ label:"Listen to its offer", desc:"Lose 20 HP. Gain +4 ATK and +2 DEF permanently.", hpCost:20, atkBonus:4, defBonus:2 },
    choiceB:{ label:"Smash it", desc:"Take 5 damage. Gain 15 gold.", hpCost:5, gold:15 },
  },
  {
    id:"dungeon_map",
    title:"The Dungeon Map",
    icon:"🗺️",
    description:"A partial map scratched into the wall by a previous adventurer.",
    choiceA:{ label:"Study it carefully", desc:"The next 3 rooms are revealed.", seerReading:true, auto:true },
    choiceB:null,
  },
];

// ============================================================
// ACHIEVEMENTS & STORE DATA
// ============================================================

const ACHIEVEMENTS = [
  // Survival
  { id:"first_blood",     name:"First Blood",           icon:"⚔️",  cat:"Survival",    desc:"Complete your first combat.",                title:"the Initiated",     xp:5  },
  { id:"survivor",        name:"Survivor",               icon:"🛡️",  cat:"Survival",    desc:"Reach room 10.",                             title:"the Tenacious",     xp:10 },
  { id:"deep_delver",     name:"Deep Delver",            icon:"🕳️",  cat:"Survival",    desc:"Reach room 25.",                             title:"the Descender",     xp:15 },
  { id:"unstoppable",     name:"Unstoppable",            icon:"🏰",  cat:"Survival",    desc:"Complete a full dungeon.",                   title:"the Dungeon-Cleared",xp:20 },
  { id:"legend",          name:"Legend",                 icon:"🏆",  cat:"Survival",    desc:"Clear all 5 dungeons in one run.",           title:"the Legendary",     xp:50 },
  { id:"iron_run",        name:"Iron Run",               icon:"🔩",  cat:"Survival",    desc:"Complete a dungeon using only basic attacks.",title:"the Ironclad",     xp:30 },
  // Combat
  { id:"executioner_ach", name:"Executioner",            icon:"💀",  cat:"Combat",      desc:"Land a killing blow with Execute.",          title:"the Executioner",   xp:10 },
  { id:"bleed_out",       name:"Bleed Out",              icon:"🩸",  cat:"Combat",      desc:"Kill an enemy purely from Bleed damage.",    title:"the Bloodletter",   xp:15 },
  { id:"perfect_room",    name:"Perfect Room",           icon:"✨",  cat:"Combat",      desc:"Win a combat without taking any damage.",    title:"the Untouched",     xp:15 },
  { id:"overkill",        name:"Overkill",               icon:"💥",  cat:"Combat",      desc:"Deal 100+ damage in a single hit.",          title:"the Devastating",   xp:20 },
  { id:"boss_slayer",     name:"Boss Slayer",            icon:"⚔️",  cat:"Combat",      desc:"Defeat your first boss.",                    title:"the Boss Killer",   xp:20 },
  { id:"void_conqueror",  name:"Void Conqueror",         icon:"👁️", cat:"Combat",      desc:"Defeat the Void Sovereign.",                 title:"the Void-Touched",  xp:40 },
  // Progression
  { id:"bloodied_hands",  name:"Bloodied Hands",         icon:"🖐️", cat:"Progression", desc:"Die 10 times total.",                        title:"the Persistent",    xp:10 },
  { id:"world_traveller", name:"World Traveller",        icon:"🗺️", cat:"Progression", desc:"Unlock 10 world tree nodes.",               title:"the Tree-Walker",   xp:15 },
  { id:"dark_arts_master",name:"Master of the Dark Arts",icon:"🩸",  cat:"Progression", desc:"Unlock the Blood Knight class.",             title:"the Blood-Sworn",   xp:25 },
  { id:"child_of_nature", name:"Child of Nature",        icon:"🌿",  cat:"Progression", desc:"Unlock the Druid class.",                   title:"the Forest-Bound",  xp:25 },
  { id:"polymath",        name:"Polymath",               icon:"🎭",  cat:"Progression", desc:"Complete a run with every class.",           title:"the Versatile",     xp:30 },
  { id:"legendary_build", name:"Legendary Build",        icon:"🌟",  cat:"Progression", desc:"Have 5 run tree nodes active at once.",      title:"the Architect",     xp:20 },
  // Secrets
  { id:"ritual_addict",   name:"Ritual Addict",          icon:"🕯️", cat:"Secrets",     desc:"Perform Blood Ritual 3 times in one run.",  title:"the Blood Ritualist",xp:15 },
  { id:"penny_pincher",   name:"Penny Pincher",          icon:"💰",  cat:"Secrets",     desc:"End a run with 100+ gold.",                  title:"the Miser",         xp:10 },
  { id:"glass_cannon",    name:"Glass Cannon",           icon:"💎",  cat:"Secrets",     desc:"Win a combat at 1 HP.",                      title:"the Reckless",      xp:15 },
  { id:"against_all_odds",name:"Against All Odds",       icon:"🎲",  cat:"Secrets",     desc:"Win a 3+ enemy combat using only basic attacks.",title:"the Unbowed",  xp:20 },
];

const STORE_CONSUMABLES = [
  { id:"sharpened_blade", name:"Sharpened Blade", icon:"⚔️", desc:"+5 ATK for the first dungeon.", cost:30, apply:(p)=>{p.attack+=5;p._bladeExpires=1;} },
  { id:"healing_herbs",   name:"Healing Herbs",   icon:"🌿", desc:"Start run with +20 HP.",       cost:25, apply:(p)=>{p.hp=Math.min(p.maxHp,p.hp+20);} },
  { id:"war_banner",      name:"War Banner",       icon:"🚩", desc:"Each dungeon starts with Frenzy (2t,+6ATK).",cost:40,apply:(p)=>{p.frenzyTurns=2;p.frenzyBonus=6;} },
  { id:"reinforced_armour",name:"Reinforced Armour",icon:"🛡️",desc:"+3 DEF for the first dungeon.",cost:30, apply:(p)=>{p.defense+=3;p._armourExpires=1;} },
  { id:"lucky_coin",      name:"Lucky Coin",       icon:"🪙", desc:"Next merchant offers 2 items.", cost:35, apply:(p)=>{p.luckyCoinActive=true;} },
  { id:"hunters_mark",    name:"Hunter's Mark",    icon:"🎯", desc:"Enemies drop +3 gold this run.",cost:20, apply:(p)=>{p.huntersMarkActive=true;} },
];

const STORE_PERMANENT = [
  { id:"cartographers_journal", name:"Cartographer's Journal", icon:"📔", desc:"See boss HP and abilities before entering a dungeon.", cost:80  },
  { id:"lucky_charm",           name:"Lucky Charm",             icon:"🍀", desc:"Shrine rooms appear +10% more often.",                cost:60  },
  { id:"warriors_crest",        name:"Warrior's Crest",        icon:"🏅", desc:"Start every run with +3 max HP permanently stacked.", cost:75  },
  { id:"merchants_favour",      name:"Merchant's Favour",      icon:"🤝", desc:"Merchant items cost 1 less gold (min 1).",            cost:90  },
];


function pickRandomEvent() {
  return EVENTS[Math.floor(Math.random()*EVENTS.length)];
}

function pickRoomType(lastType, worldTree, combatsSinceSpecial) {
  if (combatsSinceSpecial < 2) return "combat";
  const merchantBoost = (worldTree||[]).includes("ancient_map") ? 0.05 : 0;
  const r = Math.random();
  // Weights: combat 53%, rest 20%, merchant 10+boost%, shrine 7%, event 10%
  let type;
  if      (r < 0.53)                                type = "combat";
  else if (r < 0.53 + 0.20)                         type = "rest";
  else if (r < 0.53 + 0.20 + 0.10 + merchantBoost)  type = "merchant";
  else if (r < 0.53 + 0.20 + 0.10 + merchantBoost + 0.07) type = "shrine";
  else                                               type = "event";
  if (type !== "combat" && type === lastType) type = "combat";
  return type;
}

const COMBAT_CONFIGS = [
  ["goblin"],["goblin","goblin"],["skeleton"],
  ["goblin","skeleton"],["orc"],["skeleton","skeleton"],
  ["dark_mage"],["orc","goblin"],
];

const MERCHANT_ITEMS = [
  { id:"iron_skin",    name:"Iron Skin",       icon:"🛡️", description:"+3 permanent defence.",      type:"stat",  stat:"defense", amount:3 },
  { id:"sharpstone",   name:"Sharpstone",      icon:"⚔️", description:"+4 permanent attack.",       type:"stat",  stat:"attack",  amount:4 },
  { id:"vitality_gem", name:"Vitality Gem",    icon:"💎", description:"+20 max HP.",                type:"maxhp", amount:20 },
  { id:"elixir",       name:"Elixir of Power", icon:"✨", description:"+5 attack, +2 defence.",     type:"multi", attack:5, defense:2 },
  { id:"shadow_cloak", name:"Shadow Cloak",    icon:"🌑", description:"+4 attack, +15 max HP.",     type:"multi", attack:4, maxhp:15 },
  { id:"warding_stone",name:"Warding Stone",   icon:"🪨", description:"+5 defence.",                type:"stat",  stat:"defense", amount:5 },
];

function buildEnemy(id, roomNumber, difficulty="normal") {
  const t = ENEMIES.find((e)=>e.id===id);
  const scaled = scaleEnemy(JSON.parse(JSON.stringify(t)), roomNumber, difficulty);
  return { ...scaled, uid:Math.random().toString(36).slice(2), statusEffects:[], actionIndex:0 };
}

function buildRoom(number, lastType, worldTree, combatsSinceSpecial, dungeonIndex, isBossRoom, difficulty="normal") {
  if (isBossRoom) return { type:"boss", boss:buildBoss(dungeonIndex, number) };
  const type = number === 1 ? "combat" : pickRoomType(lastType, worldTree, combatsSinceSpecial ?? 99);
  if (type === "combat") {
    const dungeon = DUNGEONS[dungeonIndex] || DUNGEONS[0];
    const pool = dungeon.enemyPool;
    const config = COMBAT_CONFIGS[Math.floor(Math.random()*COMBAT_CONFIGS.length)];
    const mapped = config.map(() => pool[Math.floor(Math.random()*pool.length)]);
    const enemies = mapped.slice(0,2).map(id => buildEnemy(id, number, difficulty));
    return { type:"combat", enemies };
  }
  if (type === "rest") return { type:"rest" };
  if (type === "shrine") return { type:"shrine" };
  if (type === "event") return { type:"event", event:pickRandomEvent() };
  const item = MERCHANT_ITEMS[Math.floor(Math.random()*MERCHANT_ITEMS.length)];
  return { type:"merchant", item };
}

function buildPlayer(classKey, worldTree, preRunNode, consumables, difficulty="normal") {
  const cls = CLASSES[classKey];
  const wt = worldTree || [];
  let maxHp = cls.maxHp, attack = cls.attack, defense = cls.defense;
  // Trunk
  if (wt.includes("hardened_body"))    maxHp   += 5;
  if (wt.includes("sharp_eye"))        attack  += 1;
  if (wt.includes("veteran_pack"))     maxHp   += 10;
  if (wt.includes("steady_hand"))      defense += 1;
  // Nature
  if (wt.includes("resilience"))       defense += 2;
  // Dark
  if (wt.includes("blood_hunger"))     attack  += 1;
  if (wt.includes("deaths_bargain"))   { attack += 3; defense += 1; }
  // Combat Mastery
  if (wt.includes("weapon_training"))  attack  += 2;
  if (wt.includes("thick_skin"))       defense += 2;
  if (wt.includes("war_veteran"))      { maxHp += 15; attack += 2; }
  // Lore
  if (wt.includes("arcane_attunement")){ attack += 2; defense += 1; }

  const xpEarned = wt.includes("dark_pact") ? 20 : 0;
  // Battle Tested — start with frenzy
  const frenzyTurns = wt.includes("battle_tested") ? 2 : 0;
  const frenzyBonus = wt.includes("battle_tested") ? 6 : 0;

  let p = {
    classKey, characterName:randomName(classKey),
    name:cls.name, hp:maxHp, maxHp, attack, defense,
    abilities:cls.abilities.map((a)=>({...a})),
    statusEffects:[], gold:0, xpEarned,
    runNodes:[], seenNodeIds:[], currentRunTreeOptions:[],
    dungeonIndex:0, combatsWon:0, roomsInDungeon:0,
    dungeonsClearedThisRun:0,
    ritualCount:0, ritualUsedThisCampfire:0,
    retaliationBonus:0, leylineTurns:0,
    shadowstrikeReady:true,
    gritUsed:false, gritCount:0,
    defenseBuff:0, defenseBuffTurns:0, battleCryAttackBonus:0,
    smokeActive:false, surgeActive:false, arcaneHits:0,
    silencedAbilities:[],
    frenzyTurns, frenzyBonus,
    bloodSurgeActive:false, bloodSurgeCharges:0,
    tempAtkBonus:0, tempAtkCombatsLeft:0,
    challengerMarkActive:false,
    seerPreview:[],
    killingInstinctReady:true,
    battleMomentumBonus:0,
    darkRitualUsed:false,
    transcendenceUsed:false,
    firstAttackThisCombat:true,
    luckyCoinActive:false,
    huntersMarkActive:false,
    _bladeExpires:0,
    _armourExpires:0,
    abilitiesUsedThisRun:false,
    damageTakenThisCombat:0,
    onlyBasicThisCombat:true,
    onlyBasicThisDungeon:true,
    ritualsThisRun:0,
    activeTitle:"",
  };
  // Difficulty modifiers
  p.difficulty = difficulty;
  if (difficulty === "hard") {
    p.maxHp = Math.floor(p.maxHp * 0.85);
    p.hp    = p.maxHp;
  }
  // Apply pre-run node if chosen
  if (preRunNode) p = applyRunNode(p, preRunNode);
  // Apply store consumables
  if (consumables && consumables.length > 0) {
    for (const c of consumables) {
      const item = STORE_CONSUMABLES.find(i=>i.id===c);
      if (item) item.apply(p);
    }
  }
  return p;
}

function applyRunNode(player, nodeId) {
  const np = JSON.parse(JSON.stringify(player));
  np.runNodes = [...(np.runNodes||[]), nodeId];
  np.seenNodeIds = [...(np.seenNodeIds||[]), nodeId];
  // Immediate stat effects
  if (nodeId==="iron_will")   { np.maxHp+=15; np.hp=Math.min(np.maxHp,np.hp+15); }
  if (nodeId==="fortress")    { np.defense+=4; }
  if (nodeId==="juggernaut")  { np.maxHp+=20; np.hp=Math.min(np.maxHp,np.hp+20); np.defense+=3; }
  if (nodeId==="shadow_step") { const a=np.abilities.find(a=>a.id==="smoke_bomb"); if(a){a.maxCharges+=1;a.charges=a.maxCharges;} }
  if (nodeId==="quick_hands") { const a=np.abilities.find(a=>a.id==="backstab");   if(a){a.maxCharges+=1;a.charges=a.maxCharges;} }
  if (nodeId==="ghost")       { const a=np.abilities.find(a=>a.id==="smoke_bomb"); if(a){a.maxCharges+=2;a.charges=a.maxCharges;} }
  if (nodeId==="attunement")  { const a=np.abilities.find(a=>a.id==="arcane_surge");if(a){a.maxCharges+=1;a.charges=a.maxCharges;} }
  // Druid
  if (nodeId==="verdant_growth") { np.maxHp+=15; np.hp=Math.min(np.maxHp,np.hp+15); }
  if (nodeId==="ironbark")       { np.defense+=4; }
  if (nodeId==="spreading_spores"){ const a=np.abilities.find(a=>a.id==="spore_cloud"); if(a){a.maxCharges+=1;a.charges=a.maxCharges;} }
  if (nodeId==="thorn_shield")   { const a=np.abilities.find(a=>a.id==="barkskin");    if(a){a.maxCharges+=1;a.charges=a.maxCharges;} }
  // Blood Knight
  if (nodeId==="iron_constitution"){ np.maxHp+=20; np.hp=Math.min(np.maxHp,np.hp+20); }
  if (nodeId==="battle_hardened") { np.defense+=3; }
  if (nodeId==="crimson_fury")   { const a=np.abilities.find(a=>a.id==="crimson_slash"); if(a){a.maxCharges+=1;a.charges=a.maxCharges;} }
  return np;
}

function buildBoss(dungeonIndex, roomNumber) {
  const dungeon = DUNGEONS[dungeonIndex];
  if (!dungeon) return null;
  const b = dungeon.boss;
  const s = 1 + (roomNumber-1)*0.03;
  return {
    ...b,
    hp: Math.round(b.hp * s),
    maxHp: Math.round(b.maxHp * s),
    attack: [Math.round(b.attack[0]*s), Math.round(b.attack[1]*s)],
    uid: "boss",
    statusEffects: [],
    actionIndex: 0,
    isBoss: true,
    inPhase2: false,
    bracing: false,
    silenced: false,
  };
}

// ============================================================
// STORAGE
// ============================================================

function loadPersistent() {
  try {
    const ls = window.localStorage;
    return Promise.resolve({
      worldTree:      JSON.parse(ls.getItem("gm_worldTree")    || "[]"),
      graveyard:      JSON.parse(ls.getItem("gm_graveyard")    || "[]"),
      totalXp:        parseInt(ls.getItem("gm_totalXp")        || "0"),
      goldBalance:    parseInt(ls.getItem("gm_goldBalance")    || "0"),
      achievements:   JSON.parse(ls.getItem("gm_achievements") || "{}"),
      purchasedItems: JSON.parse(ls.getItem("gm_purchased")    || "[]"),
      earnedTitles:   JSON.parse(ls.getItem("gm_titles")       || "[]"),
      activeTitle:    ls.getItem("gm_activeTitle")             || "",
    });
  } catch {
    return Promise.resolve({worldTree:[],graveyard:[],totalXp:0,goldBalance:0,achievements:{},purchasedItems:[],earnedTitles:[],activeTitle:""});
  }
}

function savePersistent(data) {
  try {
    const ls = window.localStorage;
    ls.setItem("gm_worldTree",    JSON.stringify(data.worldTree      || []));
    ls.setItem("gm_graveyard",    JSON.stringify(data.graveyard      || []));
    ls.setItem("gm_totalXp",      String(data.totalXp                || 0));
    ls.setItem("gm_goldBalance",  String(data.goldBalance            || 0));
    ls.setItem("gm_achievements", JSON.stringify(data.achievements   || {}));
    ls.setItem("gm_purchased",    JSON.stringify(data.purchasedItems || []));
    ls.setItem("gm_titles",       JSON.stringify(data.earnedTitles   || []));
    ls.setItem("gm_activeTitle",  data.activeTitle                   || "");
  } catch(e) { console.error("Storage error",e); }
  return Promise.resolve();
}

// ============================================================
// COMBAT LOGIC
// ============================================================

function applyStatusEffects(target, log) {
  const remaining=[];
  for (const fx of target.statusEffects) {
    if (fx.type==="bleed") {
      target.hp=Math.max(0,target.hp-fx.damage);
      log(`🩸 ${target.name} bleeds for ${fx.damage}.`);
      fx.turns--;
      if (fx.turns>0) remaining.push(fx);
    } else if (["stun","freeze","exposed"].includes(fx.type)) {
      fx.turns--;
      if (fx.turns>0) remaining.push(fx);
    } else remaining.push(fx);
  }
  target.statusEffects=remaining;
}

const isStunned = (t) => t.statusEffects.some((e)=>e.type==="stun"||e.type==="freeze");
const isExposed = (t) => t.statusEffects.some((e)=>e.type==="exposed");
const isBleeding= (t) => t.statusEffects.some((e)=>e.type==="bleed");
const isFrozen  = (t) => t.statusEffects.some((e)=>e.type==="freeze");
const calcDmg   = (base,def,exposed) => Math.max(1, base-(exposed?Math.max(0,def-5):def));
function calcDmgWithBuffs(base,def,exposed,target,player){
  let dmg=calcDmg(base,def,exposed);
  if(isExposed(target)&&hasNode(player,"natural_armour"))dmg=Math.floor(dmg*1.20);
  if(isBleeding(target)&&hasNode(player,"predators_mark"))dmg=Math.floor(dmg*1.15);
  return Math.max(1,dmg);
}
const hasNode   = (p,id) => (p.runNodes||[]).includes(id);

// ============================================================
// UI ATOMS
// ============================================================

function HPBar({ current, max }) {
  const p = Math.max(0,Math.min(100,(current/max)*100));
  return (
    <div style={{width:"100%",background:"#1a1a2a",borderRadius:4,height:8,overflow:"hidden"}}>
      <div style={{width:`${p}%`,height:"100%",borderRadius:4,transition:"width 0.4s ease",
        background:p>50?"#4caf6e":p>25?"#e0a040":"#e05c5c"}}/>
    </div>
  );
}

function Badge({label,color}) {
  return <span style={{fontSize:10,color,background:"#12121e",border:`1px solid ${color}44`,
    borderRadius:3,padding:"1px 5px",marginRight:2}}>{label}</span>;
}

function LogEntry({entry,index}) {
  return <div style={{padding:"4px 0",borderBottom:"1px solid #1a1a2a",
    color:index===0?"#e8d5a3":"#666",fontSize:12,fontFamily:"'Georgia',serif",lineHeight:1.4}}>{entry}</div>;
}

function EnemyCard({enemy,selected,onClick,showNextAction}) {
  const labels={attack:"⚔️ Attack",heavy_attack:"💥 Heavy",magic_bolt:"✨ Magic",cower:"😨 Cower",brace:"🛡️ Brace"};
  const next=enemy.actions[enemy.actionIndex%enemy.actions.length];
  return (
    <div onClick={onClick} style={{
      border:selected?"2px solid #C8A96E":"2px solid #1e1e2e",
      borderRadius:10,padding:"10px 8px",background:selected?"#1e1a12":"#0e0e18",
      cursor:"pointer",flex:1,minWidth:0,position:"relative",transition:"all 0.15s",
    }}>
      {enemy.hp/enemy.maxHp<0.4&&<div style={{position:"absolute",top:-7,right:4,
        fontSize:9,color:"#e05c5c",background:"#0e0e18",padding:"0 3px"}}>LOW</div>}
      <div style={{fontSize:24,textAlign:"center"}}>{enemy.icon}</div>
      <div style={{color:"#ccc",fontSize:10,textAlign:"center",marginTop:2}}>{enemy.name}</div>
      {isStunned(enemy)&&<div style={{textAlign:"center",fontSize:9,color:"#aaa8e0"}}>STUNNED</div>}
      {isBleeding(enemy)&&!isStunned(enemy)&&<div style={{textAlign:"center",fontSize:9,color:"#e05c5c"}}>BLEEDING</div>}
      {isExposed(enemy)&&<div style={{textAlign:"center",fontSize:9,color:"#e0a040"}}>EXPOSED</div>}
      {showNextAction&&!isStunned(enemy)&&(
        <div style={{textAlign:"center",fontSize:9,color:"#6EA8C8",marginTop:2}}>{labels[next]||next}</div>
      )}
      <div style={{marginTop:5}}>
        <HPBar current={enemy.hp} max={enemy.maxHp}/>
        <div style={{color:"#555",fontSize:9,textAlign:"center",marginTop:2}}>{enemy.hp}/{enemy.maxHp}</div>
      </div>
    </div>
  );
}

// ============================================================
// CLASS SELECT
// ============================================================



// ============================================================
// SPOTLIGHT TUTORIAL SYSTEM
// ============================================================

// Tracks which tutorials have been seen — persisted to localStorage
const TutorialState = {
  seen: (() => { try { return new Set(JSON.parse(localStorage.getItem("gm_tut")||"[]")); } catch { return new Set(); } })(),
  mark(id) {
    this.seen.add(id);
    try { localStorage.setItem("gm_tut", JSON.stringify([...this.seen])); } catch {}
  },
  has(id) { return this.seen.has(id); },
  reset() { this.seen.clear(); try { localStorage.removeItem("gm_tut"); } catch {} },
};

// Spotlight overlay — dims everything except the highlighted element area
// targetRect: {top,left,width,height} in viewport coords
// label: short string (≤6 words)
// arrow: "up"|"down"|"left"|"right"
function SpotlightOverlay({label,targetRect,arrow="up",onDismiss}) {
  const [pulse,setPulse]=useState(false);
  useEffect(()=>{
    const t=setInterval(()=>setPulse(p=>!p),900);
    return()=>clearInterval(t);
  },[]);

  if(!targetRect) return null;
  const {top,left,width,height}=targetRect;
  const pad=8;

  // Tooltip position
  const tipTop = arrow==="down" ? top-52 : top+height+12;
  const tipLeft = Math.max(8, Math.min(left+width/2-90, window.innerWidth-188));

  return (
    <div onClick={onDismiss} style={{
      position:"fixed",inset:0,zIndex:1000,
      background:"transparent",
    }}>
      {/* Dark overlay with cutout via box-shadow */}
      <div style={{
        position:"fixed",
        top:top-pad, left:left-pad,
        width:width+pad*2, height:height+pad*2,
        borderRadius:10,
        boxShadow:`0 0 0 9999px rgba(0,0,0,0.75)`,
        pointerEvents:"none",
        border:`2px solid ${pulse?"#C8A96E":"#C8A96E88"}`,
        transition:"border-color 0.9s ease",
      }}/>
      {/* Pulsing ring */}
      <div style={{
        position:"fixed",
        top:top-pad-4, left:left-pad-4,
        width:width+pad*2+8, height:height+pad*2+8,
        borderRadius:13,
        border:`1px solid ${pulse?"#C8A96E66":"transparent"}`,
        pointerEvents:"none",
        transition:"border-color 0.9s ease",
      }}/>
      {/* Tooltip */}
      <div style={{
        position:"fixed",
        top:tipTop, left:tipLeft,
        width:180,
        background:"#0e0e1a",
        border:"1px solid #C8A96E",
        borderRadius:8,
        padding:"8px 12px",
        pointerEvents:"none",
        zIndex:1001,
      }}>
        {arrow==="up"&&<div style={{
          position:"absolute",bottom:"100%",left:Math.min(Math.max(left+width/2-tipLeft-6,8),164),
          width:0,height:0,borderLeft:"6px solid transparent",
          borderRight:"6px solid transparent",borderBottom:"6px solid #C8A96E",
        }}/>}
        {arrow==="down"&&<div style={{
          position:"absolute",top:"100%",left:Math.min(Math.max(left+width/2-tipLeft-6,8),164),
          width:0,height:0,borderLeft:"6px solid transparent",
          borderRight:"6px solid transparent",borderTop:"6px solid #C8A96E",
        }}/>}
        <div style={{color:"#C8A96E",fontSize:13,textAlign:"center",fontFamily:"'Georgia',serif"}}>
          {label}
        </div>
        <div style={{color:"#555",fontSize:10,textAlign:"center",marginTop:3}}>Tap to continue</div>
      </div>
    </div>
  );
}

// Hook — returns a spotlight props object if tutorial step should show
function useTutorialSpot(id, ref, label, arrow="up", deps=[]) {
  const [rect,setRect]=useState(null);
  useEffect(()=>{
    if(TutorialState.has(id)||!ref?.current) return;
    const el=ref.current;
    const r=el.getBoundingClientRect();
    setRect({top:r.top,left:r.left,width:r.width,height:r.height});
  },[...deps, id]);

  function dismiss() {
    TutorialState.mark(id);
    setRect(null);
  }
  if(!rect||TutorialState.has(id)) return {active:false,dismiss};
  return {active:true,rect,label,arrow,dismiss};
}


// ============================================================
// SETTINGS SCREEN
// ============================================================

function SettingsScreen({soundMuted,onToggleMute,hapticsEnabled,onToggleHaptics,
                         difficulty,onSetDifficulty,onResetTutorial,onBack,version="0.1.0"}) {
  const [resetDone,setResetDone]=useState(false);

  function Row({label,children}) {
    return (
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"14px 0",borderBottom:"1px solid #1a1a2e"}}>
        <span style={{color:"#888",fontSize:14}}>{label}</span>
        {children}
      </div>
    );
  }

  function Toggle({value,onToggle,onColor="#4caf6e"}) {
    return (
      <div onClick={onToggle} style={{
        width:48,height:26,borderRadius:13,cursor:"pointer",
        background:value?onColor:"#1a1a2e",
        border:`1px solid ${value?onColor:"#2a2a3e"}`,
        position:"relative",transition:"background 0.2s",flexShrink:0,
      }}>
        <div style={{
          position:"absolute",top:3,
          left:value?26:3,
          width:18,height:18,borderRadius:"50%",
          background:value?"#fff":"#555",
          transition:"left 0.2s",
        }}/>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#888",
          fontSize:13,cursor:"pointer",fontFamily:"'Georgia',serif"}}>← Back</button>
        <div style={{color:"#C8A96E",fontSize:11,letterSpacing:3}}>SETTINGS</div>
        <div style={{width:48}}/>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"8px 20px"}}>

        {/* Audio */}
        <div style={{color:"#444",fontSize:10,letterSpacing:3,padding:"16px 0 8px"}}>AUDIO</div>
        <Row label="Sound Effects">
          <Toggle value={!soundMuted} onToggle={onToggleMute} onColor="#C8A96E"/>
        </Row>
        <Row label="Haptics">
          <Toggle value={hapticsEnabled} onToggle={onToggleHaptics} onColor="#C8A96E"/>
        </Row>

        {/* Gameplay */}
        <div style={{color:"#444",fontSize:10,letterSpacing:3,padding:"20px 0 8px"}}>GAMEPLAY</div>
        <Row label="Difficulty">
          <div style={{display:"flex",gap:6}}>
            {["normal","hard"].map(d=>(
              <button key={d} onClick={()=>{SoundEngine.uiTap();onSetDifficulty(d);}} style={{
                background:difficulty===d?(d==="hard"?"#1a0808":"#0a140a"):"#0e0e14",
                border:`1px solid ${difficulty===d?(d==="hard"?"#e05c5c":"#4caf6e"):"#2a2a3e"}`,
                borderRadius:6,padding:"5px 14px",
                color:difficulty===d?(d==="hard"?"#e05c5c":"#4caf6e"):"#555",
                fontSize:12,cursor:"pointer",fontFamily:"'Georgia',serif",
              }}>{d==="hard"?"💀 Hard":"⚔️ Normal"}</button>
            ))}
          </div>
        </Row>

        {/* Tutorial */}
        <div style={{color:"#444",fontSize:10,letterSpacing:3,padding:"20px 0 8px"}}>TUTORIAL</div>
        <Row label="Reset tutorial hints">
          <button onClick={()=>{TutorialState.reset();setResetDone(true);SoundEngine.uiTap();}} style={{
            background:resetDone?"#0a140a":"#0e0e14",
            border:`1px solid ${resetDone?"#4caf6e":"#2a2a3e"}`,
            borderRadius:6,padding:"5px 14px",
            color:resetDone?"#4caf6e":"#888",
            fontSize:12,cursor:"pointer",fontFamily:"'Georgia',serif",
          }}>{resetDone?"✓ Reset":"Reset"}</button>
        </Row>

        {/* About */}
        <div style={{color:"#444",fontSize:10,letterSpacing:3,padding:"20px 0 8px"}}>ABOUT</div>
        <Row label="Version"><span style={{color:"#555",fontSize:13}}>v{version}</span></Row>
        <Row label="Game"><span style={{color:"#555",fontSize:13}}>Gravemark</span></Row>
        <Row label="Genre"><span style={{color:"#555",fontSize:13}}>Roguelike RPG</span></Row>

      </div>
    </div>
  );
}

// ============================================================
// TITLE SCREEN
// ============================================================

function TitleScreen({onStart,version="0.1.0"}) {
  const [pulse,setPulse]=useState(false);
  useEffect(()=>{
    SoundEngine.init();
    const t=setInterval(()=>setPulse(p=>!p),2000);
    return()=>clearInterval(t);
  },[]);

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",fontFamily:"'Georgia',serif",
      maxWidth:480,margin:"0 auto",padding:32,position:"relative",overflow:"hidden"}}>

      {/* Atmospheric background particles */}
      {[...Array(12)].map((_,i)=>(
        <div key={i} style={{
          position:"absolute",
          left:`${(i*37+13)%100}%`,
          top:`${(i*23+7)%100}%`,
          width:2,height:2,
          borderRadius:"50%",
          background:"#C8A96E",
          opacity:pulse?(0.05+i*0.02):(0.02+i*0.01),
          transition:"opacity 2s ease",
        }}/>
      ))}

      {/* Logo */}
      <div style={{textAlign:"center",marginBottom:48}}>
        <div style={{
          fontSize:72,marginBottom:16,
          filter:`drop-shadow(0 0 ${pulse?16:8}px #C8A96E44)`,
          transition:"filter 2s ease",
        }}>🪦</div>
        <div style={{
          color:"#C8A96E",
          fontSize:48,
          letterSpacing:8,
          fontWeight:"bold",
          textShadow:`0 0 ${pulse?30:15}px #C8A96E66`,
          transition:"text-shadow 2s ease",
          marginBottom:8,
        }}>GRAVEMARK</div>
        <div style={{color:"#555",fontSize:13,letterSpacing:4}}>
          EVERY DEATH LEAVES A MARK
        </div>
      </div>

      {/* Enter button */}
      <button onClick={()=>{
        SoundEngine.init();
        SoundEngine.uiTap();
        Haptics.light();
        onStart();
      }} style={{
        background:"transparent",
        border:"1px solid #C8A96E",
        borderRadius:8,
        padding:"16px 48px",
        color:"#C8A96E",
        fontSize:15,
        letterSpacing:4,
        cursor:"pointer",
        fontFamily:"'Georgia',serif",
        marginBottom:48,
        boxShadow:`0 0 ${pulse?20:8}px #C8A96E22`,
        transition:"box-shadow 2s ease",
      }}>ENTER</button>

      <div style={{color:"#2a2a3e",fontSize:10,letterSpacing:2}}>v{version}</div>
    </div>
  );
}

// ============================================================
// LEADERBOARD SCREEN
// ============================================================

function LeaderboardScreen({graveyard,onBack}) {
  const [tab,setTab]=useState("personal");
  const [sharedEntries,setSharedEntries]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);

  // Score formula
  function calcScore(run) {
    const dungeons=DUNGEONS.findIndex(d=>d.name===run.dungeon);
    const dungeonScore=(dungeons>=0?dungeons:0)*1000;
    return dungeonScore+(run.roomsReached||0)*10+(run.xpEarned||0);
  }

  // Personal leaderboard — top 10 from graveyard sorted by score
  const personalEntries=[...graveyard]
    .map(r=>({...r,score:calcScore(r)}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,10);

  // Load shared leaderboard
  async function loadShared() {
    setLoading(true);setError(null);
    try {
      // TODO: Replace with your leaderboard API endpoint
      // const res = await fetch("/api/leaderboard");
      // const data = await res.json();
      // setSharedEntries(data.slice(0,20));
      setError("Community leaderboard requires a backend. Coming soon!");
    } catch(e){setError("Could not load leaderboard.");}
    setLoading(false);
  }

  useEffect(()=>{if(tab==="shared")loadShared();},[tab]);

  function medalColor(i){return i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"#555";}
  function medal(i){return i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`;}

  function RunCard({run,rank,highlight}) {
    const cls=CLASSES[run.classKey];
    const color=cls?.color||"#888";
    return (
      <div style={{
        display:"flex",alignItems:"center",gap:10,
        padding:"12px 14px",marginBottom:6,borderRadius:10,
        background:highlight?"#0e0e14":"#0a0a10",
        border:`1px solid ${highlight?"#C8A96E44":"#1e1e2e"}`,
      }}>
        <div style={{color:medalColor(rank),fontSize:rank<3?20:13,minWidth:28,textAlign:"center"}}>
          {medal(rank)}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:highlight?"#C8A96E":color,fontSize:13,marginBottom:2}}>
            {cls?.icon} {run.characterName}{run.activeTitle?" "+run.activeTitle:""}
          </div>
          <div style={{color:"#444",fontSize:10}}>
            {run.className} · {run.dungeon||"Unknown"} · Room {run.roomsReached}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:"#C8A96E",fontSize:14,fontWeight:"bold"}}>{run.score.toLocaleString()}</div>
          <div style={{color:"#333",fontSize:9,marginTop:1}}>{run.date||""}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#888",
          fontSize:13,cursor:"pointer",fontFamily:"'Georgia',serif"}}>← Back</button>
        <div style={{color:"#C8A96E",fontSize:11,letterSpacing:3}}>LEADERBOARD</div>
        <div style={{width:48}}/>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",background:"#0e0e1a",borderBottom:"1px solid #1e1e2e"}}>
        {[["personal","🪦 Personal"],["shared","🌍 Community"]].map(([t,l])=>(
          <button key={t} onClick={()=>{SoundEngine.uiTap();setTab(t);}} style={{
            flex:1,padding:"10px 0",background:"none",
            border:"none",borderBottom:`2px solid ${tab===t?"#C8A96E":"transparent"}`,
            color:tab===t?"#C8A96E":"#555",fontSize:13,cursor:"pointer",
            fontFamily:"'Georgia',serif",
          }}>{l}</button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"12px 14px"}}>
        {tab==="personal"&&(
          <>
            <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:10}}>
              YOUR TOP 10 RUNS — SCORE = DUNGEONS×1000 + ROOMS×10 + XP
            </div>
            {personalEntries.length===0&&(
              <div style={{textAlign:"center",color:"#333",marginTop:40,fontSize:13}}>
                <div style={{fontSize:32,marginBottom:8}}>🪦</div>
                No runs yet. Begin your legend.
              </div>
            )}
            {personalEntries.map((run,i)=><RunCard key={i} run={run} rank={i} highlight={i===0}/>)}
          </>
        )}

        {tab==="shared"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{color:"#444",fontSize:10,letterSpacing:3}}>COMMUNITY TOP 20</div>
              <button onClick={loadShared} style={{background:"#1a1a2e",border:"1px solid #2a2a3e",
                borderRadius:6,padding:"4px 10px",color:"#888",fontSize:11,
                cursor:"pointer",fontFamily:"'Georgia',serif"}}>↻ Refresh</button>
            </div>
            <div style={{color:"#333",fontSize:10,marginBottom:10}}>
              Your best run is submitted automatically when you complete or abandon a run.
            </div>
            {loading&&<div style={{textAlign:"center",color:"#444",padding:32}}>Loading…</div>}
            {error&&<div style={{textAlign:"center",color:"#e05c5c",padding:16,fontSize:12}}>{error}</div>}
            {!loading&&!error&&sharedEntries.length===0&&(
              <div style={{textAlign:"center",color:"#333",marginTop:40,fontSize:13}}>
                <div style={{fontSize:32,marginBottom:8}}>🌍</div>
                No community entries yet. Be the first!
              </div>
            )}
            {!loading&&sharedEntries.map((run,i)=><RunCard key={i} run={run} rank={i} highlight={false}/>)}
          </>
        )}
      </div>
    </div>
  );
}


function ClassSelectScreen({onSelect,graveyard,totalXp,worldTree,goldBalance,purchasedItems,activeTitle,earnedTitles,soundMuted,onToggleMute,difficulty,onSetDifficulty,onOpenGraveyard,onOpenWorldTree,onOpenStore,onOpenTrophyRoom,onOpenTitles,onOpenLeaderboard,onOpenSettings}) {
  const [active,setActive]=useState("warrior");
  const cls=CLASSES[active];
  const unlocked=["warrior","rogue","mage",
    ...(worldTree.includes("druid_unlock")?["druid"]:[]),
    ...(worldTree.includes("necro_unlock")?["blood_knight"]:[]),
  ].filter(k=>CLASSES[k]);

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      alignItems:"center",padding:"28px 20px",fontFamily:"'Georgia',serif"}}>
      <div style={{color:"#C8A96E",fontSize:10,letterSpacing:6,marginBottom:4}}>THE DUNGEON AWAITS</div>
      <h1 style={{color:"#e8d5a3",fontSize:24,margin:"0 0 4px",fontWeight:"normal",letterSpacing:2}}>Choose Your Fate</h1>
      <div style={{color:"#444",fontSize:11,marginBottom:14}}>More classes unlock through the World Tree.</div>

      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",justifyContent:"center"}}>
        <div style={{background:"#0e0e1a",border:"1px solid #2a2a3e",borderRadius:8,
          padding:"6px 12px",color:"#C8A96E",fontSize:12}}>✨ {totalXp} XP</div>
        <div style={{background:"#0e0e1a",border:"1px solid #C8A96E33",borderRadius:8,
          padding:"6px 12px",color:"#C8A96E",fontSize:12}}>🪙 {goldBalance}</div>
        <button onClick={onOpenWorldTree} style={{background:"#0e0e1a",border:"1px solid #C8A96E44",
          borderRadius:8,padding:"6px 12px",color:"#C8A96E",fontSize:12,
          cursor:"pointer",fontFamily:"'Georgia',serif"}}>🌳 Tree</button>
        <button onClick={onOpenStore} style={{background:"#0e0e1a",border:"1px solid #C8A96E44",
          borderRadius:8,padding:"6px 12px",color:"#C8A96E",fontSize:12,
          cursor:"pointer",fontFamily:"'Georgia',serif"}}>🏪 Store</button>
        {graveyard.length>0&&(
          <button onClick={onOpenGraveyard} style={{background:"#0e0e1a",border:"1px solid #3a2a2e",
            borderRadius:8,padding:"6px 12px",color:"#888",fontSize:12,
            cursor:"pointer",fontFamily:"'Georgia',serif"}}>🪦 Fallen</button>
        )}
        {earnedTitles&&earnedTitles.length>0&&(
          <button onClick={onOpenTitles} style={{background:"#0e0e1a",border:"1px solid #C8A96E44",
            borderRadius:8,padding:"6px 12px",color:"#C8A96E",fontSize:12,
            cursor:"pointer",fontFamily:"'Georgia',serif"}}>🎖️ Titles</button>
        )}
        <button onClick={onOpenTrophyRoom} style={{background:"#0e0e1a",border:"1px solid #C8A96E44",
          borderRadius:8,padding:"6px 12px",color:"#C8A96E",fontSize:12,
          cursor:"pointer",fontFamily:"'Georgia',serif"}}>🏆 Trophies</button>
        <button onClick={onOpenLeaderboard} style={{background:"#0e0e1a",border:"1px solid #C8A96E44",
          borderRadius:8,padding:"6px 12px",color:"#C8A96E",fontSize:12,
          cursor:"pointer",fontFamily:"'Georgia',serif"}}>🏅 Scores</button>
        <button onClick={()=>{SoundEngine.uiTap();onOpenSettings();}} style={{background:"#0e0e1a",
          border:"1px solid #2a2a3e",borderRadius:8,padding:"6px 12px",
          color:"#C8A96E",fontSize:12,
          cursor:"pointer",fontFamily:"'Georgia',serif"}}>⚙️</button>
      </div>
      {activeTitle&&(
        <div style={{color:"#C8A96E",fontSize:11,marginBottom:8,fontStyle:"italic",opacity:0.7}}>
          {activeTitle}
        </div>
      )}
      {difficulty==="hard"&&(
        <div style={{color:"#e05c5c",fontSize:10,letterSpacing:2,marginBottom:10}}>💀 HARD MODE</div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:14,width:"100%",maxWidth:360,flexWrap:"wrap"}}>
        {unlocked.map((key)=>{
          const c=CLASSES[key];
          return (
            <button key={key} onClick={()=>setActive(key)} style={{
              flex:1,minWidth:60,padding:"10px 0",borderRadius:8,
              border:`2px solid ${active===key?c.color:"#2a2a3e"}`,
              background:active===key?"#12121e":"#0e0e1a",
              color:active===key?c.color:"#444",
              cursor:"pointer",fontSize:20,transition:"all 0.2s",
            }}>{c.icon}</button>
          );
        })}
      </div>

      <div style={{width:"100%",maxWidth:360,border:`2px solid ${cls.color}44`,
        borderRadius:14,padding:20,background:"#0e0e1a"}}>
        <div style={{textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:40}}>{cls.icon}</div>
          <div style={{color:cls.color,fontSize:20,letterSpacing:2,marginTop:4}}>{cls.name}</div>
          <div style={{color:"#666",fontSize:12,marginTop:4}}>{cls.description}</div>
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:20,marginBottom:14}}>
          {[["HP",cls.maxHp+(worldTree.includes("hardened_body")?5:0)+(worldTree.includes("veteran_pack")?10:0)],
            ["ATK",cls.attack+(worldTree.includes("sharp_eye")?1:0)+(worldTree.includes("blood_hunger")?1:0)+(worldTree.includes("deaths_bargain")?3:0)],
            ["DEF",cls.defense+(worldTree.includes("steady_hand")?1:0)+(worldTree.includes("resilience")?2:0)+(worldTree.includes("deaths_bargain")?1:0)]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{color:cls.color,fontSize:18,fontWeight:"bold"}}>{v}</div>
              <div style={{color:"#444",fontSize:10}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{borderTop:"1px solid #1e1e2e",paddingTop:12,marginBottom:12}}>
          <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:8}}>ABILITIES</div>
          {cls.abilities.map((ab)=>(
            <div key={ab.id} style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}>
              <span style={{fontSize:13}}>{ab.icon}</span>
              <div style={{fontSize:12}}>
                <span style={{color:"#e8d5a3"}}>{ab.name}</span>
                <span style={{color:"#555"}}> — {ab.description}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{borderTop:"1px solid #1e1e2e",paddingTop:12,marginBottom:16}}>
          <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:4}}>PASSIVE</div>
          <div style={{color:"#aaa",fontSize:12}}>
            {cls.passive.icon} <strong style={{color:"#e8d5a3"}}>{cls.passive.name}</strong> — {cls.passive.description}
          </div>
        </div>
        <button onClick={()=>onSelect(active)} style={{
          width:"100%",background:cls.color,color:"#0b0b14",border:"none",
          borderRadius:8,padding:"12px 0",fontWeight:"bold",fontSize:14,
          letterSpacing:2,cursor:"pointer",fontFamily:"'Georgia',serif",
        }}>BEGIN AS {cls.name.toUpperCase()}</button>
      </div>

      <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
        {[["🌿","Druid","druid_unlock"],["🩸","Blood Knight","necro_unlock"]]
          .filter(([,,id])=>!worldTree.includes(id))
          .map(([icon,name])=>(
            <div key={name} style={{border:"1px solid #1e1e2e",borderRadius:8,
              padding:"6px 12px",color:"#333",fontSize:11,textAlign:"center"}}>
              {icon} {name} — Locked
            </div>
          ))}
      </div>
    </div>
  );
}

// ============================================================
// WORLD TREE SCREEN
// ============================================================

function WorldTreeScreen({totalXp,worldTree,onPurchase,onBack}) {
  const spentXp=WORLD_TREE_NODES.filter(n=>worldTree.includes(n.id)).reduce((s,n)=>s+n.cost,0);
  const availableXp=totalXp-spentXp;
  const [selected,setSelected]=useState(null);
  const [zoom,setZoom]=useState(1);

  const bc={trunk:"#C8A96E",nature:"#4caf6e",dark:"#9E7FD4",legacy:"#e0a040",combat:"#e05c5c",lore:"#6EA8C8"};
  const branchMeta={
    nature:{color:"#4caf6e",label:"Nature",  icon:"🌿"},
    dark:  {color:"#9E7FD4",label:"Dark",    icon:"💀"},
    legacy:{color:"#e0a040",label:"Legacy",  icon:"⚔️"},
    combat:{color:"#e05c5c",label:"Combat",  icon:"🛡️"},
    lore:  {color:"#6EA8C8",label:"Lore",    icon:"📖"},
  };
  const branchOrder=["nature","dark","legacy","combat","lore"];

  const trunk=WORLD_TREE_NODES.filter(n=>n.branch==="trunk");
  const trunkComplete=trunk.every(n=>worldTree.includes(n.id));
  const branches=branchOrder.reduce((a,b)=>{
    a[b]=WORLD_TREE_NODES.filter(n=>n.branch===b);
    return a;
  },{});
  const maxBranchLen=Math.max(...branchOrder.map(b=>branches[b].length));

  function nodeState(node){
    if(worldTree.includes(node.id))return"owned";
    // Trunk: require previous trunk node
    if(node.branch==="trunk"){
      if(node.requires&&!worldTree.includes(node.requires))return"locked";
      return availableXp>=node.cost?"available":"unaffordable";
    }
    // Branch: require trunk complete + previous in branch
    if(!trunkComplete)return"locked";
    if(node.requires&&!worldTree.includes(node.requires))return"locked";
    return availableXp>=node.cost?"available":"unaffordable";
  }

  const NODE_SIZE=44*zoom;
  const TRUNK_GAP=56*zoom;
  const BRANCH_GAP=52*zoom;
  const FONT=Math.max(8,10*zoom);

  function NodeCircle({node,showLabel}){
    const st=nodeState(node);
    const owned=st==="owned";
    const locked=st==="locked";
    const available=st==="available";
    const color=bc[node.branch]||"#888";
    const isSelected=selected===node.id;
    const r=NODE_SIZE/2;
    const bg=owned?color:isSelected?`${color}33`:locked?"#111":available?`${color}22`:"#111";
    const border=owned?color:isSelected?color:locked?"#222":available?color:"#2a2a3e";
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer"}}
        onClick={()=>setSelected(isSelected?null:node.id)}>
        <div style={{
          width:NODE_SIZE,height:NODE_SIZE,borderRadius:"50%",
          background:bg,border:`${Math.max(1,2*zoom)}px solid ${border}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:NODE_SIZE*0.4,transition:"all 0.15s",
          boxShadow:isSelected?`0 0 8px ${color}88`:"none",
          flexShrink:0,
        }}>
          {owned?"✓":locked?"🔒":node.icon}
        </div>
        {showLabel&&zoom>=0.8&&(
          <div style={{color:owned?color:locked?"#333":"#888",fontSize:FONT*0.85,
            marginTop:2,textAlign:"center",maxWidth:NODE_SIZE+8,lineHeight:1.1,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {node.name}
          </div>
        )}
      </div>
    );
  }

  function Connector({color,vertical}){
    const thickness=Math.max(1,1.5*zoom);
    const len=vertical?(BRANCH_GAP-NODE_SIZE):(TRUNK_GAP-NODE_SIZE);
    return vertical?(
      <div style={{width:thickness,height:Math.max(4,len),background:color,
        opacity:0.4,margin:"0 auto",flexShrink:0}}/>
    ):(
      <div style={{height:thickness,width:Math.max(4,len),background:color,
        opacity:0.4,alignSelf:"center",flexShrink:0}}/>
    );
  }

  const selectedNode=selected?WORLD_TREE_NODES.find(n=>n.id===selected):null;
  const selState=selectedNode?nodeState(selectedNode):null;
  const selColor=selectedNode?bc[selectedNode.branch]||"#888":"#888";

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto",overflow:"hidden"}}>

      {/* Header */}
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#888",
          fontSize:13,cursor:"pointer",fontFamily:"'Georgia',serif"}}>← Back</button>
        <div style={{color:"#C8A96E",fontSize:11,letterSpacing:3}}>WORLD TREE</div>
        <div style={{color:"#C8A96E",fontSize:12}}>✨ {availableXp} XP</div>
      </div>

      {/* Zoom controls */}
      <div style={{display:"flex",justifyContent:"center",gap:8,padding:"6px",
        background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",flexShrink:0}}>
        <button onClick={()=>setZoom(z=>Math.max(0.5,+(z-0.15).toFixed(2)))}
          style={{background:"#1a1a2e",border:"1px solid #2a2a3e",borderRadius:6,
          width:32,height:28,color:"#888",fontSize:16,cursor:"pointer",fontFamily:"monospace"}}>−</button>
        <div style={{color:"#555",fontSize:11,alignSelf:"center",minWidth:36,textAlign:"center"}}>
          {Math.round(zoom*100)}%</div>
        <button onClick={()=>setZoom(z=>Math.min(1.5,+(z+0.15).toFixed(2)))}
          style={{background:"#1a1a2e",border:"1px solid #2a2a3e",borderRadius:6,
          width:32,height:28,color:"#888",fontSize:16,cursor:"pointer",fontFamily:"monospace"}}>+</button>
        <div style={{color:"#333",fontSize:10,alignSelf:"center",marginLeft:4}}>Tap node to inspect</div>
      </div>

      {/* Tree canvas — scrollable */}
      <div style={{flex:1,overflowY:"auto",overflowX:"auto",padding:"16px 8px 8px"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:"max-content"}}>

          {/* ── TRUNK (vertical chain, centred) ── */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:4}}>
            <div style={{color:"#C8A96E",fontSize:9*zoom,letterSpacing:2,textAlign:"center",
              marginBottom:6*zoom,opacity:0.7}}>TRUNK</div>
            {trunk.map((node,i)=>(
              <div key={node.id} style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                {i>0&&<Connector color={worldTree.includes(trunk[i-1].id)?"#C8A96E":"#2a2a3e"} vertical={true}/>}
                <NodeCircle node={node} showLabel={true}/>
              </div>
            ))}
          </div>

          {/* Trunk→Branches connector */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",
            margin:`${4*zoom}px 0`}}>
            <div style={{width:1.5,height:16*zoom,
              background:trunkComplete?"#C8A96E":"#1e1e2e",opacity:0.5}}/>
            <div style={{color:trunkComplete?"#C8A96E":"#333",
              fontSize:8*zoom,letterSpacing:2,margin:`${3*zoom}px 0`,
              textAlign:"center",whiteSpace:"nowrap"}}>
              {trunkComplete?"BRANCHES UNLOCKED":"COMPLETE TRUNK TO UNLOCK BRANCHES"}
            </div>
            <div style={{width:1.5,height:8*zoom,
              background:trunkComplete?"#C8A96E":"#1e1e2e",opacity:0.5}}/>
          </div>

          {/* ── BRANCHES (5 columns side by side) ── */}
          <div style={{display:"flex",gap:8*zoom,alignItems:"flex-start",
            opacity:trunkComplete?1:0.3,transition:"opacity 0.4s",
            pointerEvents:trunkComplete?"auto":"none"}}>
            {branchOrder.map(b=>{
              const meta=branchMeta[b];
              const nodes=branches[b];
              const ownedCount=nodes.filter(n=>worldTree.includes(n.id)).length;
              return (
                <div key={b} style={{display:"flex",flexDirection:"column",alignItems:"center",
                  minWidth:NODE_SIZE+8}}>
                  {/* Branch label */}
                  <div style={{color:meta.color,fontSize:8*zoom,letterSpacing:1,
                    marginBottom:6*zoom,textAlign:"center",whiteSpace:"nowrap"}}>
                    {meta.icon} {zoom>=0.8?meta.label:""}
                  </div>
                  <div style={{color:`${meta.color}66`,fontSize:7*zoom,marginBottom:4*zoom}}>
                    {ownedCount}/{nodes.length}
                  </div>
                  {/* Branch nodes vertical */}
                  {nodes.map((node,i)=>(
                    <div key={node.id} style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                      {i>0&&<Connector color={worldTree.includes(nodes[i-1].id)?meta.color:"#2a2a3e"} vertical={true}/>}
                      <NodeCircle node={node} showLabel={true}/>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={{height:20}}/>
        </div>
      </div>

      {/* Info panel — fixed at bottom when node selected */}
      {selectedNode&&(
        <>
          <div onClick={()=>setSelected(null)}
            style={{position:"fixed",inset:0,zIndex:99}}/>
          <div style={{
            position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
            width:"100%",maxWidth:480,zIndex:100,
            background:"#0e0e1a",borderTop:`2px solid ${selColor}`,
            borderRadius:"14px 14px 0 0",padding:"16px 20px 28px",
          }}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
              <div style={{fontSize:32}}>{selState==="locked"?"🔒":selectedNode.icon}</div>
              <div style={{flex:1}}>
                <div style={{color:selColor,fontSize:16,marginBottom:3}}>{selectedNode.name}</div>
                <div style={{color:"#777",fontSize:12,lineHeight:1.5}}>{selectedNode.description}</div>
                {selectedNode.unlocks&&!worldTree.includes(selectedNode.id)&&(
                  <div style={{color:selColor,fontSize:11,marginTop:4}}>
                    🔓 Unlocks {selectedNode.unlocks==="druid"?"Druid":"Blood Knight"} class
                  </div>
                )}
              </div>
              <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",
                color:"#555",fontSize:20,cursor:"pointer",padding:"0 4px",lineHeight:1}}>×</button>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"10px 14px",background:"#12121e",borderRadius:10}}>
              <div>
                {selState==="owned"&&<span style={{color:"#4caf6e",fontSize:13}}>✓ Unlocked</span>}
                {selState==="locked"&&(
                  <span style={{color:"#555",fontSize:13}}>
                    {!trunkComplete&&selectedNode.branch!=="trunk"
                      ?"🔒 Complete the trunk first"
                      :"🔒 Unlock the previous node first"}
                  </span>
                )}
                {(selState==="available"||selState==="unaffordable")&&(
                  <span style={{color:selState==="available"?selColor:"#555",fontSize:13}}>
                    ✨ {selectedNode.cost} XP
                    {selState==="unaffordable"&&(
                      <span style={{color:"#333",fontSize:11}}> (need {selectedNode.cost-availableXp} more)</span>
                    )}
                  </span>
                )}
              </div>
              {selState==="available"&&(
                <button onClick={()=>{onPurchase(selectedNode);setSelected(null);}} style={{
                  background:selColor,color:"#0b0b14",border:"none",borderRadius:8,
                  padding:"9px 20px",fontWeight:"bold",fontSize:14,
                  cursor:"pointer",fontFamily:"'Georgia',serif",
                }}>UNLOCK</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


function generateTale(run) {
  const cls=CLASSES[run.classKey];
  const name=run.characterName||"A hero";
  const className=run.className||cls?.name||"warrior";
  const dungeon=run.dungeon||"the dungeon";
  const rooms=run.roomsReached||1;
  const pool=RUN_TREE_POOL[run.classKey]||[];
  const nodeNames=(run.runNodes||[]).map(nid=>{
    const n=pool.find(x=>x.id===nid);
    return n?n.name:null;
  }).filter(Boolean);
  if(run.abandoned)
    return `${name} walked away from ${dungeon} at room ${rooms}, carrying ${run.xpEarned||0} hard-earned XP.`;
  if(rooms<=2)
    return `${name} the ${className} barely crossed the threshold before the dark claimed them.`;
  const killerLine=run.killedBy?`at the hands of a ${run.killedBy}`:"by the dungeon itself";
  const nodeLine=nodeNames.length>0
    ?` having mastered ${nodeNames.slice(0,-1).join(", ")}${nodeNames.length>1?" and ":""}${nodeNames.slice(-1)}.`
    :".";
  return `${name} the ${className} fell ${killerLine} in ${dungeon}${nodeLine}`;
}

function GraveyardScreen({graveyard,onBack}) {
  const sorted=[...graveyard].reverse();
  const best=graveyard.length>0?graveyard.reduce((a,b)=>(b.roomsReached||0)>(a.roomsReached||0)?b:a):null;
  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#888",
          fontSize:13,cursor:"pointer",fontFamily:"'Georgia',serif"}}>← Back</button>
        <div style={{color:"#888",fontSize:11,letterSpacing:3}}>GRAVEYARD</div>
        <div style={{color:"#444",fontSize:11}}>{graveyard.length} fallen</div>
      </div>
      <div style={{padding:"16px",overflowY:"auto"}}>
        {graveyard.length===0&&(
          <div style={{textAlign:"center",color:"#444",fontSize:13,marginTop:60,lineHeight:2}}>
            <div style={{fontSize:36,marginBottom:12}}>🪦</div>
            No one has fallen yet.<br/>
            <span style={{fontSize:11,color:"#333"}}>Their stories will be told here.</span>
          </div>
        )}
        {best&&graveyard.length>1&&(
          <div style={{marginBottom:20,padding:"12px 16px",background:"#0e0e10",
            border:"1px solid #C8A96E44",borderRadius:10}}>
            <div style={{color:"#C8A96E",fontSize:10,letterSpacing:3,marginBottom:6}}>GREATEST LEGEND</div>
            <div style={{color:"#e8d5a3",fontSize:14}}>{CLASSES[best.classKey]?.icon} {best.characterName} — {best.dungeon||"Unknown"}</div>
            <div style={{color:"#555",fontSize:11,marginTop:2}}>Room {best.roomsReached} · ✨{best.xpEarned} XP · {best.combatsWon||0} combats</div>
          </div>
        )}
        {sorted.map((run,i)=>{
          const cls=CLASSES[run.classKey];
          const color=cls?.color||"#888";
          const nodePool=RUN_TREE_POOL[run.classKey]||[];
          return (
            <div key={i} style={{border:"1px solid #1e1e2e",borderRadius:12,
              padding:"16px",marginBottom:12,background:"#0e0e1a"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{color,fontSize:16,marginBottom:2}}>{cls?.icon} {run.characterName}{run.activeTitle?" "+run.activeTitle:""}</div>
                  <div style={{color:"#555",fontSize:11}}>{run.className} · {run.dungeon||"Unknown"} · Room {run.roomsReached}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:"#C8A96E",fontSize:11}}>✨ {run.xpEarned} XP</div>
                  <div style={{color:"#333",fontSize:10,marginTop:2}}>{run.date}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:16,marginBottom:10,padding:"8px 12px",
                background:"#0b0b14",borderRadius:8}}>
                <div style={{color:"#555",fontSize:11}}>⚔️ {run.combatsWon||0} combats</div>
                <div style={{color:run.abandoned?"#888":"#e05c5c",fontSize:11}}>
                  {run.abandoned?"🚪 Abandoned":run.killedBy?`💀 ${run.killedBy}`:"💀 Unknown"}
                </div>
              </div>
              {run.runNodes&&run.runNodes.length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                  {run.runNodes.map((nid)=>{
                    const n=nodePool.find(x=>x.id===nid);
                    return n?<span key={nid} style={{fontSize:10,color,background:"#12121e",
                      border:`1px solid ${color}33`,borderRadius:4,padding:"2px 7px"}}>{n.icon} {n.name}</span>:null;
                  })}
                </div>
              )}
              <div style={{color:"#444",fontSize:12,fontStyle:"italic",lineHeight:1.5,
                borderTop:"1px solid #1a1a2a",paddingTop:10}}>
                "{generateTale(run)}"
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// GOLD STORE SCREEN
// ============================================================

function GoldStoreScreen({goldBalance,purchasedItems,runConsumables,onBuy,onBuyPermanent,onBack}) {
  const [tab,setTab]=useState("consumables");
  const [bought,setBought]=useState([...runConsumables]);
  const canBuyMore=bought.length<2;

  function buyConsumable(item){
    if(!canBuyMore||goldBalance<item.cost||bought.includes(item.id))return;
    setBought(b=>[...b,item.id]);
    onBuy(item);
  }

  function buyPermanent(item){
    if(purchasedItems.includes(item.id)||goldBalance<item.cost)return;
    onBuyPermanent(item);
  }

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#888",
          fontSize:13,cursor:"pointer",fontFamily:"'Georgia',serif"}}>← Back</button>
        <div style={{color:"#C8A96E",fontSize:11,letterSpacing:3}}>GOLD STORE</div>
        <div style={{color:"#C8A96E",fontSize:13}}>🪙 {goldBalance}</div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",background:"#0e0e1a",borderBottom:"1px solid #1e1e2e"}}>
        {[["consumables","Run Items"],["permanent","Permanent"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            flex:1,padding:"10px 0",background:"none",
            border:"none",borderBottom:`2px solid ${tab===t?"#C8A96E":"transparent"}`,
            color:tab===t?"#C8A96E":"#555",fontSize:13,cursor:"pointer",
            fontFamily:"'Georgia',serif",
          }}>{l}</button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
        {tab==="consumables"&&(
          <>
            <div style={{color:"#555",fontSize:12,marginBottom:4}}>
              Max 2 items per run. Items apply at run start.
            </div>
            {bought.length>0&&(
              <div style={{marginBottom:12,padding:"8px 12px",background:"#0e0e14",
                border:"1px solid #C8A96E33",borderRadius:8}}>
                <div style={{color:"#C8A96E",fontSize:10,letterSpacing:2,marginBottom:5}}>CARRIED INTO NEXT RUN</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {bought.map(id=>{
                    const it=STORE_CONSUMABLES.find(i=>i.id===id);
                    return it?<span key={id} style={{fontSize:11,color:"#C8A96E",background:"#1a1200",
                      border:"1px solid #C8A96E44",borderRadius:4,padding:"2px 8px"}}>{it.icon} {it.name}</span>:null;
                  })}
                </div>
              </div>
            )}
            {STORE_CONSUMABLES.map(item=>{
              const isBought=bought.includes(item.id);
              const canAfford=goldBalance>=item.cost;
              const disabled=isBought||!canAfford||(!canBuyMore&&!isBought);
              return (
                <div key={item.id} style={{
                  display:"flex",alignItems:"center",gap:12,
                  padding:"14px",marginBottom:8,borderRadius:10,
                  background:isBought?"#0e0e10":"#0e0e14",
                  border:`1px solid ${isBought?"#C8A96E44":canAfford&&canBuyMore?"#C8A96E22":"#1e1e2e"}`,
                  opacity:disabled&&!isBought?0.5:1,
                }}>
                  <div style={{fontSize:28}}>{item.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{color:isBought?"#C8A96E":"#e8d5a3",fontSize:14}}>{item.name}</div>
                    <div style={{color:"#555",fontSize:12,marginTop:2}}>{item.desc}</div>
                  </div>
                  <button onClick={()=>buyConsumable(item)} disabled={disabled}
                    style={{
                      background:isBought?"#1a1200":canAfford&&canBuyMore?"#C8A96E":"#1a1a2e",
                      color:isBought?"#C8A96E":canAfford&&canBuyMore?"#0b0b14":"#444",
                      border:"none",borderRadius:6,padding:"6px 12px",
                      fontSize:12,fontWeight:"bold",cursor:disabled?"default":"pointer",
                      fontFamily:"'Georgia',serif",whiteSpace:"nowrap",
                    }}>{isBought?"✓ Packed":`🪙 ${item.cost}`}</button>
                </div>
              );
            })}
          </>
        )}
        {tab==="permanent"&&(
          <>
            <div style={{color:"#555",fontSize:12,marginBottom:12}}>
              Permanent upgrades. Bought once, active forever.
            </div>
            {STORE_PERMANENT.map(item=>{
              const owned=purchasedItems.includes(item.id);
              const canAfford=goldBalance>=item.cost;
              return (
                <div key={item.id} style={{
                  display:"flex",alignItems:"center",gap:12,
                  padding:"14px",marginBottom:8,borderRadius:10,
                  background:owned?"#0e0e10":"#0e0e14",
                  border:`1px solid ${owned?"#C8A96E44":canAfford?"#C8A96E22":"#1e1e2e"}`,
                }}>
                  <div style={{fontSize:28}}>{item.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{color:owned?"#C8A96E":"#e8d5a3",fontSize:14}}>{item.name}</div>
                    <div style={{color:"#555",fontSize:12,marginTop:2}}>{item.desc}</div>
                  </div>
                  <button onClick={()=>!owned&&canAfford&&buyPermanent(item)} disabled={owned||!canAfford}
                    style={{
                      background:owned?"#1a1200":canAfford?"#C8A96E":"#1a1a2e",
                      color:owned?"#C8A96E":canAfford?"#0b0b14":"#444",
                      border:"none",borderRadius:6,padding:"6px 12px",
                      fontSize:12,fontWeight:"bold",cursor:owned||!canAfford?"default":"pointer",
                      fontFamily:"'Georgia',serif",whiteSpace:"nowrap",
                    }}>{owned?"✓ Owned":`🪙 ${item.cost}`}</button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TROPHY ROOM SCREEN
// ============================================================

function TrophyRoomScreen({achievements,earnedTitles,activeTitle,onSetTitle,onBack}) {
  const [activeTab,setActiveTab]=useState("all");
  const cats=["all","Survival","Combat","Progression","Secrets"];
  const filtered=activeTab==="all"?ACHIEVEMENTS:ACHIEVEMENTS.filter(a=>a.cat===activeTab);
  const unlockedCount=ACHIEVEMENTS.filter(a=>achievements[a.id]).length;

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#888",
          fontSize:13,cursor:"pointer",fontFamily:"'Georgia',serif"}}>← Back</button>
        <div style={{color:"#C8A96E",fontSize:11,letterSpacing:3}}>TROPHY ROOM</div>
        <div style={{color:"#C8A96E",fontSize:12}}>{unlockedCount}/{ACHIEVEMENTS.length}</div>
      </div>

      {/* Active title shown as info strip */}
      {activeTitle&&(
        <div style={{padding:"8px 16px",background:"#0e0e14",borderBottom:"1px solid #1e1e2e",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{color:"#444",fontSize:10,letterSpacing:3}}>ACTIVE TITLE</div>
          <div style={{color:"#C8A96E",fontSize:12,fontStyle:"italic"}}>{activeTitle}</div>
        </div>
      )}

      {/* Category tabs */}
      <div style={{display:"flex",overflowX:"auto",background:"#0e0e1a",
        borderBottom:"1px solid #1e1e2e",WebkitOverflowScrolling:"touch"}}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setActiveTab(c)} style={{
            padding:"8px 14px",background:"none",border:"none",flexShrink:0,
            borderBottom:`2px solid ${activeTab===c?"#C8A96E":"transparent"}`,
            color:activeTab===c?"#C8A96E":"#555",fontSize:12,
            cursor:"pointer",fontFamily:"'Georgia',serif",
          }}>{c}</button>
        ))}
      </div>

      {/* Achievement cards */}
      <div style={{flex:1,overflowY:"auto",padding:"12px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {filtered.map(ach=>{
            const unlocked=!!achievements[ach.id];
            return (
              <div key={ach.id} style={{
                background:unlocked?"#0e0e14":"#0a0a0e",
                border:`1px solid ${unlocked?"#C8A96E44":"#1e1e2e"}`,
                borderRadius:12,padding:"14px 12px",
                opacity:unlocked?1:0.5,
                position:"relative",overflow:"hidden",
              }}>
                {unlocked&&(
                  <div style={{position:"absolute",top:0,right:0,width:0,height:0,
                    borderStyle:"solid",borderWidth:"0 28px 28px 0",
                    borderColor:`transparent #C8A96E transparent transparent`}}/>
                )}
                <div style={{fontSize:28,marginBottom:6}}>{ach.icon}</div>
                <div style={{color:unlocked?"#e8d5a3":"#555",fontSize:12,
                  fontWeight:"bold",marginBottom:4,lineHeight:1.2}}>{ach.name}</div>
                <div style={{color:"#444",fontSize:10,lineHeight:1.4,marginBottom:6}}>
                  {unlocked?ach.desc:ach.cat==="Secrets"?"???":ach.desc}
                </div>
                {unlocked&&(
                  <div style={{color:"#C8A96E",fontSize:10,marginBottom:2}}>
                    🎖️ {ach.title}
                  </div>
                )}
                {!unlocked&&ach.cat==="Secrets"&&(
                  <div style={{color:"#333",fontSize:10,marginBottom:2}}>🎖️ ???</div>
                )}
                <div style={{color:unlocked?"#4caf6e":"#333",fontSize:10}}>
                  {unlocked?`+${ach.xp} XP earned`:`✨ ${ach.xp} XP reward`}
                </div>
                {unlocked&&achievements[ach.id].date&&(
                  <div style={{color:"#333",fontSize:9,marginTop:3}}>{achievements[ach.id].date}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TITLE SELECT (inline in class select, not separate screen)
// ============================================================


// ============================================================
// TITLE SELECT SCREEN
// ============================================================

function TitleSelectScreen({earnedTitles,activeTitle,onSetTitle,onBack}) {
  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#888",
          fontSize:13,cursor:"pointer",fontFamily:"'Georgia',serif"}}>← Back</button>
        <div style={{color:"#C8A96E",fontSize:11,letterSpacing:3}}>TITLES</div>
        <div style={{color:"#555",fontSize:11}}>{earnedTitles.length} earned</div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"20px 16px"}}>
        <div style={{color:"#555",fontSize:12,textAlign:"center",marginBottom:20}}>
          Your active title appears next to your name in combat and the graveyard.
        </div>

        {earnedTitles.length===0&&(
          <div style={{textAlign:"center",color:"#333",fontSize:13,marginTop:40}}>
            <div style={{fontSize:36,marginBottom:12}}>🎖️</div>
            No titles earned yet.<br/>
            <span style={{fontSize:11,color:"#2a2a2a"}}>Complete achievements to earn titles.</span>
          </div>
        )}

        {earnedTitles.length>0&&(
          <>
            {/* None option */}
            <button onClick={()=>onSetTitle("")} style={{
              width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
              background:!activeTitle?"#1a1200":"#0e0e1a",
              border:`1px solid ${!activeTitle?"#C8A96E":"#2a2a3e"}`,
              borderRadius:10,padding:"14px 16px",marginBottom:8,
              cursor:"pointer",fontFamily:"'Georgia',serif",
            }}>
              <div style={{textAlign:"left"}}>
                <div style={{color:!activeTitle?"#C8A96E":"#666",fontSize:14}}>No Title</div>
                <div style={{color:"#444",fontSize:11,marginTop:2}}>Display name only</div>
              </div>
              {!activeTitle&&<div style={{color:"#C8A96E",fontSize:18}}>✓</div>}
            </button>

            {/* Title options */}
            {earnedTitles.map(t=>{
              const ach=ACHIEVEMENTS.find(a=>a.title===t);
              const isActive=activeTitle===t;
              return (
                <button key={t} onClick={()=>onSetTitle(t)} style={{
                  width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                  background:isActive?"#1a1200":"#0e0e1a",
                  border:`1px solid ${isActive?"#C8A96E":"#2a2a3e"}`,
                  borderRadius:10,padding:"14px 16px",marginBottom:8,
                  cursor:"pointer",fontFamily:"'Georgia',serif",transition:"all 0.15s",
                }}>
                  <div style={{textAlign:"left"}}>
                    <div style={{color:isActive?"#C8A96E":"#e8d5a3",fontSize:16,marginBottom:3}}>
                      {t}
                    </div>
                    {ach&&(
                      <div style={{color:"#555",fontSize:11}}>
                        {ach.icon} {ach.name}
                      </div>
                    )}
                  </div>
                  {isActive&&<div style={{color:"#C8A96E",fontSize:18}}>✓</div>}
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}


// ============================================================
// PRE-RUN NODE SELECT (Chosen Path / Inherited Skill)
// ============================================================

function PreRunNodeScreen({classKey,worldTree,onStart,onSkip}) {
  const cls=CLASSES[classKey];
  const [chosen,setChosen]=useState(null);
  const hasChosenPath=worldTree.includes("chosen_path");
  const hasInherited=worldTree.includes("inherited_skill");

  // Draw options
  const options=useMemo(()=>{
    if(hasChosenPath) return drawRunTreeOptions(classKey,[]).slice(0,3);
    if(hasInherited){
      const pool=RUN_TREE_POOL[classKey]||[];
      const pick=pool[Math.floor(Math.random()*pool.length)];
      return pick?[pick]:[];
    }
    return [];
  },[classKey]);

  if(options.length===0){onStart(null);return null;}
  const tc={OFFENCE:"#e05c5c",DEFENCE:"#4caf6e",ABILITY:cls.color,SUSTAIN:"#e0a040",PASSIVE:"#9E7FD4"};

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      alignItems:"center",fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:cls.color,fontSize:11,letterSpacing:3}}>BEFORE YOU BEGIN</div>
        <div style={{color:"#555",fontSize:11}}>{cls.icon} {cls.name}</div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:24,width:"100%"}}>
        <div style={{fontSize:40,marginBottom:10}}>🌟</div>
        <div style={{color:"#C8A96E",fontSize:18,letterSpacing:2,marginBottom:4}}>
          {hasChosenPath?"Chosen Path":"Inherited Skill"}
        </div>
        <div style={{color:"#555",fontSize:13,marginBottom:4,textAlign:"center"}}>
          {hasChosenPath?"Choose a talent to carry into this run.":"Your legacy grants you a starting talent."}
        </div>
        <div style={{color:"#444",fontSize:11,marginBottom:28}}>
          {hasChosenPath?"The others are lost.":"One has been chosen for you."}
        </div>
        {!TutorialState.has("tut_runtree")&&(
        <div style={{color:"#C8A96E",fontSize:11,textAlign:"center",marginBottom:8,
          padding:"6px 12px",background:"#1a1200",borderRadius:6,border:"1px solid #C8A96E33"}}>
          Pick one power — yours for this run only
        </div>
      )}
      <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:10}}>
          {options.map((node)=>{
            const isChosen=chosen===node.id;
            const isDimmed=chosen&&!isChosen;
            return (
              <button key={node.id}
                onClick={()=>{if(!chosen){setChosen(node.id);setTimeout(()=>onStart(node.id),700);}}}
                disabled={!!chosen}
                style={{
                  background:isChosen?"#1a1a2e":isDimmed?"#0d0d16":"#0e0e1a",
                  border:`1px solid ${isChosen?cls.color:isDimmed?"#1a1a2a":"#2a2a3e"}`,
                  borderRadius:12,padding:"16px 18px",cursor:chosen?"default":"pointer",
                  textAlign:"left",fontFamily:"'Georgia',serif",
                  opacity:isDimmed?0.3:1,transition:"all 0.2s",position:"relative",
                }}>
                <div style={{position:"absolute",top:12,right:14,fontSize:9,
                  color:isDimmed?"#333":tc[node.tag]||"#888",letterSpacing:2}}>{node.tag}</div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:26}}>{node.icon}</span>
                  <div>
                    <div style={{color:isDimmed?"#444":"#e8d5a3",fontSize:15,marginBottom:3}}>{node.name}</div>
                    <div style={{color:isDimmed?"#333":"#666",fontSize:12}}>{node.description}</div>
                  </div>
                </div>
                {isChosen&&<div style={{color:cls.color,fontSize:11,marginTop:10,
                  paddingTop:8,borderTop:`1px solid ${cls.color}33`}}>✓ {node.name} — carried into this run.</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RUN SUMMARY SCREEN
// ============================================================

function RunSummaryScreen({player,roomNumber,dungeon,killedBy,abandoned,onContinue}) {
  const cls=CLASSES[player.classKey];
  const color=cls?.color||"#888";
  const nodePool=RUN_TREE_POOL[player.classKey]||[];

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:abandoned?"#0e0e1a":"#110808",
        borderBottom:`1px solid ${abandoned?"#1e1e2e":"#3e1e1e"}`,
        padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:abandoned?"#888":"#e05c5c",fontSize:11,letterSpacing:3}}>
          {abandoned?"RUN ENDED":"FALLEN"}
        </div>
        <div style={{color:"#555",fontSize:11}}>{cls?.icon} {player.characterName}</div>
      </div>

      <div style={{flex:1,padding:"24px 16px",overflowY:"auto"}}>
        {/* Hero card */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:48,marginBottom:8}}>{abandoned?"🚪":"💀"}</div>
          <div style={{color,fontSize:22,marginBottom:4}}>{player.characterName}</div>
          {player.activeTitle&&<div style={{color:"#C8A96E",fontSize:13,marginBottom:3,fontStyle:"italic"}}>{player.activeTitle}</div>}
          <div style={{color:"#666",fontSize:13}}>{cls?.name} · {dungeon?.name||"Unknown Dungeon"}</div>
          {!abandoned&&killedBy&&(
            <div style={{color:"#e05c5c",fontSize:13,marginTop:6}}>Slain by {killedBy}</div>
          )}
          {abandoned&&<div style={{color:"#888",fontSize:13,marginTop:6}}>Run abandoned</div>}
        </div>

        {/* Stats */}
        <div style={{display:"flex",gap:0,marginBottom:20,border:"1px solid #1e1e2e",borderRadius:12,overflow:"hidden"}}>
          {[
            ["⚔️","Combats",player.combatsWon||0],
            ["🏰","Rooms",roomNumber],
            ["✨","XP",player.xpEarned||0],
            ["🪙","Gold",player.gold||0],
          ].map(([icon,label,val],i)=>(
            <div key={label} style={{flex:1,textAlign:"center",padding:"14px 0",
              borderRight:i<3?"1px solid #1e1e2e":"none",background:"#0e0e1a"}}>
              <div style={{fontSize:18,marginBottom:4}}>{icon}</div>
              <div style={{color:"#e8d5a3",fontSize:16,fontWeight:"bold"}}>{val}</div>
              <div style={{color:"#444",fontSize:10,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>

        {/* Run tree nodes */}
        {player.runNodes&&player.runNodes.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:10}}>POWERS GAINED THIS RUN</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {player.runNodes.map(nid=>{
                const n=nodePool.find(x=>x.id===nid);
                return n?(
                  <div key={nid} style={{display:"flex",alignItems:"center",gap:6,
                    background:"#0e0e1a",border:`1px solid ${color}33`,borderRadius:8,
                    padding:"8px 12px"}}>
                    <span style={{fontSize:16}}>{n.icon}</span>
                    <div>
                      <div style={{color,fontSize:12}}>{n.name}</div>
                      <div style={{color:"#444",fontSize:10}}>{n.description}</div>
                    </div>
                  </div>
                ):null;
              })}
            </div>
          </div>
        )}

        {/* Epitaph */}
        <div style={{padding:"16px",background:"#0e0e1a",border:"1px solid #1e1e2e",
          borderRadius:10,textAlign:"center",marginBottom:24}}>
          <div style={{color:"#444",fontSize:11,fontStyle:"italic",lineHeight:1.6}}>
            "{generateTale({classKey:player.classKey,characterName:player.characterName,
              className:cls?.name,dungeon:dungeon?.name,roomsReached:roomNumber,
              combatsWon:player.combatsWon,runNodes:player.runNodes,
              xpEarned:player.xpEarned,killedBy,abandoned})}"
          </div>
        </div>
      </div>

      <div style={{padding:"16px",background:"#0e0e1a",borderTop:"1px solid #1e1e2e"}}>
        <button onClick={onContinue} style={{
          width:"100%",background:abandoned?"#1a1a2e":"#e05c5c",
          color:abandoned?"#e8d5a3":"#fff",border:"none",borderRadius:8,
          padding:"14px 0",fontSize:14,fontWeight:"bold",cursor:"pointer",
          letterSpacing:2,fontFamily:"'Georgia',serif",
        }}>{abandoned?"RETURN TO CAMP":"BEGIN AGAIN"}</button>
      </div>
    </div>
  );
}

// ============================================================
// VICTORY SCREEN
// ============================================================

function VictoryScreen({player,totalXp,onContinue}) {
  const cls=CLASSES[player.classKey];
  const color=cls?.color||"#C8A96E";
  const nodePool=RUN_TREE_POOL[player.classKey]||[];
  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e1a0e",borderBottom:"1px solid #4caf6e44",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:"#4caf6e",fontSize:11,letterSpacing:3}}>VICTORY</div>
        <div style={{color:"#555",fontSize:11}}>{cls?.icon} {player.characterName}</div>
      </div>

      <div style={{flex:1,padding:"24px 16px",overflowY:"auto",textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:12}}>🏆</div>
        <div style={{color:"#C8A96E",fontSize:24,letterSpacing:3,marginBottom:6}}>
          ALL DUNGEONS CONQUERED
        </div>
        <div style={{color:color,fontSize:16,marginBottom:2}}>{player.characterName}{player.activeTitle?" "+player.activeTitle:""}  the {cls?.name}</div>
        <div style={{color:"#555",fontSize:13,marginBottom:28,lineHeight:1.6}}>
          Five dungeons fell before your blade.<br/>
          The darkness recedes — for now.
        </div>

        <div style={{display:"flex",gap:0,marginBottom:24,border:"1px solid #4caf6e44",borderRadius:12,overflow:"hidden"}}>
          {[["⚔️","Combats",player.combatsWon||0],["✨","XP Earned",player.xpEarned||0],
            ["🪙","Gold",player.gold||0],["🏰","Dungeons",5]].map(([icon,label,val],i)=>(
            <div key={label} style={{flex:1,textAlign:"center",padding:"14px 0",
              borderRight:i<3?"1px solid #1e1e2e":"none",background:"#0e0e1a"}}>
              <div style={{fontSize:18,marginBottom:4}}>{icon}</div>
              <div style={{color:"#e8d5a3",fontSize:16,fontWeight:"bold"}}>{val}</div>
              <div style={{color:"#444",fontSize:10,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>

        {player.runNodes&&player.runNodes.length>0&&(
          <div style={{marginBottom:24,textAlign:"left"}}>
            <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:10}}>POWERS THIS RUN</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {player.runNodes.map(nid=>{
                const n=nodePool.find(x=>x.id===nid);
                return n?<span key={nid} style={{fontSize:11,color:color,background:"#0e0e1a",
                  border:`1px solid ${color}33`,borderRadius:6,padding:"4px 10px"}}>{n.icon} {n.name}</span>:null;
              })}
            </div>
          </div>
        )}

        <div style={{padding:"16px",background:"#0e0e1a",border:"1px solid #4caf6e33",
          borderRadius:10,marginBottom:8}}>
          <div style={{color:"#4caf6e",fontSize:12,marginBottom:4}}>✨ {player.xpEarned} XP banked to World Tree</div>
          <div style={{color:"#555",fontSize:11}}>Total XP: {totalXp+(player.xpEarned||0)}</div>
        </div>
      </div>

      <div style={{padding:"16px",background:"#0e0e1a",borderTop:"1px solid #4caf6e33"}}>
        <button onClick={onContinue} style={{
          width:"100%",background:"#4caf6e",color:"#0b0b14",border:"none",borderRadius:8,
          padding:"14px 0",fontSize:14,fontWeight:"bold",cursor:"pointer",
          letterSpacing:2,fontFamily:"'Georgia',serif",
        }}>RETURN TO LEGEND</button>
      </div>
    </div>
  );
}


// ============================================================
// WORLD MAP SCREEN
// ============================================================

function WorldMapScreen({player,dungeons,onEnter,onBack,showBossPreview}) {
  const cls=CLASSES[player.classKey];
  const currentIdx=player.dungeonIndex||0;
  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        {onBack&&<button onClick={onBack} style={{background:"none",border:"none",color:"#888",
          fontSize:13,cursor:"pointer",fontFamily:"'Georgia',serif"}}>← Back</button>}
        <div style={{color:"#C8A96E",fontSize:11,letterSpacing:3}}>THE DUNGEON MAP</div>
        <div style={{color:"#555",fontSize:11}}>{cls.icon} {player.characterName}</div>
      </div>

      <div style={{flex:1,padding:"20px 16px",overflowY:"auto"}}>
        <div style={{marginBottom:16,padding:"12px 16px",background:"#0e0e1a",
          border:"1px solid #1e1e2e",borderRadius:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <div style={{color:"#e8d5a3",fontSize:13}}>❤️ {player.hp}/{player.maxHp} HP</div>
            <div style={{color:"#C8A96E",fontSize:13}}>✨{player.xpEarned} 🪙{player.gold}</div>
          </div>
          <div style={{width:"100%",background:"#1a1a2a",borderRadius:4,height:6}}>
            <div style={{width:`${Math.max(0,Math.min(100,(player.hp/player.maxHp)*100))}%`,
              height:"100%",borderRadius:4,background:"#4caf6e",transition:"width 0.3s"}}/>
          </div>
        </div>

        {DUNGEONS.map((d,i)=>{
          const isCompleted=i<currentIdx;
          const isCurrent=i===currentIdx;
          const isLocked=i>currentIdx;
          return (
            <div key={d.id} style={{
              border:`1px solid ${isCurrent?d.color:isCompleted?"#2a2a3e":"#1a1a2a"}`,
              borderRadius:12,padding:"16px",marginBottom:10,
              background:isCurrent?"#0e0e14":isCompleted?"#0b0b10":"#0a0a10",
              opacity:isLocked?0.4:1,
            }}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:32}}>{isCompleted?"✅":isLocked?"🔒":d.icon}</div>
                <div style={{flex:1}}>
                  <div style={{color:isCurrent?d.color:isCompleted?"#555":"#333",
                    fontSize:15,marginBottom:3}}>{d.name}</div>
                  <div style={{color:"#444",fontSize:12}}>{d.description}</div>
                  <div style={{color:"#333",fontSize:10,marginTop:4}}>
                    {d.rooms} rooms · Boss: {d.boss.name}
                    {showBossPreview&&isCurrent&&(
                      <span style={{color:"#6EA8C8"}}> · {d.boss.hp} HP · {d.boss.specialDesc}</span>
                    )}
                  </div>
                </div>
                {isCurrent&&(
                  <div style={{color:d.color,fontSize:10,letterSpacing:2,
                    border:`1px solid ${d.color}44`,borderRadius:4,padding:"3px 8px"}}>
                    CURRENT
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{padding:"16px",background:"#0e0e1a",borderTop:"1px solid #1e1e2e"}}>
        {currentIdx<DUNGEONS.length&&onEnter&&(
          <button onClick={onEnter} style={{
            width:"100%",background:DUNGEONS[currentIdx].color,color:"#0b0b14",
            border:"none",borderRadius:8,padding:"14px 0",fontWeight:"bold",
            fontSize:14,cursor:"pointer",letterSpacing:2,fontFamily:"'Georgia',serif",
          }}>ENTER {DUNGEONS[currentIdx].name.toUpperCase()} →</button>
        )}
        {currentIdx<DUNGEONS.length&&!onEnter&&(
          <div style={{textAlign:"center",color:"#555",fontSize:12,padding:"8px 0"}}>
            Complete the current dungeon to advance.
          </div>
        )}
        {currentIdx>=DUNGEONS.length&&(
          <div style={{textAlign:"center",color:"#C8A96E",fontSize:16,letterSpacing:2}}>
            ✨ ALL DUNGEONS CONQUERED ✨
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// RUN TREE SCREEN
// ============================================================

function RunTreeScreen({player,options,dungeonName,onChoice}) {
  const cls=CLASSES[player.classKey];
  const nodes=options||[];
  const [chosen,setChosen]=useState(null);
  const tc={OFFENCE:"#e05c5c",DEFENCE:"#4caf6e",ABILITY:cls.color,SUSTAIN:"#e0a040",PASSIVE:"#9E7FD4"};

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      alignItems:"center",fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:cls.color,fontSize:11,letterSpacing:3}}>DUNGEON COMPLETE</div>
        <div style={{color:"#555",fontSize:11}}>{cls.icon} {player.characterName}</div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:24,width:"100%"}}>
        <div style={{fontSize:40,marginBottom:10}}>🌟</div>
        <div style={{color:"#C8A96E",fontSize:18,letterSpacing:2,marginBottom:4}}>Power Grows</div>
        <div style={{color:"#444",fontSize:11,marginBottom:24}}>Choose one. The others are lost.</div>
        {player.runNodes?.length>0&&(
          <div style={{width:"100%",maxWidth:360,marginBottom:16,padding:"10px 14px",
            background:"#0e0e1a",border:"1px solid #1e1e2e",borderRadius:10}}>
            <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:6}}>ACTIVE THIS RUN</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {player.runNodes.map((nid)=>{
                const n=(RUN_TREE_POOL[player.classKey]||[]).find(x=>x.id===nid);
                return n?<span key={nid} style={{fontSize:11,color:"#777",background:"#1a1a2e",
                  borderRadius:4,padding:"2px 7px"}}>{n.icon} {n.name}</span>:null;
              })}
            </div>
          </div>
        )}
        <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:10}}>
          {nodes.map((node)=>{
            const isChosen=chosen===node.id;
            const isDimmed=chosen&&!isChosen;
            return (
              <button key={node.id} onClick={()=>{if(!chosen){setChosen(node.id);setTimeout(()=>onChoice(node.id),700);}}}
                disabled={!!chosen} style={{
                background:isChosen?"#1a1a2e":isDimmed?"#0d0d16":"#0e0e1a",
                border:`1px solid ${isChosen?cls.color:isDimmed?"#1a1a2a":"#2a2a3e"}`,
                borderRadius:12,padding:"16px 18px",cursor:chosen?"default":"pointer",
                textAlign:"left",fontFamily:"'Georgia',serif",
                opacity:isDimmed?0.3:1,transition:"all 0.2s",position:"relative",
              }}>
                <div style={{position:"absolute",top:12,right:14,fontSize:9,
                  color:isDimmed?"#333":tc[node.tag]||"#888",letterSpacing:2}}>{node.tag}</div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:26}}>{node.icon}</span>
                  <div>
                    <div style={{color:isDimmed?"#444":"#e8d5a3",fontSize:15,marginBottom:3}}>{node.name}</div>
                    <div style={{color:isDimmed?"#333":"#666",fontSize:12}}>{node.description}</div>
                  </div>
                </div>
                {isChosen&&<div style={{color:cls.color,fontSize:11,marginTop:10,
                  paddingTop:8,borderTop:`1px solid ${cls.color}33`}}>✓ {node.name} unlocked.</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHRINE ROOM
// ============================================================

function ShrineRoom({player,onChoice,roomNumber}) {
  const cls=CLASSES[player.classKey];
  const [chosen,setChosen]=useState(null);
  const [bought,setBought]=useState([]);

  const statOptions=[
    {id:"atk",label:"+3 Attack",cost:20,icon:"⚔️",apply:(p)=>{p.attack+=3;}},
    {id:"def",label:"+3 Defence",cost:20,icon:"🛡️",apply:(p)=>{p.defense+=3;}},
    {id:"hp", label:"+15 Max HP",cost:30,icon:"❤️",apply:(p)=>{p.maxHp+=15;p.hp=Math.min(p.maxHp,p.hp+15);}},
  ];

  const canAffordTier=player.xpEarned>=50;
  const tierDone=chosen==="tier";

  function handleStat(opt) {
    if (bought.includes(opt.id)||player.xpEarned<opt.cost) return;
    setBought(b=>[...b,opt.id]);
    onChoice("stat",opt);
  }

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:"#9E7FD4",fontSize:11,letterSpacing:3}}>ROOM {roomNumber}</div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{color:"#C8A96E",fontSize:11}}>✨{player.xpEarned}</div>
          <div style={{color:"#555",fontSize:11}}>{cls.icon} {player.characterName}</div>
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:24,width:"100%"}}>
        <div style={{fontSize:44,marginBottom:10}}>🔮</div>
        <div style={{color:"#9E7FD4",fontSize:20,letterSpacing:2,marginBottom:4}}>Ancient Shrine</div>
        <div style={{color:"#555",fontSize:13,marginBottom:4,textAlign:"center"}}>
          A pulsing rune carved into stone. Power hums within.
        </div>
        <div style={{color:"#666",fontSize:12,marginBottom:24}}>✨ {player.xpEarned} XP available</div>

        <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:10}}>
          {/* Stat purchases — can buy multiple */}
          <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:4}}>SPEND XP — PERMANENT STATS</div>
          {statOptions.map((opt)=>{
            const isBought=bought.includes(opt.id);
            const canAfford=player.xpEarned>=opt.cost&&!isBought;
            return (
              <button key={opt.id} onClick={()=>handleStat(opt)} disabled={!canAfford} style={{
                background:isBought?"#111118":canAfford?"#0e0e18":"#0a0a12",
                border:`1px solid ${isBought?"#2a2a3e":canAfford?"#9E7FD444":"#1a1a2a"}`,
                borderRadius:10,padding:"12px 16px",
                cursor:canAfford?"pointer":"default",
                textAlign:"left",fontFamily:"'Georgia',serif",
                opacity:isBought?0.5:canAfford?1:0.4,
                display:"flex",alignItems:"center",gap:12,
              }}>
                <span style={{fontSize:22}}>{opt.icon}</span>
                <div style={{flex:1}}>
                  <div style={{color:isBought?"#555":canAfford?"#e8d5a3":"#444",fontSize:14}}>{opt.label}</div>
                </div>
                <div style={{color:isBought?"#4caf6e":canAfford?"#9E7FD4":"#333",fontSize:12,fontWeight:"bold"}}>
                  {isBought?"✓":`✨${opt.cost}`}
                </div>
              </button>
            );
          })}

          {/* Extra tier choice */}
          <div style={{color:"#444",fontSize:10,letterSpacing:3,margin:"12px 0 4px"}}>SPEND XP — BONUS POWER</div>
          <button onClick={()=>{if(!canAffordTier||tierDone)return;setChosen("tier");onChoice("bonus_node",null);}} disabled={!canAffordTier||tierDone} style={{
            background:tierDone?"#111118":canAffordTier?"#0e0a1a":"#0a0a12",
            border:`1px solid ${tierDone?"#2a2a3e":canAffordTier?"#C8A96E44":"#1a1a2a"}`,
            borderRadius:10,padding:"14px 16px",
            cursor:canAffordTier&&!tierDone?"pointer":"default",
            textAlign:"left",fontFamily:"'Georgia',serif",
            opacity:tierDone?0.5:canAffordTier?1:0.4,
            display:"flex",alignItems:"center",gap:12,
          }}>
            <span style={{fontSize:22}}>🌟</span>
            <div style={{flex:1}}>
              <div style={{color:tierDone?"#555":canAffordTier?"#e8d5a3":"#444",fontSize:14}}>Bonus Run Tree Choice</div>
              <div style={{color:"#555",fontSize:12,marginTop:2}}>Choose an additional upgrade from any unlocked tier.</div>
            </div>
            <div style={{color:tierDone?"#4caf6e":canAffordTier?"#C8A96E":"#333",fontSize:12,fontWeight:"bold"}}>
              {tierDone?"✓":"✨50"}
            </div>
          </button>
        </div>

        <button onClick={()=>onChoice("leave",null)} style={{
          marginTop:24,background:"#1a1a2e",border:"1px solid #3a3a5e",
          borderRadius:8,padding:"12px 32px",color:"#e8d5a3",
          fontSize:14,cursor:"pointer",letterSpacing:2,fontFamily:"'Georgia',serif",
        }}>MOVE ON →</button>
      </div>
    </div>
  );
}

// ============================================================
// REST ROOM
// ============================================================

function RestRoom({player,onChoice,roomNumber,worldTree}) {
  const cls=CLASSES[player.classKey];
  const wt=worldTree||[];
  const baseHealPct=wt.includes("herbalist")?0.5:0.4;
  const extraHealPct=wt.includes("wild_growth")?0.1:wt.includes("wild_roots")?0.05:0;
  const missingHp=player.maxHp-player.hp;
  const healAmt=Math.min(Math.floor(player.maxHp*(baseHealPct+extraHealPct)),missingHp);
  const basePct=wt.includes("forager")?0.15:0.20;
  const cost=ritualCost(player.maxHp,player.ritualCount||0,basePct);
  const canRitual=player.hp>cost+1;
  const [chosen,setChosen]=useState(null);

  const options=[
    {key:"heal",icon:"🌿",title:"Rest & Recover",
      label:missingHp===0?"Already at full health.":`Restore ${healAmt} HP.${extraHealPct>0?" ("+( wt.includes("wild_growth")?"Wild Growth":"Wild Roots")+" bonus)":""}`,
      color:"#4caf6e",bg:"#0a140a",border:"#4caf6e55",
      disabled:missingHp===0,tag:null,confirm:`✓ +${healAmt} HP.`},
    {key:"frenzy",icon:"⚔️",title:"Push Through",
      label:"+6 attack for first 2 turns of next combat.",
      color:"#e0a040",bg:"#1a1200",border:"#e0a04055",
      disabled:false,tag:"FRENZY",confirm:"✓ Frenzy awaits."},
    {key:"ritual",icon:"🩸",title:"Blood Ritual",
      label:canRitual?`Sacrifice ${cost} HP — +2 ATK, +2 DEF permanently. (Ritual ${(player.ritualCount||0)+1})`:
        "Not enough HP.",
      color:"#e05c5c",bg:"#1a0808",border:"#e05c5c55",
      disabled:!canRitual,tag:"RISK",confirm:`✓ −${cost} HP, +2 ATK, +2 DEF.`},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      alignItems:"center",fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:cls.color,fontSize:11,letterSpacing:3}}>ROOM {roomNumber}</div>
        <div style={{color:"#555",fontSize:11}}>{cls.icon} {player.characterName}</div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:24,width:"100%"}}>
        <div style={{fontSize:52,marginBottom:10}}>🏕️</div>
        <div style={{color:"#C8A96E",fontSize:20,letterSpacing:2,marginBottom:4}}>Campfire</div>
        <div style={{color:"#555",fontSize:13,marginBottom:4,textAlign:"center"}}>The fire crackles. A choice must be made.</div>
        <div style={{color:"#666",fontSize:12,marginBottom:28}}>❤️ {player.hp} / {player.maxHp} HP</div>
        <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:10}}>
          {options.map((opt)=>{
            const isChosen=chosen===opt.key;
            const isDimmed=chosen&&!isChosen;
            return (
              <button key={opt.key} onClick={()=>{if(!opt.disabled&&!chosen){setChosen(opt.key);setTimeout(()=>onChoice(opt.key),700);}}}
                disabled={opt.disabled||!!chosen} style={{
                background:isChosen?opt.bg:isDimmed||opt.disabled?"#0d0d16":opt.bg,
                border:`1px solid ${isChosen?opt.color:isDimmed||opt.disabled?"#1a1a2a":opt.border}`,
                borderRadius:12,padding:"16px 18px",
                cursor:opt.disabled||chosen?"default":"pointer",
                textAlign:"left",fontFamily:"'Georgia',serif",transition:"all 0.2s",
                opacity:isDimmed?0.3:opt.disabled?0.4:1,position:"relative",
              }}>
                {opt.tag&&!isDimmed&&<div style={{position:"absolute",top:10,right:12,
                  fontSize:9,color:opt.color,letterSpacing:2,fontWeight:"bold"}}>{opt.tag}</div>}
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:22}}>{opt.icon}</span>
                  <div>
                    <div style={{color:isDimmed||opt.disabled?"#444":opt.color,fontSize:14,marginBottom:3}}>{opt.title}</div>
                    <div style={{color:"#555",fontSize:12}}>{opt.label}</div>
                  </div>
                </div>
                {isChosen&&<div style={{color:opt.color,fontSize:11,marginTop:8,
                  paddingTop:8,borderTop:`1px solid ${opt.color}33`}}>{opt.confirm}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MERCHANT ROOM
// ============================================================

function MerchantRoom({player,item,onChoice,roomNumber}) {
  const cls=CLASSES[player.classKey];
  const healAmt=Math.min(Math.floor(player.maxHp*0.4),player.maxHp-player.hp);
  const missingHp=player.maxHp-player.hp;
  const goldToXp=Math.floor(player.gold/2);
  const [chosen,setChosen]=useState(null);

  const opts=[
    {key:"item",  icon:item.icon, title:item.name,    desc:item.description,    color:"#C8A96E", disabled:false},
    {key:"heal",  icon:"🧪",      title:missingHp===0?"Already at full health":"Healing Draught",
      desc:missingHp===0?"Nothing to restore.":`Restore ${healAmt} HP.`,       color:"#4caf6e", disabled:missingHp===0},
    {key:"convert",icon:"✨",     title:"Convert Gold → XP",
      desc:player.gold>=2?`Spend ${player.gold} gold — gain ${goldToXp} XP.`:"Need at least 2 gold.",
      color:"#9E7FD4", disabled:player.gold<2},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:cls.color,fontSize:11,letterSpacing:3}}>ROOM {roomNumber}</div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{color:"#C8A96E",fontSize:11}}>🪙{player.gold}</div>
          <div style={{color:"#555",fontSize:11}}>{cls.icon} {player.characterName}</div>
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:24,width:"100%"}}>
        <div style={{fontSize:44,marginBottom:10}}>🏪</div>
        <div style={{color:"#C8A96E",fontSize:20,letterSpacing:2,marginBottom:4}}>Wandering Merchant</div>
        <div style={{color:"#555",fontSize:13,marginBottom:20,textAlign:"center"}}>A cloaked figure steps from the shadows.</div>
        <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:10}}>
          {opts.map((opt)=>{
            const isChosen=chosen===opt.key;
            const isDimmed=chosen&&!isChosen;
            return (
              <button key={opt.key} onClick={()=>{if(!opt.disabled&&!chosen){setChosen(opt.key);onChoice(opt.key,item);}}}
                disabled={opt.disabled||!!chosen} style={{
                background:isChosen?"#1a1a2e":isDimmed||opt.disabled?"#0d0d16":"#0e0e14",
                border:`1px solid ${isChosen?opt.color:isDimmed||opt.disabled?"#1a1a2a":`${opt.color}44`}`,
                borderRadius:12,padding:"16px 18px",
                cursor:opt.disabled||chosen?"default":"pointer",
                textAlign:"left",fontFamily:"'Georgia',serif",transition:"all 0.2s",
                opacity:isDimmed?0.3:opt.disabled?0.4:1,
              }}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:26}}>{opt.icon}</span>
                  <div>
                    <div style={{color:isDimmed||opt.disabled?"#444":opt.color,fontSize:14}}>{opt.title}</div>
                    <div style={{color:"#555",fontSize:12,marginTop:2}}>{opt.desc}</div>
                  </div>
                </div>
                {isChosen&&<div style={{color:opt.color,fontSize:11,marginTop:8,
                  paddingTop:8,borderTop:`1px solid ${opt.color}33`}}>✓ Taken</div>}
              </button>
            );
          })}
        </div>
        {chosen&&(
          <button onClick={()=>onChoice("leave",null)} style={{
            marginTop:24,background:"#1a1a2e",border:"1px solid #3a3a5e",
            borderRadius:8,padding:"12px 32px",color:"#e8d5a3",
            fontSize:14,cursor:"pointer",letterSpacing:2,fontFamily:"'Georgia',serif",
          }}>MOVE ON →</button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// EVENT ROOM
// ============================================================

function EventRoom({player,event,onChoice,roomNumber,seerPreview}) {
  const cls=CLASSES[player.classKey];
  const [chosen,setChosen]=useState(null);
  const [reveal,setReveal]=useState(null); // for gamble/seer reveals
  const isAuto=event.choiceA?.auto;

  useEffect(()=>{
    if(isAuto){
      setTimeout(()=>{setChosen("A");onChoice("A",event);},800);
    }
  },[]);

  function pick(side) {
    if(chosen)return;
    const choice=side==="A"?event.choiceA:event.choiceB;
    if(!choice||choice.skip){setChosen(side);setTimeout(()=>onChoice(side,event),600);return;}
    if(choice.gamble){
      const win=Math.random()<0.6;
      setReveal(win?"win":"lose");
      setChosen(side);
      setTimeout(()=>onChoice(side,event,win?"win":"lose"),1000);
      return;
    }
    if(choice.gold&&choice.gold<0&&player.gold<Math.abs(choice.gold)){return;} // can't afford
    setChosen(side);
    setTimeout(()=>onChoice(side,event),700);
  }

  const choiceAAffordable=!event.choiceA?.gold||event.choiceA.gold>=0||(player.gold>=Math.abs(event.choiceA.gold));
  const choiceBAffordable=!event.choiceB?.gold||event.choiceB.gold>=0||(player.gold>=Math.abs(event.choiceB.gold));

  const roomTypeIcons={"combat":"⚔️","rest":"🏕️","merchant":"🏪","shrine":"🔮","event":"✨","boss":"💀"};

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>
      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:"#C8A96E",fontSize:11,letterSpacing:3}}>ROOM {roomNumber} — EVENT</div>
        <div style={{color:"#555",fontSize:11}}>{cls.icon} {player.characterName}</div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:24,width:"100%"}}>
        <div style={{fontSize:52,marginBottom:12}}>{event.icon}</div>
        <div style={{color:"#C8A96E",fontSize:18,letterSpacing:1,marginBottom:8,textAlign:"center"}}>
          {event.title}
        </div>
        <div style={{color:"#666",fontSize:13,marginBottom:28,textAlign:"center",lineHeight:1.6,maxWidth:320}}>
          {event.description}
        </div>

        {/* Seer preview */}
        {seerPreview&&seerPreview.length>0&&(
          <div style={{marginBottom:16,padding:"10px 16px",background:"#0e0e1a",border:"1px solid #9E7FD433",
            borderRadius:10,width:"100%",maxWidth:340}}>
            <div style={{color:"#9E7FD4",fontSize:10,letterSpacing:3,marginBottom:6}}>SEER'S VISION</div>
            <div style={{display:"flex",gap:12}}>
              {seerPreview.map((t,i)=>(
                <div key={i} style={{textAlign:"center"}}>
                  <div style={{fontSize:20}}>{roomTypeIcons[t]||"❓"}</div>
                  <div style={{color:"#555",fontSize:9,marginTop:2}}>Room {roomNumber+i+1}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{width:"100%",maxWidth:340,display:"flex",flexDirection:"column",gap:10}}>
          {/* Choice A */}
          {event.choiceA&&(()=>{
            const c=event.choiceA;
            const isChosen=chosen==="A";
            const isDimmed=chosen&&!isChosen;
            const affordable=choiceAAffordable;
            return (
              <button onClick={()=>affordable&&!isAuto&&pick("A")} disabled={!!chosen||isAuto}
                style={{
                  background:isChosen?"#1a1200":isDimmed||!affordable?"#0d0d16":"#12120e",
                  border:`1px solid ${isChosen?"#C8A96E":isDimmed||!affordable?"#1a1a2a":"#C8A96E44"}`,
                  borderRadius:12,padding:"16px 18px",
                  cursor:chosen||isAuto||!affordable?"default":"pointer",
                  textAlign:"left",fontFamily:"'Georgia',serif",
                  opacity:isDimmed?0.3:!affordable?0.4:1,transition:"all 0.2s",
                }}>
                <div style={{color:isChosen?"#C8A96E":isDimmed||!affordable?"#444":"#e8d5a3",
                  fontSize:14,marginBottom:4}}>{c.label}</div>
                <div style={{color:"#555",fontSize:12}}>{c.desc}</div>
                {isChosen&&reveal&&(
                  <div style={{color:reveal==="win"?"#4caf6e":"#e05c5c",fontSize:12,marginTop:6,
                    paddingTop:6,borderTop:"1px solid #2a2a3e"}}>
                    {reveal==="win"?"✓ The concoction heals you!":"✗ It burns through your veins!"}
                  </div>
                )}
                {isChosen&&!reveal&&<div style={{color:"#C8A96E",fontSize:11,marginTop:6}}>✓ Chosen</div>}
              </button>
            );
          })()}

          {/* Choice B */}
          {event.choiceB&&(()=>{
            const c=event.choiceB;
            const isChosen=chosen==="B";
            const isDimmed=chosen&&!isChosen;
            const affordable=choiceBAffordable;
            return (
              <button onClick={()=>affordable&&pick("B")} disabled={!!chosen}
                style={{
                  background:isChosen?"#0e1a0e":isDimmed||!affordable?"#0d0d16":"#0a140a",
                  border:`1px solid ${isChosen?"#4caf6e":isDimmed||!affordable?"#1a1a2a":"#4caf6e33"}`,
                  borderRadius:12,padding:"16px 18px",
                  cursor:chosen||!affordable?"default":"pointer",
                  textAlign:"left",fontFamily:"'Georgia',serif",
                  opacity:isDimmed?0.3:!affordable?0.4:1,transition:"all 0.2s",
                }}>
                <div style={{color:isChosen?"#4caf6e":isDimmed||!affordable?"#444":"#aaa",
                  fontSize:14,marginBottom:4}}>{c.label}</div>
                <div style={{color:"#555",fontSize:12}}>{c.desc}</div>
                {isChosen&&<div style={{color:"#4caf6e",fontSize:11,marginTop:6}}>✓ Chosen</div>}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMBAT SCREEN
// ============================================================

function CombatScreen({player:initialPlayer,room:initialRoom,onVictory,onDeath,onAbandon,onViewMap,roomNumber,worldTree,onUnlockAchievement,purchasedItems}) {
  const [player,setPlayer]=useState(()=>JSON.parse(JSON.stringify(initialPlayer)));
  const [enemies,setEnemies]=useState(()=>JSON.parse(JSON.stringify(initialRoom.enemies)));
  const [selectedEnemy,setSelectedEnemy]=useState(0);
  const [log,setLog]=useState(["⚔️ Combat begins!"]);
  const [phase,setPhase]=useState("player");
  const [showPause,setShowPause]=useState(false);
  const locked=useRef(false);

  const cls=CLASSES[player.classKey];
  const showNextAction=(worldTree||[]).includes("dungeon_lore");
  const living=enemies.filter(e=>e.hp>0);
  const target=living[Math.min(selectedEnemy,living.length-1)]||living[0];

  // Tutorial refs
  const basicAttackRef=useRef(null);
  const abilityRef=useRef(null);
  const nextRoomRef=useRef(null);

  // Tutorial spots
  const tutBasic=useTutorialSpot("tut_basic",basicAttackRef,"Tap to attack","down",[phase]);
  const tutAbility=useTutorialSpot("tut_ability",abilityRef,"Your abilities","down",[phase,tutBasic.active]);
  const tutNextRoom=useTutorialSpot("tut_nextroom",nextRoomRef,"Advance to next room","up",[phase]);

  useEffect(()=>{
    if(selectedEnemy>=living.length&&living.length>0)setSelectedEnemy(0);
  },[living.length]);

  // Back button interception — open pause menu instead of navigating away
  useEffect(()=>{
    window.history.pushState({inRun:true},"","");
    const handlePop=(e)=>{
      e.preventDefault();
      window.history.pushState({inRun:true},"","");
      setShowPause(true);
    };
    window.addEventListener("popstate",handlePop);
    return()=>window.removeEventListener("popstate",handlePop);
  },[]);

  // Ambient sound
  useEffect(()=>{
    SoundEngine.startAmbient(false);
    return()=>SoundEngine.stopAmbient();
  },[]);

  useEffect(()=>{
    if(initialPlayer.frenzyTurns>0)
      setLog(l=>[`⚔️ Frenzy active — +${initialPlayer.frenzyBonus} attack for ${initialPlayer.frenzyTurns} turns!`,...l]);
    // Druid Overgrowth — restore HP at room start
    if(initialPlayer.classKey==="druid"){
      const healAmt=hasNode(initialPlayer,"regrowth")?6:3;
      setPlayer(p=>{
        let np={...p};
        np.hp=Math.min(np.maxHp,np.hp+healAmt);
        // Overgrowth Surge — remove one player status effect
        if(hasNode(np,"overgrowth_surge")&&np.statusEffects&&np.statusEffects.length>0){
          np.statusEffects=np.statusEffects.slice(1);
          setLog(l=>[`🌳 Overgrowth — +${healAmt} HP. Status cleansed!`,...l]);
        }
        return np;
      });
      setLog(l=>[`🌳 Overgrowth — +${healAmt} HP.`,...l]);
    }
    // Reset shadowstrike each room
    setPlayer(p=>({...p,shadowstrikeReady:true}));
  },[]);

  function addLog(msg){setLog(l=>[msg,...l].slice(0,50));}

  // ---- Run a full turn: player action then enemy response ----
  function runTurn(actionFn) {
    if(locked.current||phase!=="player")return;
    locked.current=true;

    // --- Player action ---
    let p,es,msgs;
    try {
      const playerCopy=JSON.parse(JSON.stringify(player));
      const enemiesCopy=JSON.parse(JSON.stringify(enemies));
      const r=actionFn(playerCopy,enemiesCopy);
      p=r.p; es=r.es; msgs=r.msgs;
    } catch(err) {
      console.error("Player action error:",err);
      locked.current=false;
      return;
    }

    msgs.forEach(m=>addLog(m));
    setPlayer(p);
    setEnemies(es);

    const stillAlive=es.filter(e=>e.hp>0);
    if(stillAlive.length===0){
      // Against all odds achievement
      if(onUnlockAchievement&&enemies.length>=3&&p.onlyBasicThisCombat)
        onUnlockAchievement("against_all_odds");
      if(onUnlockAchievement&&p.hp===1) onUnlockAchievement("glass_cannon");
      SoundEngine.stopAmbient(); SoundEngine.victory(); Haptics.victory();
      setPhase("victory");
      locked.current=false;
      return;
    }
    if(p.hp<=0){
      SoundEngine.stopAmbient(); SoundEngine.death(); Haptics.death();
      setPhase("dead");
      locked.current=false;
      return;
    }

    // --- Enemy turn after delay ---
    setPhase("enemy");
    const _p=p, _es=es;
    setTimeout(()=>{
      let ep=JSON.parse(JSON.stringify(_p));
      let ees=JSON.parse(JSON.stringify(_es));
      const emsgs=[];

      try {
        applyStatusEffects(ep,m=>emsgs.push(m));

        for(const enemy of ees.filter(e=>e.hp>0)){
          if(ep.hp<=0)break;

          // Tick bleed
          const remaining=[];
          for(const s of enemy.statusEffects){
            if(s.type==="bleed"){
              enemy.hp=Math.max(0,enemy.hp-s.damage);
              emsgs.push(`🩸 ${enemy.name} bleeds for ${s.damage}.`);
              s.turns--;
              if(s.turns>0)remaining.push(s);
            } else remaining.push(s);
          }
          enemy.statusEffects=remaining;
          if(enemy.hp<=0){
            // Bleed Out achievement
            if(onUnlockAchievement) onUnlockAchievement("bleed_out");
            continue;
          }

          // Check stun/freeze BEFORE ticking so enemy actually skips their turn
          const wasStunned=isStunned(enemy);
          // Tick stun/freeze/exposed down
          enemy.statusEffects=enemy.statusEffects.map(s=>{
            if(["stun","freeze","exposed"].includes(s.type)){
              s.turns--;
              return s.turns>0?s:null;
            }
            return s;
          }).filter(Boolean);

          if(wasStunned){emsgs.push(`${enemy.icon} ${enemy.name} is stunned — skips turn.`);continue;}
          if(ep.smokeActive){emsgs.push(`💨 Smoke! ${enemy.name}'s attack misses.`);ep.smokeActive=false;continue;}

          const action=enemy.actions[enemy.actionIndex%enemy.actions.length];
          enemy.actionIndex++;
          const def=ep.defense+(ep.defenseBuff||0);

          if(["attack","heavy_attack","magic_bolt"].includes(action)){
            let raw=roll(...enemy.attack);
            if(action==="heavy_attack")raw+=5;
            const useDef=action==="magic_bolt"?Math.floor(def/2):def;
            const dmg=Math.max(1,raw-useDef);
            const boneReduce=(worldTree||[]).includes("bone_armour")?2:0;
            const fdmg=Math.max(1,dmg-boneReduce);
            const maxGrit=(worldTree||[]).includes("undying_will")?2:1;
            const hasGritAbility=ep.classKey==="warrior"||(worldTree||[]).includes("undying_will");
            const canTranscend=(worldTree||[]).includes("transcendence")&&!ep.transcendenceUsed;
            if(ep.hp-fdmg<=0&&hasGritAbility&&(ep.gritCount||0)<maxGrit){
              ep.hp=1;ep.gritUsed=true;ep.gritCount=(ep.gritCount||0)+1;
              emsgs.push(`${enemy.icon} ${enemy.name} strikes for ${fdmg}. ⚡ GRIT — survive on 1 HP!`);
            } else if(ep.hp-fdmg<=0&&canTranscend){
              ep.hp=1;ep.transcendenceUsed=true;
              emsgs.push(`${enemy.icon} ${enemy.name} strikes for ${fdmg}. 💫 TRANSCENDENCE — death defied!`);
            } else {
              ep.hp=Math.max(0,ep.hp-fdmg);
              ep.damageTakenThisCombat=(ep.damageTakenThisCombat||0)+fdmg;
              const pre=action==="heavy_attack"?"💥 ":action==="magic_bolt"?"✨ ":"";
              emsgs.push(`${pre}${enemy.name} hits for ${fdmg}.${boneReduce>0?" 🦴":""}`);
            }
            // Barkskin reflect
            if(ep.barkskinReflect&&ep.barkskinReflect>0){
              enemy.hp=Math.max(0,enemy.hp-ep.barkskinReflect);
              emsgs.push(`🪵 Barkskin reflects ${ep.barkskinReflect} to ${enemy.name}.`);
            }
            // Pain Threshold — big hits grant +4 ATK next turn
            if(hasNode(ep,"pain_threshold")&&dmg>=15){
              ep.retaliationBonus=(ep.retaliationBonus||0)+4;
              emsgs.push(`⚡ Pain Threshold — +4 ATK next action!`);
            }
            // Predator's Mark — bleeding enemies already checked in damage calc
            // Natural Armour and Predator's Mark applied at damage calculation time
          } else if(action==="cower"){emsgs.push(`${enemy.icon} ${enemy.name} cowers.`);}
          else if(action==="brace"){emsgs.push(`${enemy.icon} ${enemy.name} braces.`);}
        }

        if(ep.defenseBuffTurns>0){
          ep.defenseBuffTurns--;
          if(ep.defenseBuffTurns===0){ep.defenseBuff=0;ep.battleCryAttackBonus=0;emsgs.push("🛡️ Battle Cry fades.");}
        }
        if(ep.frenzyTurns>0){
          ep.frenzyTurns--;
          if(ep.frenzyTurns===0){ep.frenzyBonus=0;emsgs.push("⚔️ Frenzy fades.");}
        }
      } catch(err){
        console.error("Enemy turn error:",err);
      }

      emsgs.forEach(m=>addLog(m));
      setPlayer(ep);
      setEnemies(ees);
      setPhase(ep.hp<=0?"dead":"player");
      locked.current=false;
    },700);
  }

  // ---- Award kill ----
  function awardKill(p,enemy){
    p.xpEarned=(p.xpEarned||0)+(enemy.xp||0);
    p.gold=(p.gold||0)+roll(...enemy.gold);
    if((worldTree||[]).includes("soul_harvest")&&Math.random()<0.2)p.hp=Math.min(p.maxHp,p.hp+5);
    return p;
  }

  // ---- Basic attack ----
  function handleBasicAttack(){
    if(!target)return;
    SoundEngine.basicAttack(); Haptics.hit();
    runTurn((p,es)=>{
      const msgs=[];
      const c=CLASSES[p.classKey];
      const e=es.find(x=>x.uid===target.uid);
      if(!e)return{p,es,msgs:["No target."]};
      const frenzy=p.frenzyTurns>0?p.frenzyBonus:0;
      const berserk=hasNode(p,"berserker")&&p.hp/p.maxHp<0.3?10:0;
      const tempAtk=p.tempAtkCombatsLeft>0?p.tempAtkBonus:0;
      const killingBonus=p.firstAttackThisCombat&&(worldTree||[]).includes("killing_instinct")?8:0;
      const momentumBonus=p.battleMomentumBonus||0;
      if(p.firstAttackThisCombat){p.firstAttackThisCombat=false;p.battleMomentumBonus=0;}
      const exposed=isExposed(e);

      if(hasNode(p,"chain_lightning")&&p.classKey==="mage"){
        const dmg=roll(...c.basicAttack.damage)+frenzy;
        const primary=calcDmg(dmg,e.defense,exposed);
        e.hp=Math.max(0,e.hp-primary);
        if(e.hp<=0)p=awardKill(p,e);
        for(const t of es.filter(x=>x.hp>0&&x.uid!==e.uid)){
          const splash=Math.floor(calcDmg(dmg,t.defense,isExposed(t))*0.5);
          t.hp=Math.max(0,t.hp-splash);
          if(t.hp<=0)p=awardKill(p,t);
        }
        const sw=hasNode(p,"mana_torrent")?1:2;
        p.arcaneHits=(p.arcaneHits||0)+1;
        if(p.arcaneHits>=sw){
          p.arcaneHits=0;
          const nc=p.abilities.filter(a=>a.charges<a.maxCharges);
          if(nc.length){const pk=nc[Math.floor(Math.random()*nc.length)];p.abilities.find(a=>a.id===pk.id).charges++;msgs.push(`✨ Chain Bolt ${primary} dmg. Spellweave: ${pk.name}!`);}
          else msgs.push(`✨ Chain Bolt ${primary} dmg.`);
        } else msgs.push(`✨ Chain Bolt — ${primary} dmg. (${p.arcaneHits}/${sw})`);
      } else if(p.classKey==="rogue"){
        const targets=hasNode(p,"knife_fan")?es.filter(x=>x.hp>0):[e];
        for(const t of targets){
          const dmg=roll(...c.basicAttack.damage)+frenzy;
          const actual=calcDmg(dmg,t.defense,isExposed(t));
          t.hp=Math.max(0,t.hp-actual);
          if(t.hp<=0)p=awardKill(p,t);
          const bd=c.basicAttack.bleedDmg+(hasNode(p,"serrated")?2:0);
          const bt=c.basicAttack.bleedTurns+(hasNode(p,"hemorrhage")?1:0);
          t.statusEffects=t.statusEffects.filter(s=>s.type!=="bleed");
          t.statusEffects.push({type:"bleed",damage:bd,turns:bt,name:t.name});
        }
        msgs.push(`🗡️ Shiv${hasNode(p,"knife_fan")&&targets.length>1?" (all)":""} — Bleed!`);
      } else if(p.classKey==="druid"){
        // Thorn Lash — damage + bleed
        const dmg=roll(...c.basicAttack.damage)+frenzy;
        const exposed=isExposed(e);
        const actual=calcDmg(dmg,e.defense,exposed);
        e.hp=Math.max(0,e.hp-actual);
        if(e.hp<=0){p=awardKill(p,e);if(hasNode(p,"wild_hunger")){p.hp=Math.min(p.maxHp,p.hp+10);msgs.push(`🌿 Thorn Lash kills ${e.name} for ${actual}. 🩸 Wild Hunger +10!`);}}
        else{
          const bleedTurns=c.basicAttack.bleedTurns+(hasNode(p,"ancient_bond")?1:0);
          // Predator's Mark — bleeding enemies take more damage
          const prevBleed=isBleeding(e);
          e.statusEffects=e.statusEffects.filter(s=>s.type!=="bleed");
          e.statusEffects.push({type:"bleed",damage:c.basicAttack.bleedDmg,turns:bleedTurns,name:e.name});
          msgs.push(`🌿 Thorn Lash hits ${e.name} for ${actual}${prevBleed&&hasNode(p,"predators_mark")?" (Pred. Mark)":""}— Bleed!`);
        }
      } else if(p.classKey==="blood_knight"){
        // Bloodstrike — damage + heal on hit
        const surgeMult=p.bloodSurgeActive&&p.bloodSurgeCharges>0?2:1;
        if(p.bloodSurgeActive&&p.bloodSurgeCharges>0){p.bloodSurgeCharges--;if(p.bloodSurgeCharges<=0)p.bloodSurgeActive=false;}
        const bkAtk=(hasNode(p,"desperate_power")&&p.hp/p.maxHp<0.3?12:0);
        const dmg=roll(...c.basicAttack.damage)*surgeMult+frenzy+bkAtk;
        const actual=calcDmg(dmg,e.defense,isExposed(e));
        e.hp=Math.max(0,e.hp-actual);
        const healed=hasNode(p,"bloodthirst")?7:c.basicAttack.healOnHit;
        p.hp=Math.min(p.maxHp,p.hp+healed);
        const vampHeal=hasNode(p,"eternal_hunger")?20:12;
        if(e.hp<=0){p=awardKill(p,e);p.hp=Math.min(p.maxHp,p.hp+vampHeal);
          if(hasNode(p,"blood_pact"))p.abilities.forEach(a=>{a.charges=Math.min(a.charges+1,a.maxCharges);});
          msgs.push(`🩸 Bloodstrike kills ${e.name} for ${actual}. 🧛 +${vampHeal} HP!${hasNode(p,"blood_pact")?" Blood Pact!":""}`);}
        else msgs.push(`🩸 Bloodstrike hits ${e.name} for ${actual}, heals +${healed} HP.${surgeMult>1?" (Surge x2)":""}${bkAtk>0?" (Desperate)":""}`);
      } else if(p.classKey==="mage"){
        const dmg=roll(...c.basicAttack.damage)+frenzy;
        const actual=calcDmg(dmg,e.defense,exposed);
        e.hp=Math.max(0,e.hp-actual);
        if(e.hp<=0)p=awardKill(p,e);
        const sw=hasNode(p,"mana_torrent")?1:2;
        p.arcaneHits=(p.arcaneHits||0)+1;
        if(p.arcaneHits>=sw){
          p.arcaneHits=0;
          const nc=p.abilities.filter(a=>a.charges<a.maxCharges);
          if(nc.length){const pk=nc[Math.floor(Math.random()*nc.length)];p.abilities.find(a=>a.id===pk.id).charges++;msgs.push(`✨ Arcane Bolt ${actual}. Spellweave: ${pk.name}!`);}
          else msgs.push(`✨ Arcane Bolt hits ${e.name} for ${actual}.`);
        } else msgs.push(`✨ Arcane Bolt hits ${e.name} for ${actual}. (${p.arcaneHits}/${sw})`);
      } else {
        const dmg=roll(...c.basicAttack.damage)+frenzy+berserk+tempAtk+killingBonus+momentumBonus;
        const actual=calcDmg(dmg,e.defense,exposed);
        e.hp=Math.max(0,e.hp-actual);
        if(e.hp<=0){
          p=awardKill(p,e);
          if(actual>=100&&onUnlockAchievement) onUnlockAchievement("overkill");
          if(hasNode(p,"bloodlust")){p.hp=Math.min(p.maxHp,p.hp+8);msgs.push(`⚔️ Slash kills ${e.name} for ${actual}. 🩸 +8 HP!`);}
          else msgs.push(`⚔️ Slash kills ${e.name} for ${actual}.`);
        } else msgs.push(`⚔️ Slash hits ${e.name} for ${actual}.${frenzy>0?" (Frenzy)":""}${berserk>0?" (Berserk!)":""}`);
      }
      return{p,es,msgs};
    });
  }

  // ---- Abilities ----
  function handleAbility(abilityId){
    const ability=player.abilities.find(a=>a.id===abilityId);
    const arcMastery=hasNode(player,"arcane_mastery");
    if(!ability||(ability.charges<=0&&!player.surgeActive&&!arcMastery))return;
    const execThresh=hasNode(player,"unstoppable")?0.5:0.4;
    if(abilityId==="execute"&&(!target||target.hp/target.maxHp>=execThresh)){
      addLog(`💀 Execute requires enemy below ${execThresh*100}% HP.`);return;
    }
    SoundEngine.abilityFire(); Haptics.hit();
    runTurn((p,es)=>{
      const msgs=[];
      const ab=p.abilities.find(a=>a.id===abilityId);
      const surge=p.surgeActive||hasNode(p,"arcane_mastery");
      if(!surge)ab.charges--;
      p.abilitiesUsedThisRun=true;
      p.onlyBasicThisCombat=false;
      p.onlyBasicThisDungeon=false;
      if(p.surgeActive&&abilityId!=="arcane_surge")p.surgeActive=false;
      const e=target?es.find(x=>x.uid===target.uid):null;
      const exposed=e?isExposed(e):false;
      const frenzy=p.frenzyTurns>0?p.frenzyBonus:0;
      const berserk=hasNode(p,"berserker")&&p.hp/p.maxHp<0.3?10:0;

      if(abilityId==="shield_bash"){
        const dmg=calcDmg(roll(...ab.damage)+frenzy+berserk,e.defense,exposed);
        e.hp=Math.max(0,e.hp-dmg);
        if(e.hp<=0){p=awardKill(p,e);if(hasNode(p,"bloodlust")){p.hp=Math.min(p.maxHp,p.hp+8);msgs.push(`🛡️ Shield Bash kills ${e.name} for ${dmg}. 🩸 +8!`);}else msgs.push(`🛡️ Shield Bash kills ${e.name} for ${dmg}!`);}
        else{e.statusEffects=e.statusEffects.filter(s=>s.type!=="stun");e.statusEffects.push({type:"stun",turns:1,name:e.name});msgs.push(`🛡️ Shield Bash — ${dmg} dmg + stun!`);}
      }
      else if(abilityId==="battle_cry"){
        p.defenseBuff=ab.buffAmount;p.defenseBuffTurns=ab.buffTurns;
        if(hasNode(p,"warlord"))p.battleCryAttackBonus=4;
        msgs.push(`📯 Battle Cry! +${ab.buffAmount} def${hasNode(p,"warlord")?" +4 atk":""}.`);
      }
      else if(abilityId==="execute"){
        let dmg=surge?roll(...ab.damage)*2:roll(...ab.damage);
        if(hasNode(p,"executioner"))dmg+=25;
        dmg+=berserk;
        e.hp=Math.max(0,e.hp-dmg);
        if(e.hp<=0){p=awardKill(p,e);if(onUnlockAchievement)onUnlockAchievement("executioner_ach");if(hasNode(p,"bloodlust")){p.hp=Math.min(p.maxHp,p.hp+8);msgs.push(`💀 EXECUTE kills! ${dmg} dmg 🩸 +8!`);}else msgs.push(`💀 EXECUTE — ${dmg} damage!`);}
        else msgs.push(`💀 EXECUTE — ${dmg} damage.`);
      }
      else if(abilityId==="backstab"){
        const bleeding=isBleeding(e);
        let dmg=roll(...ab.damage)+frenzy;
        if(surge)dmg*=2;
        if(bleeding)dmg=Math.floor(dmg*(hasNode(p,"assassin")?2.5:2));
        const base=calcDmg(dmg,e.defense,exposed);
        const final=isExposed(e)&&hasNode(p,"death_mark")?Math.floor(base*1.25):base;
        e.hp=Math.max(0,e.hp-final);
        msgs.push(bleeding?`🗡️ BACKSTAB CRIT — ${final}!${surge?" (Surged!)":""}`:
          `🗡️ Backstab hits ${e.name} for ${final}.`);
        if(bleeding&&!surge){ab.charges=Math.min(ab.charges+1,ab.maxCharges);msgs.push(`🐾 Predator — charge restored!`);}
        if(e.hp<=0){p=awardKill(p,e);if(hasNode(p,"killing_spree")){ab.charges=Math.min(ab.charges+1,ab.maxCharges);msgs.push(`⚡ Killing Spree — Backstab charge!`);}}
      }
      else if(abilityId==="smoke_bomb"){p.smokeActive=true;msgs.push(`💨 Smoke Bomb! Next attack misses.`);}
      // ── DRUID ──
      else if(abilityId==="spore_cloud"){
        for(const t of es.filter(x=>x.hp>0)){
          const raw=(surge?roll(...ab.damage)*2:roll(...ab.damage))+frenzy;
          const dmg=calcDmg(raw,t.defense,isExposed(t));
          t.hp=Math.max(0,t.hp-dmg);
          if(t.hp<=0)p=awardKill(p,t);
          t.statusEffects=t.statusEffects.filter(s=>s.type!=="bleed");
          t.statusEffects.push({type:"bleed",damage:5,turns:3,name:t.name});
        }
        msgs.push(`🍄 Spore Cloud — all enemies hit and Bleeding!${surge?" (Surged!)":""}`);
      }
      else if(abilityId==="entangle"){
        const stunTurns=hasNode(p,"deep_roots")?2:1;
        e.statusEffects=e.statusEffects.filter(s=>s.type!=="stun"&&s.type!=="exposed");
        e.statusEffects.push({type:"stun",turns:stunTurns,name:e.name});
        e.statusEffects.push({type:"exposed",turns:2,name:e.name});
        msgs.push(`🌱 Entangle — ${e.name} stunned${stunTurns>1?" (2 turns)":""} and exposed!`);
      }
      else if(abilityId==="barkskin"){
        const buffAmt=hasNode(p,"elder_bark")?15:ab.buffAmount;
        const reflectAmt=hasNode(p,"thorned_skin")?5:2;
        p.defenseBuff=(p.defenseBuff||0)+buffAmt;
        p.defenseBuffTurns=ab.buffTurns;
        p.barkskinReflect=reflectAmt;
        msgs.push(`🪵 Barkskin! +${buffAmt} defence for ${ab.buffTurns} turns. Reflects ${reflectAmt} dmg.`);
      }
      // ── BLOOD KNIGHT ──
      else if(abilityId==="crimson_slash"){
        const actualCost=hasNode(p,"void_touched")?4:ab.hpCost;
        p.hp=Math.max(1,p.hp-actualCost);
        const bkAtk=hasNode(p,"desperate_power")&&p.hp/p.maxHp<0.3?12:0;
        const surgeMult=p.bloodSurgeActive&&p.bloodSurgeCharges>0?2:1;
        if(p.bloodSurgeActive&&p.bloodSurgeCharges>0){p.bloodSurgeCharges--;if(p.bloodSurgeCharges<=0)p.bloodSurgeActive=false;}
        const raw=(roll(...ab.damage)*surgeMult)+frenzy+bkAtk;
        const dmg=calcDmg(raw,e.defense,exposed);
        e.hp=Math.max(0,e.hp-dmg);
        if(hasNode(p,"open_wound")){
          e.statusEffects=e.statusEffects.filter(s=>s.type!=="bleed");
          e.statusEffects.push({type:"bleed",damage:4,turns:3,name:e.name});
        }
        const vampHeal=hasNode(p,"eternal_hunger")?20:12;
        if(e.hp<=0){
          p=awardKill(p,e);p.hp=Math.min(p.maxHp,p.hp+vampHeal);
          if(hasNode(p,"blood_pact"))p.abilities.forEach(a=>{a.charges=Math.min(a.charges+1,a.maxCharges);});
          msgs.push(`⚔️ Crimson Slash kills ${e.name} for ${dmg}! 🧛 +${vampHeal}!${hasNode(p,"blood_pact")?" Blood Pact!":""}`);
        } else msgs.push(`⚔️ Crimson Slash — ${dmg} dmg. (−${actualCost} HP)${hasNode(p,"open_wound")?" Bleed!":""}${surgeMult>1?" (Surge)":""}`);
      }
      else if(abilityId==="blood_surge"){
        const surgePct=hasNode(p,"sacrifice")?0.10:0.15;
        const hpCost=Math.floor(p.hp*surgePct);
        p.hp=Math.max(1,p.hp-hpCost);
        p.bloodSurgeActive=true;
        p.bloodSurgeCharges=hasNode(p,"haemorrhage")?2:1;
        msgs.push(`🩸 Blood Surge! −${hpCost} HP — next ${hasNode(p,"haemorrhage")?"2 abilities deal":"ability deals"} double damage!`);
      }
      else if(abilityId==="deaths_embrace"){
        const missingHp=p.maxHp-p.hp;
        const scalePct=hasNode(p,"death_dealer")?0.40:0.30;
        const surgeMult=p.bloodSurgeActive&&p.bloodSurgeCharges>0?2:1;
        if(p.bloodSurgeActive&&p.bloodSurgeCharges>0){p.bloodSurgeCharges--;if(p.bloodSurgeCharges<=0)p.bloodSurgeActive=false;}
        let raw=Math.floor(missingHp*scalePct)*surgeMult;
        const bkAtk=hasNode(p,"desperate_power")&&p.hp/p.maxHp<0.3?12:0;
        const dmg=Math.max(8,calcDmg(raw+bkAtk,e.defense,exposed));
        e.hp=Math.max(0,e.hp-dmg);
        const vampHeal=hasNode(p,"eternal_hunger")?20:12;
        const lastRitesHeal=hasNode(p,"last_rites")?20:0;
        if(e.hp<=0){
          p=awardKill(p,e);
          p.hp=Math.min(p.maxHp,p.hp+vampHeal+lastRitesHeal);
          if(hasNode(p,"blood_pact"))p.abilities.forEach(a=>{a.charges=Math.min(a.charges+1,a.maxCharges);});
          msgs.push(`💀 Death's Embrace kills for ${dmg}! 🧛 +${vampHeal+lastRitesHeal} HP!${hasNode(p,"blood_pact")?" Blood Pact!":""}`);
        } else msgs.push(`💀 Death's Embrace — ${dmg} dmg. (${missingHp} missing HP)${surgeMult>1?" (Surge)":""}`);
      }
      else if(abilityId==="expose"){
        e.statusEffects=e.statusEffects.filter(s=>s.type!=="exposed");
        e.statusEffects.push({type:"exposed",turns:2,name:e.name});
        if(hasNode(p,"opportunist")){const dmg=calcDmg(12,e.defense,true);e.hp=Math.max(0,e.hp-dmg);msgs.push(`🎯 Expose — ${dmg} dmg + exposed!`);}
        else msgs.push(`🎯 ${e.name} Exposed for 2 turns.`);
      }
      else if(abilityId==="fireball"){
        const bonus=hasNode(p,"overload")?8:0;
        for(const t of es.filter(x=>x.hp>0)){
          const raw=(surge?roll(...ab.damage)*2:roll(...ab.damage))+bonus+frenzy;
          const dmg=calcDmg(raw,t.defense,isExposed(t));
          const final=isFrozen(t)&&hasNode(p,"permafrost")?Math.floor(dmg*1.3):dmg;
          t.hp=Math.max(0,t.hp-final);
          if(t.hp<=0)p=awardKill(p,t);
          if(hasNode(p,"inferno")){t.statusEffects=t.statusEffects.filter(s=>s.type!=="bleed");t.statusEffects.push({type:"bleed",damage:5,turns:3,name:t.name});}
        }
        msgs.push(`🔥 Fireball!${hasNode(p,"inferno")?" (Bleed)":""}${surge?" (Surged!)":""}`);
      }
      else if(abilityId==="frost_nova"){
        if(hasNode(p,"absolute_zero")&&e.hp/e.maxHp<0.2){p=awardKill(p,e);e.hp=0;msgs.push(`❄️ ABSOLUTE ZERO — ${e.name} annihilated!`);}
        else{
          const raw=(surge?roll(...ab.damage)*2:roll(...ab.damage))+frenzy;
          const dmg=calcDmg(raw,e.defense,exposed);
          e.hp=Math.max(0,e.hp-dmg);
          if(e.hp<=0)p=awardKill(p,e);
          const ft=hasNode(p,"glacial")?2:1;
          e.statusEffects=e.statusEffects.filter(s=>s.type!=="freeze"&&s.type!=="exposed");
          e.statusEffects.push({type:"freeze",turns:ft,name:e.name});
          e.statusEffects.push({type:"exposed",turns:2,name:e.name});
          msgs.push(`❄️ Frost Nova — ${dmg} dmg, frozen${ft>1?" (2t)":""} + exposed!`);
        }
      }
      else if(abilityId==="arcane_surge"){
        if(!arcMastery)p.surgeActive=true;
        msgs.push(`⚡ Arcane Surge — next ability FREE and DOUBLED!`);
      }
      return{p,es,msgs};
    });
  }

  // ---- Computed UI state ----
  const berserkerActive=hasNode(player,"berserker")&&player.hp/player.maxHp<0.3;
  const passiveBadges=[];
  if(player.classKey==="warrior"){
    if(!player.gritUsed)passiveBadges.push({label:"GRIT ✓",color:cls.color});
    if(player.defenseBuff>0)passiveBadges.push({label:`🛡️+${player.defenseBuff}`,color:"#4caf6e"});
    if(berserkerActive)passiveBadges.push({label:"🔥 BERSERK",color:"#e05c5c"});
  }
  if(player.classKey==="rogue"&&player.smokeActive)passiveBadges.push({label:"💨 SMOKE",color:"#9E7FD4"});
  if(player.classKey==="mage"){
    if(player.surgeActive||hasNode(player,"arcane_mastery"))passiveBadges.push({label:"⚡ SURGE",color:"#6EA8C8"});
    if(player.arcaneHits>0)passiveBadges.push({label:`✨${player.arcaneHits}/${hasNode(player,"mana_torrent")?2:3}`,color:"#6EA8C8"});
  }
  if(player.frenzyTurns>0)passiveBadges.push({label:`⚔️ FRENZY ${player.frenzyTurns}`,color:"#e0a040"});

  const activeNodes=(player.runNodes||[]).map(nid=>(RUN_TREE_POOL[player.classKey]||[]).find(x=>x.id===nid)).filter(Boolean);

  function isAbilityDisabled(ab){
    if(phase!=="player"||locked.current)return true;
    if(ab.charges<=0&&!player.surgeActive&&!hasNode(player,"arcane_mastery"))return true;
    const et=hasNode(player,"unstoppable")?0.5:0.4;
    if(ab.id==="execute"&&(!target||target.hp/target.maxHp>=et))return true;
    if(ab.id==="arcane_surge"&&player.surgeActive&&!hasNode(player,"arcane_mastery"))return true;
    return false;
  }
  function abilityBorder(ab){
    if((player.surgeActive||hasNode(player,"arcane_mastery"))&&ab.id!=="arcane_surge")return"#6EA8C8";
    if(ab.id==="execute"&&target&&target.hp/target.maxHp<(hasNode(player,"unstoppable")?0.5:0.4))return"#e05c5c";
    if(ab.id==="backstab"&&target&&isBleeding(target))return"#9E7FD4";
    return`${cls.color}44`;
  }

  const playerRef=useRef(player);
  useEffect(()=>{playerRef.current=player;},[player]);

  // ---- Render ----
  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>

      {showPause&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#0e0e1a",border:"1px solid #2a2a3e",borderRadius:16,
            padding:32,width:"80%",maxWidth:300,textAlign:"center",fontFamily:"'Georgia',serif"}}>
            <div style={{color:"#C8A96E",fontSize:18,letterSpacing:2,marginBottom:6}}>Paused</div>
            <div style={{color:"#555",fontSize:12,marginBottom:24}}>{player.characterName} · Room {roomNumber}</div>
            <button onClick={()=>setShowPause(false)} style={{width:"100%",background:"#1a1a2e",
              border:"1px solid #3a3a5e",borderRadius:8,padding:"12px 0",color:"#e8d5a3",
              fontSize:14,cursor:"pointer",marginBottom:8,fontFamily:"'Georgia',serif"}}>CONTINUE</button>
            <button onClick={()=>{setShowPause(false);onViewMap&&onViewMap();}} style={{width:"100%",
              background:"#0e0e1a",border:"1px solid #2a2a3e",borderRadius:8,padding:"10px 0",
              color:"#C8A96E",fontSize:12,cursor:"pointer",marginBottom:8,fontFamily:"'Georgia',serif"}}>
              🗺️ VIEW DUNGEON MAP</button>
            <button onClick={()=>{SoundEngine.setMuted(!SoundEngine.isMuted());try{localStorage.setItem("gm_muted",SoundEngine.isMuted()?"1":"0");}catch{}}} style={{width:"100%",
              background:"#0e0e1a",border:"1px solid #2a2a3e",borderRadius:8,padding:"10px 0",
              color:"#888",fontSize:12,cursor:"pointer",marginBottom:8,fontFamily:"'Georgia',serif"}}>
              {SoundEngine.isMuted()?"🔇 Unmute Sound":"🔊 Mute Sound"}</button>
            <button onClick={()=>{SoundEngine.stopAmbient();onAbandon(playerRef.current);}} style={{width:"100%",background:"#1a0808",
              border:"1px solid #3e1e1e",borderRadius:8,padding:"12px 0",color:"#e05c5c",
              fontSize:14,cursor:"pointer",fontFamily:"'Georgia',serif"}}>ABANDON RUN</button>
            <div style={{color:"#333",fontSize:10,marginTop:8}}>XP earned will be banked on abandon.</div>
          </div>
        </div>
      )}

      <div style={{background:"#0e0e1a",borderBottom:"1px solid #1e1e2e",padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={()=>setShowPause(true)} style={{background:"none",border:"none",
          color:"#555",fontSize:18,cursor:"pointer",padding:"0 4px"}}>☰</button>
        <div style={{color:cls.color,fontSize:11,letterSpacing:3}}>ROOM {roomNumber}</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{color:"#C8A96E",fontSize:11}}>✨{player.xpEarned} 🪙{player.gold}</div>
          <div style={{color:"#555",fontSize:10}}>{cls.icon}</div>
        </div>
      </div>

      <div style={{padding:"10px 16px",background:"#0e0e1a",borderBottom:"1px solid #1e1e2e"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <div style={{color:"#e8d5a3",fontSize:13}}>
            {player.hp<=0?"💀":"❤️"} {Math.max(0,player.hp)}/{player.maxHp}
            <span style={{color:"#555",fontSize:10,marginLeft:8}}>{player.characterName}{player.activeTitle?" · "+player.activeTitle:""}</span>
          </div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap",justifyContent:"flex-end"}}>
            {passiveBadges.map((b,i)=><Badge key={i} label={b.label} color={b.color}/>)}
          </div>
        </div>
        <HPBar current={player.hp} max={player.maxHp}/>
        {activeNodes.length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
            {activeNodes.map(n=><span key={n.id} style={{fontSize:9,color:"#555",background:"#1a1a2e",
              borderRadius:3,padding:"1px 5px"}}>{n.icon} {n.name}</span>)}
          </div>
        )}
      </div>

      <div style={{padding:"10px 16px"}}>
        <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:8}}>ENEMIES</div>
        <div style={{display:"flex",gap:8}}>
          {enemies.map(enemy=>
            enemy.hp>0?(
              <EnemyCard key={enemy.uid} enemy={enemy} showNextAction={showNextAction}
                selected={target&&enemy.uid===target.uid}
                onClick={()=>{const idx=living.findIndex(e=>e.uid===enemy.uid);if(idx>=0)setSelectedEnemy(idx);}}/>
            ):(
              <div key={enemy.uid} style={{flex:1,border:"1px solid #1a1a2a",borderRadius:10,
                padding:10,textAlign:"center",opacity:0.2}}>
                <div style={{fontSize:22}}>💀</div>
                <div style={{color:"#555",fontSize:9}}>{enemy.name}</div>
              </div>
            )
          )}
        </div>
      </div>

      <div style={{flex:1,padding:"0 16px 10px",overflowY:"auto",maxHeight:140}}>
        <div style={{color:"#444",fontSize:10,letterSpacing:3,marginBottom:5}}>COMBAT LOG</div>
        {log.map((entry,i)=><LogEntry key={i} entry={entry} index={i}/>)}
      </div>

      {phase==="player"&&(
        <div style={{padding:"10px 16px",background:"#0e0e1a",borderTop:"1px solid #1e1e2e"}}>
          <button ref={basicAttackRef} onClick={handleBasicAttack} style={{
            width:"100%",background:"#1a1a2e",border:"1px solid #3a3a5e",
            borderRadius:8,padding:"10px 0",color:"#e8d5a3",fontSize:13,
            cursor:"pointer",marginBottom:8,fontFamily:"'Georgia',serif",
          }}>
            {cls.icon} {cls.basicAttack.name}
            {player.classKey==="rogue"&&<span style={{color:"#e05c5c",fontSize:10}}> (Bleed)</span>}
            {player.classKey==="rogue"&&hasNode(player,"knife_fan")&&<span style={{color:"#9E7FD4",fontSize:10}}> (All)</span>}
          </button>
          <div ref={abilityRef} style={{display:"flex",gap:6}}>
            {player.abilities.map(ab=>{
              const disabled=isAbilityDisabled(ab);
              const surge=(player.surgeActive||hasNode(player,"arcane_mastery"))&&ab.id!=="arcane_surge";
              return(
                <button key={ab.id} onClick={()=>handleAbility(ab.id)} disabled={disabled} style={{
                  flex:1,background:disabled?"#111118":surge?"#0a1520":"#1a1a2e",
                  border:`1px solid ${disabled?"#1a1a2a":abilityBorder(ab)}`,
                  borderRadius:8,padding:"8px 4px",color:disabled?"#333":"#e8d5a3",
                  cursor:disabled?"not-allowed":"pointer",
                  textAlign:"center",fontFamily:"'Georgia',serif",
                }}>
                  <div style={{fontSize:15}}>{ab.icon}</div>
                  <div style={{fontSize:9,marginTop:2,lineHeight:1.2}}>{ab.name}</div>
                  <div style={{fontSize:10,color:ab.charges>0||surge?cls.color:"#333",marginTop:1}}>
                    {surge?"FREE":`${ab.charges}/${ab.maxCharges}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase==="enemy"&&(
        <div style={{padding:16,background:"#0e0e1a",borderTop:"1px solid #1e1e2e",
          textAlign:"center",color:"#555",fontSize:13}}>Enemies act…</div>
      )}

      {phase==="victory"&&(
        <div style={{padding:24,background:"#0e0e1a",borderTop:"1px solid #1e1e2e",textAlign:"center"}}>
          <div style={{color:"#C8A96E",fontSize:20,marginBottom:4}}>⚔️ Victory</div>
          <div style={{color:"#555",fontSize:12,marginBottom:16}}>All enemies defeated.</div>
          <button ref={nextRoomRef} onClick={()=>onVictory(playerRef.current)} style={{
            background:"#C8A96E",color:"#0b0b14",border:"none",borderRadius:8,
            padding:"12px 32px",fontSize:14,fontWeight:"bold",cursor:"pointer",
            letterSpacing:2,fontFamily:"'Georgia',serif",
          }}>NEXT ROOM →</button>
        </div>
      )}

      {phase==="dead"&&(
        <div style={{padding:24,background:"#110808",borderTop:"1px solid #3e1e1e",textAlign:"center"}}>
          <div style={{color:"#e05c5c",fontSize:20,marginBottom:4}}>💀 Fallen</div>
          <div style={{color:"#777",fontSize:13,marginBottom:2}}>{player.characterName}{player.activeTitle?" "+player.activeTitle:""} the {cls.name}</div>
          <div style={{color:"#444",fontSize:11,marginBottom:16,fontStyle:"italic"}}>"{epitaph(roomNumber)}"</div>
          <button onClick={()=>onDeath(playerRef.current,enemies)} style={{
            background:"#e05c5c",color:"#fff",border:"none",borderRadius:8,
            padding:"12px 32px",fontSize:14,fontWeight:"bold",cursor:"pointer",
            letterSpacing:2,fontFamily:"'Georgia',serif",
          }}>BEGIN AGAIN</button>
        </div>
      )}
    </div>
  );
}



// ============================================================
// BOSS COMBAT SCREEN
// ============================================================

function BossScreen({player:initialPlayer,boss:initialBoss,dungeonIndex,onVictory,onDeath,onAbandon,onViewMap,roomNumber,worldTree,onUnlockAchievement}) {
  const dungeon = DUNGEONS[dungeonIndex] || DUNGEONS[0];
  const [player,setPlayer]=useState(()=>JSON.parse(JSON.stringify(initialPlayer)));
  const [boss,setBoss]=useState(()=>JSON.parse(JSON.stringify(initialBoss)));
  const [log,setLog]=useState([`⚔️ ${initialBoss.name} stands before you!`]);
  const [phase,setPhase]=useState("player");
  const [showPause,setShowPause]=useState(false);
  const locked=useRef(false);
  const playerRef=useRef(player);
  useEffect(()=>{playerRef.current=player;},[player]);

  // Back button interception
  useEffect(()=>{
    window.history.pushState({inRun:true},"","");
    const handlePop=(e)=>{
      e.preventDefault();
      window.history.pushState({inRun:true},"","");
      setShowPause(true);
    };
    window.addEventListener("popstate",handlePop);
    return()=>window.removeEventListener("popstate",handlePop);
  },[]);

  // Boss ambient
  useEffect(()=>{
    SoundEngine.startAmbient(true);
    return()=>SoundEngine.stopAmbient();
  },[]);

  const cls=CLASSES[player.classKey];
  const showNextAction=(worldTree||[]).includes("dungeon_lore");
  const inPhase2=boss.hp/boss.maxHp<=boss.phase2Threshold&&!boss.inPhase2Announced;

  function addLog(msg){setLog(l=>[msg,...l].slice(0,60));}

  // Phase 2 trigger
  useEffect(()=>{
    if(boss.hp>0&&boss.hp/boss.maxHp<=boss.phase2Threshold&&!boss.inPhase2){
      setBoss(b=>({...b,inPhase2:true,inPhase2Announced:true}));
      SoundEngine.bossPhase2(); Haptics.death();
      addLog(`💥 ${boss.name} — ${dungeon.boss.phase2Desc}`);
    }
  },[boss.hp]);

  function awardKill(p,enemy){
    p.xpEarned=(p.xpEarned||0)+(enemy.xp||0);
    p.gold=(p.gold||0)+roll(...enemy.gold);
    return p;
  }

  function runTurn(actionFn){
    if(locked.current||phase!=="player")return;
    locked.current=true;
    let p,b,msgs;
    try{
      const r=actionFn(JSON.parse(JSON.stringify(player)),JSON.parse(JSON.stringify(boss)));
      if(!r||!r.p||!r.b||!r.msgs){locked.current=false;return;}
      p=r.p;b=r.b;msgs=r.msgs;
    }catch(err){console.error("Boss action error:",err);locked.current=false;return;}

    msgs.forEach(m=>addLog(m));
    setPlayer(p);setBoss(b);

    if(b.hp<=0){
      p=awardKill(p,b);
      setPlayer(p);
      SoundEngine.stopAmbient();SoundEngine.dungeonClear();Haptics.victory();
      setPhase("victory");
      locked.current=false;
      return;
    }
    if(p.hp<=0){SoundEngine.stopAmbient();SoundEngine.death();Haptics.death();setPhase("dead");locked.current=false;return;}

    setPhase("enemy");
    const _p=p,_b=b;
    setTimeout(()=>{
      let ep=JSON.parse(JSON.stringify(_p));
      let eb=JSON.parse(JSON.stringify(_b));
      const emsgs=[];
      try{
        // Tick player bleed/status
        const prem=[];
        for(const s of ep.statusEffects){
          if(s.type==="bleed"){ep.hp=Math.max(0,ep.hp-s.damage);emsgs.push(`🩸 You bleed for ${s.damage}.`);s.turns--;if(s.turns>0)prem.push(s);}
          else prem.push(s);
        }
        ep.statusEffects=prem;

        if(ep.hp>0){
          // Check if boss is stunned BEFORE ticking (same logic as regular enemies)
          const bossPrevStunned=isStunned(eb);
          // Now tick status effects down
          eb.statusEffects=eb.statusEffects.map(s=>{
            if(["stun","freeze","exposed"].includes(s.type)){s.turns--;return s.turns>0?s:null;}
            if(s.type==="bleed"){eb.hp=Math.max(0,eb.hp-s.damage);s.turns--;return s.turns>0?s:null;}
            return s;
          }).filter(Boolean);

          if(bossPrevStunned){
            emsgs.push(`${eb.icon} ${eb.name} is stunned — skips turn.`);
          } else {
          // Boss acts
          const actions=eb.inPhase2?(dungeon.boss.phase2Actions||dungeon.boss.actions):dungeon.boss.actions;
          const action=actions[eb.actionIndex%actions.length];
          eb.actionIndex++;

          const def=ep.defense+(ep.defenseBuff||0);

          if(action==="attack"||action==="magic_bolt"){
            let raw=roll(...eb.attack);
            // Phase 2 damage bonus
            if(eb.inPhase2&&dungeon.boss.phase2DamageBonus){
              raw=Math.round(raw*(1+dungeon.boss.phase2DamageBonus));
            }
            const useDef=action==="magic_bolt"?Math.floor(def/2):def;
            const dmg=Math.max(1,raw-useDef);
            if(ep.hp-dmg<=0&&!ep.gritUsed&&ep.classKey==="warrior"){
              ep.hp=1;ep.gritUsed=true;
              emsgs.push(`${eb.icon} ${eb.name} strikes for ${dmg}. ⚡ GRIT!`);
            } else {
              ep.hp=Math.max(0,ep.hp-dmg);
              SoundEngine.playerHurt(); Haptics.hurt();
              emsgs.push(`${action==="magic_bolt"?"✨ ":""}${eb.name} hits for ${dmg}.`);
            }
          } else if(action==="special"||action===dungeon.boss.special){
            emsgs.push(`💥 ${eb.name}: ${dungeon.boss.specialDesc}`);
            // Special effects
            if(dungeon.boss.special==="raise_dead"){
              emsgs.push(`💀 A Revenant rises! (Deal with it next combat)`);
            } else if(dungeon.boss.special==="reinforce"){
              emsgs.push(`👺 A goblin joins the fight! (next room)`);
            } else if(dungeon.boss.special==="bleed_spore"){
              ep.statusEffects=ep.statusEffects.filter(s=>s.type!=="bleed");
              ep.statusEffects.push({type:"bleed",damage:5,turns:3,name:"you"});
              emsgs.push(`🌿 You are Bleeding!`);
            } else if(dungeon.boss.special==="silence"){
              const ab=ep.abilities.filter(a=>a.charges>0);
              if(ab.length){
                const picked=ab[Math.floor(Math.random()*ab.length)];
                ep.silencedAbilities=[...(ep.silencedAbilities||[]),picked.id];
                emsgs.push(`🌀 ${eb.name} silences your ${picked.name}!`);
              }
            } else if(dungeon.boss.special==="brace_boss"){
              eb.bracing=true;
              emsgs.push(`🛡️ ${eb.name} braces!`);
            } else if(dungeon.boss.special==="strip_defence"){
              ep.defenseBuff=0;ep.defenseBuffTurns=0;
              const raw=roll(...eb.attack);
              const dmg=Math.max(1,raw-Math.floor(def/2));
              ep.hp=Math.max(0,ep.hp-dmg);
              emsgs.push(`⚔️ ${eb.name} strips your defence and strikes for ${dmg}!`);
            }
          } else if(action==="brace"||action==="brace_boss"){
            eb.bracing=true;
            emsgs.push(`🛡️ ${eb.name} braces for impact.`);
          }
          } // end stun check
        }

        // Boss status already ticked above

        // Tick player buffs
        if(ep.defenseBuffTurns>0){
          ep.defenseBuffTurns--;
          if(ep.defenseBuffTurns===0){ep.defenseBuff=0;ep.battleCryAttackBonus=0;ep.barkskinReflect=0;emsgs.push("🛡️ Defence buff fades.");}
        }
        if(ep.frenzyTurns>0){ep.frenzyTurns--;if(ep.frenzyTurns===0){ep.frenzyBonus=0;emsgs.push("⚔️ Frenzy fades.");}}
        // Clear silence
        ep.silencedAbilities=[];
        // Leyline
        if(hasNode(ep,"leyline")){ep.leylineTurns=(ep.leylineTurns||0)+1;if(ep.leylineTurns>=5){ep.leylineTurns=0;ep.abilities.forEach(a=>{a.charges=Math.min(a.charges+1,a.maxCharges);});emsgs.push("🌀 Leyline — all charges +1!");}}
      }catch(err){console.error("Boss enemy turn error:",err);}

      emsgs.forEach(m=>addLog(m));
      if(ep.hp<=0){SoundEngine.stopAmbient();SoundEngine.death();Haptics.death();}
      else if(eb.hp<=0){SoundEngine.stopAmbient();SoundEngine.dungeonClear();Haptics.victory();}
      setPlayer(ep);setBoss(eb);
      setPhase(ep.hp<=0?"dead":eb.hp<=0?"victory":"player");
      locked.current=false;
    },700);
  }

  function handleBasicAttack(){
    SoundEngine.basicAttack(); Haptics.hit();
    runTurn((p,b)=>{
      const msgs=[];
      const c=CLASSES[p.classKey];
      const frenzy=p.frenzyTurns>0?p.frenzyBonus:0;
      const berserk=hasNode(p,"berserker")&&p.hp/p.maxHp<0.3?10:0;
      const exposed=isExposed(b);
      const retaliation=p.retaliationBonus||0;
      p.retaliationBonus=0;

      if(p.classKey==="druid"){
        // Thorn Lash — damage + bleed on boss
        const dmg=roll(...c.basicAttack.damage)+frenzy;
        const braceDiv=b.bracing?0.5:1; b.bracing=false;
        const actual=calcDmg(Math.floor(dmg*braceDiv),b.defense,exposed);
        b.hp=Math.max(0,b.hp-actual);
        const bleedTurns=c.basicAttack.bleedTurns+(hasNode(p,"ancient_bond")?1:0);
        b.statusEffects=b.statusEffects.filter(s=>s.type!=="bleed");
        b.statusEffects.push({type:"bleed",damage:c.basicAttack.bleedDmg,turns:bleedTurns});
        if(b.hp<=0&&hasNode(p,"wild_hunger")){p.hp=Math.min(p.maxHp,p.hp+10);msgs.push(`🌿 Thorn Lash kills boss for ${actual}! 🩸 +10 HP!`);}
        else msgs.push(`🌿 Thorn Lash hits boss for ${actual} — Bleed!`);
      } else if(p.classKey==="blood_knight"){
        // Bloodstrike — damage + heal
        const surgeMult=p.bloodSurgeActive&&p.bloodSurgeCharges>0?2:1;
        if(p.bloodSurgeActive&&p.bloodSurgeCharges>0){p.bloodSurgeCharges--;if(p.bloodSurgeCharges<=0)p.bloodSurgeActive=false;}
        const bkAtk=hasNode(p,"desperate_power")&&p.hp/p.maxHp<0.3?12:0;
        let dmg=roll(...c.basicAttack.damage)*surgeMult+frenzy+bkAtk+retaliation;
        if(b.bracing){dmg=Math.floor(dmg*0.5);msgs.push("🛡️ Boss bracing!");}
        b.bracing=false;
        const actual=calcDmg(dmg,b.defense,exposed);
        b.hp=Math.max(0,b.hp-actual);
        const healed=hasNode(p,"bloodthirst")?7:c.basicAttack.healOnHit;
        p.hp=Math.min(p.maxHp,p.hp+healed);
        const vampHeal=hasNode(p,"eternal_hunger")?20:12;
        if(b.hp<=0){p.hp=Math.min(p.maxHp,p.hp+vampHeal);if(hasNode(p,"blood_pact"))p.abilities.forEach(a=>{a.charges=Math.min(a.charges+1,a.maxCharges);});msgs.push(`🩸 Bloodstrike kills boss for ${actual}! 🧛 +${vampHeal}!`);}
        else msgs.push(`🩸 Bloodstrike hits boss for ${actual}, heals +${healed} HP.${surgeMult>1?" (Surge)":""}${bkAtk>0?" (Desperate)":""}`);
      } else {
        // Generic (Warrior, Rogue, Mage)
        let dmg=roll(...c.basicAttack.damage)+frenzy+berserk+retaliation;
        if(p.shadowstrikeReady&&hasNode(p,"shadowstrike")){dmg=Math.floor(dmg*1.5);p.shadowstrikeReady=false;msgs.push("🌑 Shadowstrike!");}
        if(b.bracing){dmg=Math.floor(dmg*0.5);msgs.push("🛡️ Boss bracing!");}
        b.bracing=false;
        const actual=calcDmg(dmg,b.defense,exposed);
        b.hp=Math.max(0,b.hp-actual);
        msgs.push(`⚔️ ${c.basicAttack.name} hits ${b.name} for ${actual}.${retaliation>0?" (Retaliation!)":""}`);
        // Rogue Shiv — apply bleed to boss
        if(p.classKey==="rogue"){
          const bd=c.basicAttack.bleedDmg+(hasNode(p,"serrated")?2:0);
          const bt=c.basicAttack.bleedTurns+(hasNode(p,"hemorrhage")?1:0);
          b.statusEffects=b.statusEffects.filter(s=>s.type!=="bleed");
          b.statusEffects.push({type:"bleed",damage:bd,turns:bt});
          msgs[msgs.length-1]+=" (Bleed!)";
        }
      }
      return{p,b,msgs};
    });
  }

  function handleAbility(abilityId){
    const ability=player.abilities.find(a=>a.id===abilityId);
    const arcMastery=hasNode(player,"arcane_mastery");
    const lastStand=hasNode(player,"last_stand")&&player.hp/player.maxHp<0.2;
    if(!ability||(ability.charges<=0&&!player.surgeActive&&!arcMastery&&!lastStand))return;
    if((player.silencedAbilities||[]).includes(abilityId)){addLog(`🌀 ${ability.name} is silenced!`);return;}
    const execThresh=hasNode(player,"unstoppable")?0.5:0.4;
    if(abilityId==="execute"&&boss.hp/boss.maxHp>=execThresh){addLog(`💀 Execute requires boss below ${execThresh*100}% HP.`);return;}

    SoundEngine.abilityFire(); Haptics.hit();
    runTurn((p,b)=>{
      const msgs=[];
      const ab=p.abilities.find(a=>a.id===abilityId);
      const surge=p.surgeActive||arcMastery;
      const free=lastStand||surge;
      if(!free)ab.charges--;
      if(p.surgeActive&&abilityId!=="arcane_surge")p.surgeActive=false;
      const exposed=isExposed(b);
      const frenzy=p.frenzyTurns>0?p.frenzyBonus:0;
      const berserk=hasNode(p,"berserker")&&p.hp/p.maxHp<0.3?10:0;

      function hitBoss(raw){
        if(b.bracing){const h=Math.floor(raw*0.5);b.bracing=false;msgs.push("🛡️ Boss bracing — half damage!");return h;}
        b.bracing=false;
        return calcDmg(raw,b.defense,exposed);
      }

      // Arcane echo
      const echoFires=hasNode(p,"arcane_echo")&&Math.random()<0.10;

      if(abilityId==="shield_bash"){
        const raw=roll(...ab.damage)+frenzy+berserk;
        const dmg=hitBoss(surge?raw*2:raw);
        b.hp=Math.max(0,b.hp-dmg);
        b.statusEffects=b.statusEffects.filter(s=>s.type!=="stun");
        b.statusEffects.push({type:"stun",turns:1});
        msgs.push(`🛡️ Shield Bash — ${dmg} dmg + stun!`);
        if(hasNode(p,"bloodlust")&&b.hp<=0){p.hp=Math.min(p.maxHp,p.hp+8);msgs.push("🩸 Bloodlust +8!");}
      }
      else if(abilityId==="battle_cry"){
        p.defenseBuff=ab.buffAmount;p.defenseBuffTurns=ab.buffTurns;
        if(hasNode(p,"warlord"))p.battleCryAttackBonus=4;
        msgs.push(`📯 Battle Cry! +${ab.buffAmount} def${hasNode(p,"warlord")?" +4 atk":""}.`);
      }
      else if(abilityId==="execute"){
        let raw=surge?roll(...ab.damage)*2:roll(...ab.damage);
        if(hasNode(p,"executioner"))raw+=25;
        raw+=berserk;
        const dmg=hitBoss(raw);
        b.hp=Math.max(0,b.hp-dmg);
        msgs.push(`💀 EXECUTE — ${dmg} damage!`);
        if(hasNode(p,"bloodlust")&&b.hp<=0){p.hp=Math.min(p.maxHp,p.hp+8);msgs.push("🩸 Bloodlust +8!");}
      }
      else if(abilityId==="backstab"){
        const bleeding=isBleeding(b);
        let raw=roll(...ab.damage)+frenzy;
        if(surge)raw*=2;
        if(bleeding)raw=Math.floor(raw*(hasNode(p,"assassin")?3:2.5));
        const base=hitBoss(raw);
        const final=isExposed(b)&&hasNode(p,"death_mark")?Math.floor(base*1.25):base;
        b.hp=Math.max(0,b.hp-final);
        msgs.push(bleeding?`🗡️ BACKSTAB CRIT — ${final}!`:` 🗡️ Backstab — ${final}.`);
        if(bleeding&&!surge){ab.charges=Math.min(ab.charges+1,ab.maxCharges);msgs.push("🐾 Predator!");}
        if(b.hp<=0&&hasNode(p,"killing_spree")){ab.charges=Math.min(ab.charges+1,ab.maxCharges);}
      }
      else if(abilityId==="smoke_bomb"){p.smokeActive=true;msgs.push("💨 Smoke Bomb!");}
      else if(abilityId==="expose"){
        b.statusEffects=b.statusEffects.filter(s=>s.type!=="exposed");
        b.statusEffects.push({type:"exposed",turns:2});
        if(hasNode(p,"opportunist")){const dmg=hitBoss(12);b.hp=Math.max(0,b.hp-dmg);msgs.push(`🎯 Expose — ${dmg} dmg + exposed!`);}
        else msgs.push("🎯 Boss Exposed for 2 turns.");
      }
      else if(abilityId==="fireball"){
        const bonus=hasNode(p,"overload")?8:0;
        let raw=(surge?roll(...ab.damage)*2:roll(...ab.damage))+bonus+frenzy;
        if(echoFires){raw*=2;msgs.push("✨ Arcane Echo!");}
        const dmg=hitBoss(raw);
        b.hp=Math.max(0,b.hp-dmg);
        if(hasNode(p,"inferno")){b.statusEffects=b.statusEffects.filter(s=>s.type!=="bleed");b.statusEffects.push({type:"bleed",damage:5,turns:3});}
        msgs.push(`🔥 Fireball — ${dmg} dmg!${hasNode(p,"inferno")?" (Bleed)":""}${surge?" (Surged!)":""}`);
      }
      else if(abilityId==="frost_nova"){
        if(hasNode(p,"absolute_zero")&&b.hp/b.maxHp<0.2){b.hp=0;msgs.push("❄️ ABSOLUTE ZERO!");}
        else{
          let raw=(surge?roll(...ab.damage)*2:roll(...ab.damage))+frenzy;
          if(echoFires){raw*=2;msgs.push("✨ Arcane Echo!");}
          const dmg=hitBoss(raw);
          b.hp=Math.max(0,b.hp-dmg);
          const ft=hasNode(p,"glacial")?2:1;
          b.statusEffects=b.statusEffects.filter(s=>s.type!=="freeze"&&s.type!=="exposed");
          b.statusEffects.push({type:"freeze",turns:ft});
          b.statusEffects.push({type:"exposed",turns:2});
          msgs.push(`❄️ Frost Nova — ${dmg}, frozen${ft>1?" (2t)":""} + exposed!`);
        }
      }
      else if(abilityId==="arcane_surge"){if(!arcMastery)p.surgeActive=true;msgs.push("⚡ Arcane Surge!");}
      // ── DRUID ──
      else if(abilityId==="spore_cloud"){
        const bleedDmg=5+(hasNode(p,"toxic_spores")?3:0);
        const raw=(surge?roll(...ab.damage)*2:roll(...ab.damage))+frenzy;
        const dmg=hitBoss(raw);
        b.hp=Math.max(0,b.hp-dmg);
        b.statusEffects=b.statusEffects.filter(s=>s.type!=="bleed");
        b.statusEffects.push({type:"bleed",damage:bleedDmg,turns:3});
        msgs.push(`🍄 Spore Cloud — ${dmg} dmg + Bleed!${surge?" (Surged!)":""}`);
      }
      else if(abilityId==="entangle"){
        const stunTurns=hasNode(p,"deep_roots")?2:1;
        b.statusEffects=b.statusEffects.filter(s=>s.type!=="stun"&&s.type!=="exposed");
        b.statusEffects.push({type:"stun",turns:stunTurns});
        b.statusEffects.push({type:"exposed",turns:2});
        msgs.push(`🌱 Entangle — boss stunned${stunTurns>1?" (2t)":""} and exposed!`);
      }
      else if(abilityId==="barkskin"){
        const buffAmt=hasNode(p,"elder_bark")?15:ab.buffAmount;
        const reflectAmt=hasNode(p,"thorned_skin")?5:2;
        p.defenseBuff=(p.defenseBuff||0)+buffAmt;
        p.defenseBuffTurns=ab.buffTurns;
        p.barkskinReflect=reflectAmt;
        msgs.push(`🪵 Barkskin! +${buffAmt} def for ${ab.buffTurns} turns. Reflects ${reflectAmt} dmg.`);
      }
      // ── BLOOD KNIGHT ──
      else if(abilityId==="crimson_slash"){
        const actualCost=hasNode(p,"void_touched")?4:ab.hpCost;
        p.hp=Math.max(1,p.hp-actualCost);
        const bkAtk=hasNode(p,"desperate_power")&&p.hp/p.maxHp<0.3?12:0;
        const surgeMult=p.bloodSurgeActive&&p.bloodSurgeCharges>0?2:1;
        if(p.bloodSurgeActive&&p.bloodSurgeCharges>0){p.bloodSurgeCharges--;if(p.bloodSurgeCharges<=0)p.bloodSurgeActive=false;}
        const raw=(roll(...ab.damage)*surgeMult)+frenzy+bkAtk;
        const dmg=hitBoss(raw);
        b.hp=Math.max(0,b.hp-dmg);
        if(hasNode(p,"open_wound")){b.statusEffects=b.statusEffects.filter(s=>s.type!=="bleed");b.statusEffects.push({type:"bleed",damage:4,turns:3});}
        const vampHeal=hasNode(p,"eternal_hunger")?20:12;
        if(b.hp<=0){p.hp=Math.min(p.maxHp,p.hp+vampHeal);if(hasNode(p,"blood_pact"))p.abilities.forEach(a=>{a.charges=Math.min(a.charges+1,a.maxCharges);});}
        msgs.push(`⚔️ Crimson Slash — ${dmg} dmg. (−${actualCost} HP)${hasNode(p,"open_wound")?" Bleed!":""}${surgeMult>1?" (Surge)":""}`);
      }
      else if(abilityId==="blood_surge"){
        const surgePct=hasNode(p,"sacrifice")?0.10:0.15;
        const hpCost=Math.floor(p.hp*surgePct);
        p.hp=Math.max(1,p.hp-hpCost);
        p.bloodSurgeActive=true;
        p.bloodSurgeCharges=hasNode(p,"haemorrhage")?2:1;
        msgs.push(`🩸 Blood Surge! −${hpCost} HP — next ${hasNode(p,"haemorrhage")?"2 abilities":"ability"} doubled!`);
      }
      else if(abilityId==="deaths_embrace"){
        const missingHp=p.maxHp-p.hp;
        const scalePct=hasNode(p,"death_dealer")?0.40:0.30;
        const surgeMult=p.bloodSurgeActive&&p.bloodSurgeCharges>0?2:1;
        if(p.bloodSurgeActive&&p.bloodSurgeCharges>0){p.bloodSurgeCharges--;if(p.bloodSurgeCharges<=0)p.bloodSurgeActive=false;}
        const bkAtk=hasNode(p,"desperate_power")&&p.hp/p.maxHp<0.3?12:0;
        let raw=Math.floor(missingHp*scalePct)*surgeMult+bkAtk;
        const dmg=Math.max(8,hitBoss(raw));
        b.hp=Math.max(0,b.hp-dmg);
        const vampHeal=hasNode(p,"eternal_hunger")?20:12;
        const lastRitesHeal=hasNode(p,"last_rites")&&b.hp<=0?20:0;
        if(b.hp<=0){p.hp=Math.min(p.maxHp,p.hp+vampHeal+lastRitesHeal);if(hasNode(p,"blood_pact"))p.abilities.forEach(a=>{a.charges=Math.min(a.charges+1,a.maxCharges);});}
        msgs.push(`💀 Death's Embrace — ${dmg} dmg. (${missingHp} missing HP)${surgeMult>1?" (Surge)":""}`);
      }
      if(msgs.length===0) msgs.push("Action had no effect.");
      return{p,b,msgs};
    });
  }

  // UI helpers
  const berserkerActive=hasNode(player,"berserker")&&player.hp/player.maxHp<0.3;
  const passiveBadges=[];
  if(player.classKey==="warrior"){
    if(!player.gritUsed)passiveBadges.push({label:"GRIT ✓",color:cls.color});
    if(player.defenseBuff>0)passiveBadges.push({label:`🛡️+${player.defenseBuff}`,color:"#4caf6e"});
    if(berserkerActive)passiveBadges.push({label:"🔥 BERSERK",color:"#e05c5c"});
  }
  if(player.classKey==="rogue"&&player.smokeActive)passiveBadges.push({label:"💨 SMOKE",color:"#9E7FD4"});
  if(player.classKey==="mage"){
    if(player.surgeActive||hasNode(player,"arcane_mastery"))passiveBadges.push({label:"⚡ SURGE",color:"#6EA8C8"});
  }
  if(player.frenzyTurns>0)passiveBadges.push({label:`⚔️ FRENZY ${player.frenzyTurns}`,color:"#e0a040"});
  if((player.silencedAbilities||[]).length>0)passiveBadges.push({label:"🌀 SILENCED",color:"#e05c5c"});

  const bossHpPct=Math.max(0,Math.min(100,(boss.hp/boss.maxHp)*100));
  const bossBarColor=bossHpPct>50?"#e0a040":bossHpPct>25?"#e05c5c":"#ff0000";

  function isAbilityDisabled(ab){
    if(phase!=="player"||locked.current)return true;
    const lastStand=hasNode(player,"last_stand")&&player.hp/player.maxHp<0.2;
    if(ab.charges<=0&&!player.surgeActive&&!hasNode(player,"arcane_mastery")&&!lastStand)return true;
    if((player.silencedAbilities||[]).includes(ab.id))return true;
    const et=hasNode(player,"unstoppable")?0.5:0.4;
    if(ab.id==="execute"&&boss.hp/boss.maxHp>=et)return true;
    if(ab.id==="arcane_surge"&&player.surgeActive&&!hasNode(player,"arcane_mastery"))return true;
    return false;
  }

  return (
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",flexDirection:"column",
      fontFamily:"'Georgia',serif",maxWidth:480,margin:"0 auto"}}>

      {showPause&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#0e0e1a",border:"1px solid #2a2a3e",borderRadius:16,
            padding:32,width:"80%",maxWidth:300,textAlign:"center",fontFamily:"'Georgia',serif"}}>
            <div style={{color:"#e05c5c",fontSize:16,letterSpacing:2,marginBottom:6}}>⚔️ BOSS FIGHT</div>
            <div style={{color:"#555",fontSize:12,marginBottom:20}}>{dungeon.name}</div>
            <button onClick={()=>setShowPause(false)} style={{width:"100%",background:"#1a1a2e",
              border:"1px solid #3a3a5e",borderRadius:8,padding:"12px 0",color:"#e8d5a3",
              fontSize:14,cursor:"pointer",marginBottom:10,fontFamily:"'Georgia',serif"}}>CONTINUE</button>
            <button onClick={()=>onAbandon(playerRef.current)} style={{width:"100%",background:"#1a0808",
              border:"1px solid #3e1e1e",borderRadius:8,padding:"12px 0",color:"#e05c5c",
              fontSize:14,cursor:"pointer",fontFamily:"'Georgia',serif"}}>ABANDON RUN</button>
            <button onClick={()=>{setShowPause(false);onViewMap&&onViewMap();}} style={{width:"100%",
              background:"#0e0e1a",border:"1px solid #2a2a3e",borderRadius:8,padding:"10px 0",
              color:"#C8A96E",fontSize:13,cursor:"pointer",marginTop:8,fontFamily:"'Georgia',serif"}}>
              🗺️ VIEW DUNGEON MAP</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{background:"#0e0e1a",borderBottom:`1px solid ${dungeon.color}44`,padding:"10px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={()=>setShowPause(true)} style={{background:"none",border:"none",
          color:"#555",fontSize:18,cursor:"pointer"}}>☰</button>
        <div style={{color:dungeon.color,fontSize:11,letterSpacing:3}}>⚔️ BOSS — {dungeon.name.toUpperCase()}</div>
        <div style={{color:"#C8A96E",fontSize:11}}>✨{player.xpEarned}</div>
      </div>

      {/* Player HP */}
      <div style={{padding:"10px 16px",background:"#0e0e1a",borderBottom:"1px solid #1e1e2e"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
          <div style={{color:"#e8d5a3",fontSize:13}}>❤️ {Math.max(0,player.hp)}/{player.maxHp}
            <span style={{color:"#555",fontSize:10,marginLeft:8}}>{player.characterName}{player.activeTitle?" · "+player.activeTitle:""}</span>
          </div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {passiveBadges.map((b,i)=><Badge key={i} label={b.label} color={b.color}/>)}
          </div>
        </div>
        <div style={{width:"100%",background:"#1a1a2a",borderRadius:4,height:8,overflow:"hidden"}}>
          <div style={{width:`${Math.max(0,Math.min(100,(player.hp/player.maxHp)*100))}%`,
            height:"100%",borderRadius:4,background:"#4caf6e",transition:"width 0.4s"}}/>
        </div>
      </div>

      {/* Boss */}
      <div style={{padding:"16px",background:"#110808",borderBottom:`1px solid ${dungeon.color}33`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <div style={{fontSize:44}}>{boss.icon}</div>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:dungeon.color,fontSize:16}}>{boss.name}</div>
              {boss.inPhase2&&(
                <div style={{color:"#e05c5c",fontSize:10,letterSpacing:2,
                  border:"1px solid #e05c5c44",borderRadius:3,padding:"2px 6px"}}>PHASE 2</div>
              )}
            </div>
            <div style={{color:"#666",fontSize:12,marginTop:2}}>{boss.hp}/{boss.maxHp} HP</div>
            {showNextAction&&!isStunned(boss)&&(
              <div style={{color:"#6EA8C8",fontSize:10,marginTop:2}}>
                Next: {(boss.inPhase2?(dungeon.boss.phase2Actions||dungeon.boss.actions):dungeon.boss.actions)[boss.actionIndex%(boss.inPhase2?(dungeon.boss.phase2Actions||dungeon.boss.actions):dungeon.boss.actions).length]}
              </div>
            )}
          </div>
        </div>
        <div style={{width:"100%",background:"#1a0a0a",borderRadius:4,height:12,overflow:"hidden",
          border:`1px solid ${dungeon.color}33`}}>
          <div style={{width:`${bossHpPct}%`,height:"100%",borderRadius:4,
            background:bossBarColor,transition:"width 0.4s ease",
            boxShadow:bossHpPct>0?`0 0 8px ${bossBarColor}88`:"none"}}/>
        </div>
        {isStunned(boss)&&<div style={{color:"#aaa8e0",fontSize:10,marginTop:4,textAlign:"center"}}>STUNNED</div>}
        {isBleeding(boss)&&<div style={{color:"#e05c5c",fontSize:10,marginTop:4,textAlign:"center"}}>BLEEDING</div>}
      </div>

      {/* Combat Log */}
      <div style={{flex:1,padding:"0 16px 10px",overflowY:"auto",maxHeight:160}}>
        <div style={{color:"#444",fontSize:10,letterSpacing:3,marginTop:10,marginBottom:5}}>COMBAT LOG</div>
        {log.map((entry,i)=><LogEntry key={i} entry={entry} index={i}/>)}
      </div>

      {/* Actions */}
      {phase==="player"&&(
        <div style={{padding:"10px 16px",background:"#0e0e1a",borderTop:"1px solid #1e1e2e"}}>
          <button onClick={handleBasicAttack} style={{width:"100%",background:"#1a1a2e",
            border:"1px solid #3a3a5e",borderRadius:8,padding:"10px 0",color:"#e8d5a3",
            fontSize:13,cursor:"pointer",marginBottom:8,fontFamily:"'Georgia',serif"}}>
            {cls.icon} {cls.basicAttack.name}
          </button>
          <div style={{display:"flex",gap:6}}>
            {player.abilities.map(ab=>{
              const disabled=isAbilityDisabled(ab);
              const surge=(player.surgeActive||hasNode(player,"arcane_mastery"))&&ab.id!=="arcane_surge";
              const silenced=(player.silencedAbilities||[]).includes(ab.id);
              return(
                <button key={ab.id} onClick={()=>handleAbility(ab.id)} disabled={disabled} style={{
                  flex:1,background:disabled?"#111118":silenced?"#1a0808":surge?"#0a1520":"#1a1a2e",
                  border:`1px solid ${silenced?"#e05c5c44":disabled?"#1a1a2a":`${cls.color}44`}`,
                  borderRadius:8,padding:"8px 4px",color:disabled?"#333":"#e8d5a3",
                  cursor:disabled?"not-allowed":"pointer",textAlign:"center",fontFamily:"'Georgia',serif",
                }}>
                  <div style={{fontSize:15}}>{ab.icon}</div>
                  <div style={{fontSize:9,marginTop:2,lineHeight:1.2}}>{ab.name}</div>
                  <div style={{fontSize:10,color:disabled?"#333":cls.color,marginTop:1}}>
                    {surge?"FREE":silenced?"🌀":`${ab.charges}/${ab.maxCharges}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase==="enemy"&&(
        <div style={{padding:16,background:"#0e0e1a",borderTop:"1px solid #1e1e2e",
          textAlign:"center",color:"#e05c5c",fontSize:13}}>{boss.name} acts…</div>
      )}

      {phase==="victory"&&(
        <div style={{padding:24,background:"#0e1a0e",borderTop:`1px solid ${dungeon.color}44`,textAlign:"center"}}>
          <div style={{color:"#C8A96E",fontSize:22,marginBottom:4}}>🏆 Boss Defeated!</div>
          <div style={{color:dungeon.color,fontSize:14,marginBottom:4}}>{dungeon.name} — Cleared!</div>
          <div style={{color:"#555",fontSize:12,marginBottom:16}}>+{boss.xp} XP · +{boss.gold[0]}-{boss.gold[1]} gold</div>
          <button onClick={()=>{
            if(onUnlockAchievement){
              onUnlockAchievement("boss_slayer");
              if(dungeon.id==="abyss") onUnlockAchievement("void_conqueror");
            }
            onVictory(playerRef.current);
          }} style={{
            background:dungeon.color,color:"#0b0b14",border:"none",borderRadius:8,
            padding:"12px 32px",fontSize:14,fontWeight:"bold",cursor:"pointer",
            letterSpacing:2,fontFamily:"'Georgia',serif",
          }}>DUNGEON COMPLETE →</button>
        </div>
      )}

      {phase==="dead"&&(
        <div style={{padding:24,background:"#110808",borderTop:"1px solid #3e1e1e",textAlign:"center"}}>
          <div style={{color:"#e05c5c",fontSize:20,marginBottom:4}}>💀 Fallen</div>
          <div style={{color:"#777",fontSize:13,marginBottom:2}}>{player.characterName} the {cls.name}</div>
          <div style={{color:"#444",fontSize:11,marginBottom:16,fontStyle:"italic"}}>"{epitaph(roomNumber)}"</div>
          <button onClick={()=>onDeath(playerRef.current,[boss])} style={{
            background:"#e05c5c",color:"#fff",border:"none",borderRadius:8,
            padding:"12px 32px",fontSize:14,fontWeight:"bold",cursor:"pointer",
            letterSpacing:2,fontFamily:"'Georgia',serif",
          }}>BEGIN AGAIN</button>
        </div>
      )}
    </div>
  );
}


export default function Game() {
  const [screen,setScreen]=useState("loading");
  const [player,setPlayer]=useState(null);
  const [room,setRoom]=useState(null);
  const [roomNumber,setRoomNumber]=useState(1);
  const [lastRoomType,setLastRoomType]=useState(null);
  const [combatsSinceSpecial,setCombatsSinceSpecial]=useState(0);
  const [pendingRunTree,setPendingRunTree]=useState(null);
  const [viewingMap,setViewingMap]=useState(false);
  const [showTitle,setShowTitle]=useState(true);
  const [soundMuted,setSoundMuted]=useState(()=>{
    try{return localStorage.getItem("gm_muted")==="1";}catch{return false;}
  });
  const [hapticsEnabled,setHapticsEnabled]=useState(()=>{
    try{return localStorage.getItem("gm_haptics")!=="0";}catch{return true;}
  });
  const [pendingClassKey,setPendingClassKey]=useState(null);
  const [runSummary,setRunSummary]=useState(null);
  const [showVictory,setShowVictory]=useState(false);
  const [worldTree,setWorldTree]=useState([]);
  const [graveyard,setGraveyard]=useState([]);
  const [totalXp,setTotalXp]=useState(0);
  const [goldBalance,setGoldBalance]=useState(0);
  const [achievements,setAchievements]=useState({});
  const [purchasedItems,setPurchasedItems]=useState([]);
  const [earnedTitles,setEarnedTitles]=useState([]);
  const [activeTitle,setActiveTitleState]=useState("");
  const [runConsumables,setRunConsumables]=useState([]);
  const [difficulty,setDifficulty]=useState("normal");


  useEffect(()=>{
    SoundEngine.init();
    SoundEngine.setMuted(soundMuted);
    loadPersistent().then(d=>{
      setWorldTree(d.worldTree);setGraveyard(d.graveyard);setTotalXp(d.totalXp);
      setGoldBalance(d.goldBalance);setAchievements(d.achievements);
      setPurchasedItems(d.purchasedItems);setEarnedTitles(d.earnedTitles);
      setActiveTitleState(d.activeTitle);
      setScreen("class_select");
    });
  },[]);

  const currentDungeon=player?DUNGEONS[player.dungeonIndex||0]:null;
  const dungeonRooms=currentDungeon?.rooms||8;
  const isBossRoom=player&&roomNumber>=dungeonRooms;

  function advanceRoom(currentType,newCSS) {
    const resolvedType=currentType||room?.type||null;
    const nextNum=roomNumber+1;
    // Room milestone achievements
    if(nextNum>=10) unlockAchievement("survivor");
    if(nextNum>=25) unlockAchievement("deep_delver");
    const css=newCSS!==undefined?newCSS:combatsSinceSpecial;
    const dungeonIdx=player?.dungeonIndex||0;
    const isBoss=nextNum>=dungeonRooms;
    setLastRoomType(resolvedType);
    setCombatsSinceSpecial(isBoss?99:css);
    setRoom(buildRoom(nextNum,resolvedType,worldTree,isBoss?99:css,dungeonIdx,isBoss,player?.difficulty||"normal"));
    setRoomNumber(nextNum);
  }

  function startRun(classKey) {
    // Check if pre-run node selection needed
    if(worldTree.includes("chosen_path")||worldTree.includes("inherited_skill")){
      setPendingClassKey(classKey);
      return;
    }
    beginRun(classKey, null);
  }

  function unlockAchievement(id) {
    if(achievements[id]) return; // already earned
    const ach=ACHIEVEMENTS.find(a=>a.id===id);
    if(!ach) return;
    const newAch={...achievements,[id]:{date:new Date().toLocaleDateString(),xp:ach.xp}};
    const newTitles=earnedTitles.includes(ach.title)?earnedTitles:[...earnedTitles,ach.title];
    const newXp=totalXp+ach.xp;
    setAchievements(newAch);
    setEarnedTitles(newTitles);
    setTotalXp(newXp);
    savePersistent({worldTree,graveyard,totalXp:newXp,goldBalance,achievements:newAch,purchasedItems,earnedTitles:newTitles,activeTitle});
  }

  function toggleMute() {
    const newMuted=!soundMuted;
    setSoundMuted(newMuted);
    SoundEngine.setMuted(newMuted);
    try{localStorage.setItem("gm_muted",newMuted?"1":"0");}catch{}
    if(!newMuted){SoundEngine.uiTap();}
  }

  function toggleHaptics() {
    const newVal=!hapticsEnabled;
    setHapticsEnabled(newVal);
    try{localStorage.setItem("gm_haptics",newVal?"1":"0");}catch{}
    if(newVal) Haptics.light();
  }

  function beginRun(classKey, preRunNode) {
    const p=buildPlayer(classKey,worldTree,preRunNode,runConsumables,difficulty);
    p.activeTitle=activeTitle;
    p.dungeonIndex=0;
    p.roomsInDungeon=0;
    p.shadowstrikeReady=true;
    setPlayer(p);

    setRoom(buildRoom(1,null,worldTree,99,0,false,difficulty));
    setRoomNumber(1);setLastRoomType(null);
    setCombatsSinceSpecial(99);setPendingRunTree(null);
    setPendingClassKey(null);
    setScreen("combat");
  }

  function handleVictory(finishedPlayer) {
    // Normal combat room victory
    const p=JSON.parse(JSON.stringify(finishedPlayer));
    p.combatsWon=(p.combatsWon||0)+1;
    p.roomsInDungeon=(p.roomsInDungeon||0)+1;
    p.abilities=p.abilities.map(a=>({...a,charges:a.maxCharges}));
    p.gritUsed=false;p.gritCount=0;p.defenseBuff=0;p.defenseBuffTurns=0;
    p.battleCryAttackBonus=0;p.smokeActive=false;p.surgeActive=false;p.arcaneHits=0;
    p.statusEffects=[];p.frenzyTurns=0;p.frenzyBonus=0;p.barkskinReflect=0;
    p.bloodSurgeActive=false;p.bloodSurgeCharges=0;p.retaliationBonus=0;
    p.shadowstrikeReady=true;p.silencedAbilities=[];
    p.damageTakenThisCombat=0;p.onlyBasicThisCombat=true;p.firstAttackThisCombat=true;
    p.killingInstinctReady=true;
    // Achievement checks
    unlockAchievement("first_blood");
    if((finishedPlayer.damageTakenThisCombat||0)===0) unlockAchievement("perfect_room");
    if(finishedPlayer.hp===1) unlockAchievement("glass_cannon");
    if((finishedPlayer.runNodes||[]).length>=5) unlockAchievement("legendary_build");
    // Nature's Gift — restore 5 HP after every combat
    if(worldTree.includes("natures_gift")) p.hp=Math.min(p.maxHp,p.hp+5);
    // Symbiosis bonus (5% extra on nature's gift)
    if(worldTree.includes("natures_gift")&&worldTree.includes("symbiosis")) p.hp=Math.min(p.maxHp,p.hp+1);
    // Tick Beast's Favour temp ATK
    if(p.tempAtkCombatsLeft>0){
      p.tempAtkCombatsLeft--;
      if(p.tempAtkCombatsLeft===0)p.tempAtkBonus=0;
    }
    // Battle Momentum — if won in ≤3 turns grant bonus ATK next combat
    if(worldTree.includes("battle_momentum")){
      // We track this via combatsWon but can't know turns here easily
      // Apply conservatively — check via room counter proxy
      p.battleMomentumBonus=3;
    }
    // Leyline Tap — +5 XP per combat
    if(worldTree.includes("leyline_tap")) p.xpEarned=(p.xpEarned||0)+5;
    // Reset per-combat flags
    p.killingInstinctReady=true;
    p.firstAttackThisCombat=true;
    setPlayer(p);
    const nextNum=roomNumber+1;
    const dungeonIdx=p.dungeonIndex||0;
    const isBoss=nextNum>=dungeonRooms;
    const newCSS=combatsSinceSpecial+1;
    setCombatsSinceSpecial(isBoss?99:newCSS);
    setLastRoomType("combat");
    setRoom(buildRoom(nextNum,"combat",worldTree,isBoss?99:newCSS,dungeonIdx,isBoss,player?.difficulty||"normal"));
    setRoomNumber(nextNum);
  }

  function handleBossVictory(finishedPlayer) {
    // Boss defeated — dungeon complete
    const p=JSON.parse(JSON.stringify(finishedPlayer));
    p.abilities=p.abilities.map(a=>({...a,charges:a.maxCharges}));
    p.gritUsed=false;p.defenseBuff=0;p.defenseBuffTurns=0;
    p.battleCryAttackBonus=0;p.smokeActive=false;p.surgeActive=false;
    p.statusEffects=[];p.frenzyTurns=0;p.frenzyBonus=0;
    p.shadowstrikeReady=true;
    // 50% heal on dungeon completion
    p.hp=Math.min(p.maxHp,p.hp+Math.floor(p.maxHp*0.5));
    // Survivor's Will — +3 max HP per dungeon cleared this run
    p.dungeonsClearedThisRun=(p.dungeonsClearedThisRun||0)+1;
    // Strip first-dungeon consumable bonuses after dungeon 1
    if(p.dungeonsClearedThisRun===1){
      if(p._bladeExpires){p.attack=Math.max(0,p.attack-5);p._bladeExpires=0;}
      if(p._armourExpires){p.defense=Math.max(0,p.defense-3);p._armourExpires=0;}
    }
    unlockAchievement("unstoppable");
    // Iron run — only basics used this entire dungeon
    if(p.onlyBasicThisDungeon===true) unlockAchievement("iron_run");
    p.onlyBasicThisDungeon=true;
    if(worldTree.includes("survivors_will")){
      const bonus=p.dungeonsClearedThisRun*3;
      p.maxHp+=3;
      p.hp=Math.min(p.maxHp,p.hp+3);
    }
    // Leyline Tap boss XP already awarded in awardKill, add bonus
    if(worldTree.includes("leyline_tap")) p.xpEarned=(p.xpEarned||0)+10;
    // Reset ritual counter for next dungeon
    p.ritualUsedThisCampfire=0;
    p.ritualCount=0;
    // Draw run tree options
    const options=drawRunTreeOptions(p.classKey,p.seenNodeIds||[]);
    p.currentRunTreeOptions=options;
    setPlayer(p);
    if(options.length>0){
      setPendingRunTree({options,source:"boss"});
    } else {
      const np=JSON.parse(JSON.stringify(p));
      np.dungeonIndex=(np.dungeonIndex||0)+1;
      setPlayer(np);
      setScreen("worldmap");
    }
  }

  function handleRunTreeChoice(nodeId) {
    setPlayer(p=>{
      const np=applyRunNode(p,nodeId);
      np.dungeonIndex=(np.dungeonIndex||0)+1;
      np.roomsInDungeon=0;
      np.currentRunTreeOptions=[];
      return np;
    });
    setPendingRunTree(null);
    setScreen("worldmap");
  }

  function handleEnterDungeon() {
    const dungeonIdx=player.dungeonIndex||0;
    if(dungeonIdx>=DUNGEONS.length){
      // All dungeons cleared — victory
      setShowVictory(true);
      unlockAchievement("legend");
      return;
    }
    const p=JSON.parse(JSON.stringify(player));
    p.roomsInDungeon=0;
    setPlayer(p);
    setRoom(buildRoom(1,null,worldTree,99,dungeonIdx,false,difficulty));
    setRoomNumber(1);
    setLastRoomType(null);
    setCombatsSinceSpecial(99);
    setScreen("combat");
  }

  async function saveRunToGraveyard(p,killingEnemies,abandoned) {
    const killer=killingEnemies?.filter(e=>e&&e.hp>0)[0];
    const dungeon=DUNGEONS[p.dungeonIndex||0];
    const run={
      classKey:p.classKey,characterName:p.characterName,
      className:CLASSES[p.classKey]?.name,
      activeTitle:p.activeTitle||"",
      roomsReached:roomNumber,dungeon:dungeon?.name||"Unknown",
      combatsWon:p.combatsWon||0,runNodes:p.runNodes||[],
      xpEarned:p.xpEarned||0,killedBy:abandoned?null:killer?.name||null,
      abandoned:!!abandoned,date:new Date().toLocaleDateString(),
    };
    const ng=[...graveyard,run];
    const nx=totalXp+(p.xpEarned||0);
    // Bank gold from this run — read directly from player object to avoid stale closure
    const newGold=goldBalance+(p.gold||0);
    setGraveyard(ng);setTotalXp(nx);setGoldBalance(newGold);
    // Clear consumables after run
    setRunConsumables([]);
    // Achievements
    const deaths=ng.filter(r=>!r.abandoned).length;
    if(deaths>=10) unlockAchievement("bloodied_hands");
    if((p.gold||0)>=100&&!abandoned) unlockAchievement("penny_pincher");
    const usedClasses=new Set(ng.filter(r=>!r.abandoned).map(r=>r.classKey));
    if(["warrior","rogue","mage","druid","blood_knight"].every(c=>usedClasses.has(c)))
      unlockAchievement("polymath");
    await savePersistent({worldTree,graveyard:ng,totalXp:nx,goldBalance:newGold,achievements,purchasedItems,earnedTitles,activeTitle});
    // Shared leaderboard — placeholder for backend API integration
    // Replace with your API endpoint when deploying with a backend
    try {
      const score=(DUNGEONS.findIndex(d=>d.name===run.dungeon)>=0?DUNGEONS.findIndex(d=>d.name===run.dungeon):0)*1000+(run.roomsReached||0)*10+(run.xpEarned||0);
      // TODO: POST to your leaderboard API: { ...run, score }
      // Example: await fetch("/api/leaderboard", { method:"POST", body: JSON.stringify({...run,score}) });
      console.log("Run score:", score, "— connect leaderboard API here");
    } catch(e){}
  }

  async function handleDeath(deadPlayer,killingEnemies) {
    await saveRunToGraveyard(deadPlayer,killingEnemies,false);
    const killer=killingEnemies?.filter(e=>e&&e.hp>0)[0];
    setRunSummary({player:deadPlayer,killedBy:killer?.name||null,abandoned:false});
    setScreen("summary");
  }

  async function handleAbandon(currentPlayer) {
    await saveRunToGraveyard(currentPlayer,[],true);
    setRunSummary({player:currentPlayer,killedBy:null,abandoned:true});
    setScreen("summary");
  }

  function handleGoldStoreBuy(item) {
    SoundEngine.purchase(); Haptics.unlock();
    const newGold=goldBalance-item.cost;
    setGoldBalance(newGold);
    setRunConsumables(c=>[...c,item.id]);
    savePersistent({worldTree,graveyard,totalXp,goldBalance:newGold,achievements,purchasedItems,earnedTitles,activeTitle});
  }

  function handleGoldStoreBuyPermanent(item) {
    const newGold=goldBalance-item.cost;
    const newPurchased=[...purchasedItems,item.id];
    setGoldBalance(newGold);setPurchasedItems(newPurchased);
    savePersistent({worldTree,graveyard,totalXp,goldBalance:newGold,achievements,purchasedItems:newPurchased,earnedTitles,activeTitle});
  }

  function handleSetTitle(title) {
    setActiveTitleState(title);
    savePersistent({worldTree,graveyard,totalXp,goldBalance,achievements,purchasedItems,earnedTitles,activeTitle:title});
  }

  function handleDarkRitual() {
    setPlayer(p=>{
      const np=JSON.parse(JSON.stringify(p));
      if(np.darkRitualUsed)return np;
      np.hp=Math.max(1,np.hp-20);
      np.xpEarned=(np.xpEarned||0)+15;
      np.darkRitualUsed=true;
      return np;
    });
  }

  function handleEventChoice(side, event, gambleResult) {
    setPlayer(p=>{
      const np=JSON.parse(JSON.stringify(p));
      const choice=side==="A"?event.choiceA:event.choiceB;
      if(!choice||choice.skip)return np;

      if(choice.hpCost)  np.hp=Math.max(1,np.hp-choice.hpCost);
      if(choice.defBonus)np.defense+=choice.defBonus;
      if(choice.atkBonus)np.attack+=choice.atkBonus;
      if(choice.gold)    { if(choice.gold>0)np.gold+=choice.gold; else np.gold=Math.max(0,np.gold+choice.gold); }
      if(choice.rechargeAll){np.abilities=np.abilities.map(a=>({...a,charges:a.maxCharges}));}
      if(choice.freeNode){
        const opts=drawRunTreeOptions(np.classKey,np.seenNodeIds||[]);
        if(opts.length>0){
          const node=opts[Math.floor(Math.random()*opts.length)];
          const applied=applyRunNode(np,node.id);
          Object.assign(np,applied);
        }
      }
      if(choice.tempAtk){ np.tempAtkBonus=choice.tempAtk; np.tempAtkCombatsLeft=choice.tempAtkDuration; }
      if(choice.challengerMark) np.challengerMarkActive=true;
      if(choice.seerReading){
        // Preview next 3 room types
        const preview=[];
        let lt=room?.type||"event";
        let css=0;
        for(let i=0;i<3;i++){
          const t=pickRoomType(lt,worldTree,css+2);
          preview.push(t);
          if(t==="combat")css++;else css=0;
          lt=t;
        }
        np.seerPreview=preview;
      }
      if(gambleResult==="win")  np.hp=Math.min(np.maxHp,np.hp+25);
      if(gambleResult==="lose") { np.hp=Math.max(1,np.hp-15); np.attack+=2; }
      return np;
    });
    advanceRoom("event",0);
  }

  function handleRestChoice(choice) {
    setPlayer(p=>{
      const np=JSON.parse(JSON.stringify(p));
      const baseHealPct=worldTree.includes("herbalist")?0.5:0.4;
      const extraHealPct=worldTree.includes("wild_growth")?0.1:worldTree.includes("wild_roots")?0.05:0;
      const healAmt=Math.floor(np.maxHp*(baseHealPct+extraHealPct));
      const basePct=worldTree.includes("forager")?0.15:0.20;
      const cost=ritualCost(np.maxHp,np.ritualCount||0,basePct);
      if(choice==="heal"){
        np.hp=Math.min(np.maxHp,np.hp+healAmt);
      }
      else if(choice==="frenzy"){np.frenzyTurns=2;np.frenzyBonus=6;}
      else if(choice==="ritual"){
        if(hasNode(np,"titan")){np.maxHp+=5;np.hp=Math.min(np.maxHp,np.hp+5);np.attack+=2;np.defense+=2;}
        else{np.hp=Math.max(1,np.hp-cost);np.attack+=2;np.defense+=2;}
        np.ritualCount=(np.ritualCount||0)+1;
      }
      return np;
    });
    // Iron Discipline — reset ability charges on rest too
    if(worldTree.includes("iron_discipline")&&choice==="heal"){
      setPlayer(p=>{
        const np=JSON.parse(JSON.stringify(p));
        np.abilities=np.abilities.map(a=>({...a,charges:a.maxCharges}));
        return np;
      });
    }
    // Bloom — rest heal restores 1 random ability charge
    if(worldTree.includes("bloom")&&choice==="heal"){
      setPlayer(p=>{
        const np=JSON.parse(JSON.stringify(p));
        const needsCharge=np.abilities.filter(a=>a.charges<a.maxCharges);
        if(needsCharge.length>0){
          const pick=needsCharge[Math.floor(Math.random()*needsCharge.length)];
          np.abilities.find(a=>a.id===pick.id).charges++;
        }
        return np;
      });
    }
    // Achievement: ritual addict
    if((player.ritualsThisRun||0)>=3) unlockAchievement("ritual_addict");
    // Use setTimeout to ensure setPlayer has settled before advanceRoom
    setTimeout(()=>advanceRoom("rest",0),50);
  }

  function handleShrineChoice(choice,data) {
    if(choice==="leave"){advanceRoom("shrine",0);return;}
    if(choice==="stat"&&data){
      setPlayer(p=>{
        const np=JSON.parse(JSON.stringify(p));
        data.apply(np);
        np.xpEarned=Math.max(0,(np.xpEarned||0)-data.cost);
        return np;
      });
    }
    if(choice==="bonus_node"){
      const options=drawRunTreeOptions(player.classKey,player.seenNodeIds||[]);
      setPlayer(p=>{
        const np=JSON.parse(JSON.stringify(p));
        np.xpEarned=Math.max(0,(np.xpEarned||0)-50);
        return np;
      });
      // Use shrine-specific pending flag so we don't advance dungeon
      if(options.length>0) setPendingRunTree({options,source:"shrine"});
    }
  }

  async function handleWorldTreePurchase(node) {
    const spent=WORLD_TREE_NODES.filter(n=>worldTree.includes(n.id)).reduce((s,n)=>s+n.cost,0);
    if(totalXp-spent<node.cost)return;
    const nwt=[...worldTree,node.id];
    setWorldTree(nwt);
    SoundEngine.nodeUnlock(); Haptics.unlock();
    // Check achievements
    if(nwt.length>=10) unlockAchievement("world_traveller");
    if(node.unlocks==="druid") unlockAchievement("child_of_nature");
    if(node.unlocks==="blood_knight") unlockAchievement("dark_arts_master");
    await savePersistent({worldTree:nwt,graveyard,totalXp,goldBalance,achievements,purchasedItems,earnedTitles,activeTitle});
  }

  if(showTitle)return <TitleScreen onStart={()=>{SoundEngine.uiTap();setShowTitle(false);}}/>;


  if(screen==="leaderboard")return <LeaderboardScreen graveyard={graveyard}
    onBack={()=>setScreen("class_select")}/>;

  if(screen==="settings")return <SettingsScreen
    soundMuted={soundMuted} onToggleMute={toggleMute}
    hapticsEnabled={hapticsEnabled} onToggleHaptics={toggleHaptics}
    difficulty={difficulty} onSetDifficulty={setDifficulty}
    onBack={()=>setScreen("class_select")}/>;

  if(screen==="titles")return <TitleSelectScreen
    earnedTitles={earnedTitles} activeTitle={activeTitle}
    onSetTitle={(t)=>{handleSetTitle(t);}}
    onBack={()=>setScreen("class_select")}/>;

  if(screen==="store")return <GoldStoreScreen
    goldBalance={goldBalance} purchasedItems={purchasedItems}
    runConsumables={runConsumables}
    onBuy={handleGoldStoreBuy} onBuyPermanent={handleGoldStoreBuyPermanent}
    onBack={()=>setScreen("class_select")}/>;

  if(screen==="trophyroom")return <TrophyRoomScreen
    achievements={achievements} earnedTitles={earnedTitles}
    activeTitle={activeTitle} onSetTitle={handleSetTitle}
    onBack={()=>setScreen("class_select")}/>;

  // Mid-run map overlay
  if(viewingMap&&player)return <WorldMapScreen player={player}
    dungeons={DUNGEONS} onEnter={null}
    onBack={()=>setViewingMap(false)}/>;

  // Pre-run node selection
  if(pendingClassKey){
    return <PreRunNodeScreen classKey={pendingClassKey} worldTree={worldTree}
      onStart={(nodeId)=>beginRun(pendingClassKey,nodeId)}
      onSkip={()=>beginRun(pendingClassKey,null)}/>;
  }

  // Run summary (death or abandon)
  if(screen==="summary"&&runSummary){
    const dungeon=DUNGEONS[runSummary.player?.dungeonIndex||0];
    return <RunSummaryScreen
      player={runSummary.player} roomNumber={roomNumber}
      dungeon={dungeon} killedBy={runSummary.killedBy}
      abandoned={runSummary.abandoned}
      onContinue={()=>{
        setRunSummary(null);setScreen("class_select");
        setPlayer(null);setRoom(null);setRoomNumber(1);
        setLastRoomType(null);setPendingRunTree(null);setCombatsSinceSpecial(0);
      }}/>;
  }

  // Victory — all dungeons cleared
  if(showVictory&&player){
    return <VictoryScreen player={player} totalXp={totalXp}
      onContinue={async()=>{
        await saveRunToGraveyard(player,[],false);
        setShowVictory(false);
        setScreen("class_select");
        setPlayer(null);setRoom(null);setRoomNumber(1);
        setLastRoomType(null);setPendingRunTree(null);setCombatsSinceSpecial(0);
      }}/>;
  }

  if(screen==="loading")return(
    <div style={{minHeight:"100vh",background:"#0b0b14",display:"flex",alignItems:"center",
      justifyContent:"center",color:"#C8A96E",fontFamily:"'Georgia',serif",fontSize:14,letterSpacing:4}}>LOADING…</div>
  );
  if(screen==="graveyard")return <GraveyardScreen graveyard={graveyard} onBack={()=>setScreen("class_select")}/>;
  if(screen==="worldtree")return <WorldTreeScreen totalXp={totalXp} worldTree={worldTree}
    onPurchase={handleWorldTreePurchase} onBack={()=>setScreen("class_select")}/>;
  if(screen==="class_select")return <ClassSelectScreen onSelect={startRun} graveyard={graveyard}
    totalXp={totalXp} worldTree={worldTree} goldBalance={goldBalance}
    purchasedItems={purchasedItems} activeTitle={activeTitle} earnedTitles={earnedTitles}
    soundMuted={soundMuted} onToggleMute={toggleMute}
    difficulty={difficulty} onSetDifficulty={setDifficulty}
    onOpenGraveyard={()=>setScreen("graveyard")}
    onOpenWorldTree={()=>setScreen("worldtree")}
    onOpenStore={()=>setScreen("store")}
    onOpenTitles={()=>setScreen("titles")}
    onOpenLeaderboard={()=>setScreen("leaderboard")}
    onOpenSettings={()=>setScreen("settings")}
    onOpenTrophyRoom={()=>setScreen("trophyroom")}/>;
  if(showVictory&&player){} // handled above
  if(screen==="worldmap"&&player)return <WorldMapScreen player={player}
    dungeons={DUNGEONS} onEnter={handleEnterDungeon}
    showBossPreview={purchasedItems.includes("cartographers_journal")}
    onBack={()=>setScreen("class_select")}/>;

  // Run tree — boss completion or shrine bonus
  if(pendingRunTree&&player){
    const isShrine=pendingRunTree.source==="shrine";
    const options=pendingRunTree.options||pendingRunTree;
    return <RunTreeScreen player={player} options={options}
      dungeonName={isShrine?"Shrine Bonus":DUNGEONS[(player.dungeonIndex||1)-1]?.name}
      onChoice={(nodeId)=>{
        if(isShrine){
          // Shrine: apply node, stay in current dungeon, advance past shrine room
          setPlayer(p=>applyRunNode(p,nodeId));
          setPendingRunTree(null);
          advanceRoom("shrine",0);
        } else {
          // Boss: advance dungeon as normal
          handleRunTreeChoice(nodeId);
        }
      }}/>;
  }

  if(screen==="combat"&&player&&room){
    if(room.type==="boss"){
      return <BossScreen key={`boss-${roomNumber}`} player={player} boss={room.boss}
        dungeonIndex={player.dungeonIndex||0}
        onVictory={handleBossVictory} onDeath={handleDeath} onAbandon={handleAbandon}
        onViewMap={()=>setViewingMap(true)} roomNumber={roomNumber} worldTree={worldTree}
        onUnlockAchievement={unlockAchievement}/>;
    }
    if(room.type==="combat"){
      return <CombatScreen key={roomNumber} player={player} room={room} worldTree={worldTree}
        onVictory={handleVictory} onDeath={handleDeath} onAbandon={handleAbandon}
        onViewMap={()=>setViewingMap(true)} roomNumber={roomNumber}
        onUnlockAchievement={unlockAchievement} purchasedItems={purchasedItems}/>;
    }
    if(room.type==="rest"){
      return <RestRoom key={roomNumber} player={player} roomNumber={roomNumber}
        worldTree={worldTree} onChoice={handleRestChoice}/>;
    }
    if(room.type==="shrine"){
      return <ShrineRoom key={roomNumber} player={player} roomNumber={roomNumber}
        onChoice={handleShrineChoice}/>;
    }
    if(room.type==="event"){
      return <EventRoom key={roomNumber} player={player} event={room.event}
        roomNumber={roomNumber} seerPreview={player.seerPreview||[]}
        onChoice={handleEventChoice}/>;
    }
    if(room.type==="merchant"){
      return <MerchantRoom key={roomNumber} player={player} item={room.item}
        roomNumber={roomNumber}
        onChoice={(choice,item)=>{
          if(choice==="leave"){advanceRoom("merchant",0);return;}
          setPlayer(p=>{
            const np=JSON.parse(JSON.stringify(p));
            if(choice==="heal"){const h=Math.floor(np.maxHp*0.4);np.hp=Math.min(np.maxHp,np.hp+h);}
            else if(choice==="item"&&item){
              if(item.type==="stat")np[item.stat]+=item.amount;
              else if(item.type==="maxhp"){np.maxHp+=item.amount;np.hp=Math.min(np.maxHp,np.hp+item.amount);}
              else if(item.type==="healpct"){np.hp=Math.min(np.maxHp,np.hp+Math.floor(np.maxHp*(item.pct||0.65)));}
              else if(item.type==="multi"){if(item.attack)np.attack+=item.attack;if(item.defense)np.defense+=item.defense;if(item.maxhp){np.maxHp+=item.maxhp;np.hp=Math.min(np.maxHp,np.hp+item.maxhp);}}
              else if(item.type==="cleanse"){np.statusEffects=[];}
              else if(item.type==="charges"){np.abilities=np.abilities.map(a=>({...a,charges:a.maxCharges}));}
              else if(item.type==="randnode"){
                const opts=drawRunTreeOptions(np.classKey,np.seenNodeIds||[]);
                if(opts.length>0){const n=opts[Math.floor(Math.random()*opts.length)];Object.assign(np,applyRunNode(np,n.id));}
              }
            } else if(choice==="convert"){
              const xg=Math.floor(np.gold/2);np.xpEarned=(np.xpEarned||0)+xg;np.gold=0;
            }
            return np;
          });
          const nextNum=roomNumber+1;
          setTimeout(()=>{
            const dungeonIdx=player?.dungeonIndex||0;
            const isBoss=nextNum>=dungeonRooms;
            setLastRoomType("merchant");
            setCombatsSinceSpecial(isBoss?99:0);
            setRoom(buildRoom(nextNum,"merchant",worldTree,isBoss?99:0,dungeonIdx,isBoss,player?.difficulty||"normal"));
            setRoomNumber(nextNum);
          },600);
        }}/>;    }
  }
  return null;
}
