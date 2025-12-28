



import { WeaponType } from './types';

export const GAME_CONSTANTS = {
  // Base Speeds (degrees per tick)
  MAX_SPEED_ZOMBIE: 0.000008, // Slightly increased to make them more dangerous
  MAX_SPEED_SOLDIER: 0.000008,   
  MAX_SPEED_CIVILIAN: 0.000005,  
  
  // Speed Multipliers
  MULT_SPRINT: 1.2, 
  MULT_WANDER: 0.6, 

  // Speed Penalties (When inside buildings)
  PENALTY_CIVILIAN: 0.5,    // 50% reduction
  PENALTY_ZOMBIE: 0.2,      // 80% reduction (Zombies are slower indoors)
  PENALTY_PROFESSIONAL: 0.9, // 10% reduction (Hardly affected)

  // Ranges (degrees)
  INFECTION_RANGE: 0.00022, // Increased range to make infection easier
  VISION_RANGE_ZOMBIE: 0.0030, // Increased vision  
  VISION_RANGE_HUMAN: 0.0030,
  
  // Steering Forces (Weights)
  FORCE_SEPARATION: 3.0, 
  FORCE_SEEK: 1.5,       
  FORCE_FLEE: 4.0,       
  FORCE_WANDER: 0.8,     
  FORCE_COHESION: 0.2,   
  
  // Physics
  SEPARATION_RADIUS: 0.00015, 
  
  // Area of Effect
  AIRSTRIKE_RADIUS: 0.0006,
  SUPPLY_RADIUS: 0.000375,
  
  // Game Logic
  TICK_RATE: 50, // ms
  INITIAL_POPULATION: 120,
  SPAWN_RADIUS: 0.0025,
  INFECTION_DURATION: 5000, // 5 seconds of continuous contact needed
  ROCKET_AMMO_LIMIT: 3,
  SNIPER_COOLDOWN: 5000, // 5 seconds cooldown for snipers
  
  // Economy & Cooldowns
  INITIAL_RESOURCES: 1000,
  PASSIVE_INCOME: 0, // No auto money
  
  COST_SUPPLY: 50,
  COST_SPEC_OPS: 100,
  COST_AIRSTRIKE: 200,
  COST_MEDIC: 50,

  // Cooldowns (ms)
  COOLDOWN_SUPPLY: 30000,    // 30s
  COOLDOWN_SPECOPS: 60000,   // 60s
  COOLDOWN_AIRSTRIKE: 120000,// 120s
  COOLDOWN_MEDIC: 80000,     // 80s
  COOLDOWN_TACTICAL_ANALYSIS: 60000, // 60s
  COOLDOWN_SCAVENGE: 120000, // 120s

  // Scavenge Rewards
  REWARD_INDUSTRIAL: 100,
  REWARD_COMMERCIAL: 60,
  REWARD_RESIDENTIAL: 40,
  REWARD_PUBLIC: 20,

  // Mechanics
  NET_DURATION: 30000, // 30s (in ms, convert to ticks in logic)
  HEAL_DURATION: 5000, // 5s

  // Bubbling / Mood
  MOOD_CHANCE: 0.005, // Chance per tick to show a new mood
  MOOD_DURATION: 4000, // Duration of the bubble in ms

  // BGM Logic
  COMBAT_COOLDOWN_TICKS: 100, // ~5 seconds (50ms * 100)
  DANGER_VISION_RANGE: 0.0015, // Distance humans feel "danger"

  // Interaction
  ITEM_PICKUP_RADIUS: 0.00015,
  SUPPLY_DROP_CURSOR_RADIUS: 0.0003, // approx building size (reduced to 1/4)
};

export const MOOD_ICONS = {
  CIVILIAN_CALM: ["😊", "🤔", "☕", "📱", "🏠", "🎶", "🚶"],
  CIVILIAN_PANIC: ["😱", "🏃", "🆘", "😨", "💔", "🩹", "🔥"],
  CIVILIAN_ARMED: ["🔫", "😤", "🎯", "🛡️", "🔥", "💢"],
  SOLDIER: ["🫡", "🪖", "🔫", "📡", "🎯", "🛡️"],
  MEDIC: ["💉", "🏥", "🩹", "🩺", "🚑", "🧪"],
  ZOMBIE: ["🧟", "🧠", "🥩", "🩸", "💀", "🤤", "🥩"],
  ZOMBIE_TRAPPED: ["⛓️", "💢", "😡", "🧊", "⛓️"],
  CROSSING: ["🚪", "🧱", "🏢", "🏠", "🏃‍♂️", "💨"],
};

export const WEAPON_STATS = {
  [WeaponType.PISTOL]: {
    range: 0.0005,
    damage: 4,
    color: '#FBBF24', 
    nameKey: 'weapons.pistol',
    descKey: 'weapons.pistol_desc'
  },
  [WeaponType.SHOTGUN]: {
    range: 0.0004,
    damage: 15,
    color: '#F97316', 
    nameKey: 'weapons.shotgun',
    descKey: 'weapons.shotgun_desc'
  },
  [WeaponType.SNIPER]: {
    range: 0.0018, // Significantly increased range
    damage: 20, 
    color: '#FFFFFF', 
    nameKey: 'weapons.sniper',
    descKey: 'weapons.sniper_desc'
  },
  [WeaponType.ROCKET]: {
    range: 0.0008,
    damage: 25,
    splashRadius: 0.0004,
    color: '#EF4444', 
    nameKey: 'weapons.rocket',
    descKey: 'weapons.rocket_desc'
  },
  [WeaponType.NET_GUN]: {
    range: 0.0006,
    damage: 0, // No damage
    color: '#2DD4BF', // Teal
    nameKey: 'weapons.net_gun',
    descKey: 'weapons.net_gun_desc'
  }
};

export const WEAPON_SYMBOLS = {
  [WeaponType.PISTOL]: 'I',
  [WeaponType.SHOTGUN]: '∴',
  [WeaponType.SNIPER]: '⌖',
  [WeaponType.ROCKET]: '●',
  [WeaponType.NET_GUN]: '#'
};

export const DEFAULT_LOCATION = {
  lat: 40.7580,
  lng: -73.9855
};