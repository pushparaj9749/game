export const WORLD_SIZE = 4200;
export const BOT_COUNT = 29; // + player => 30 players

export const AMMO = {
  light: { name: 'Light', color: '#ffd75e' },
  medium: { name: 'Medium', color: '#7fd6ff' },
  heavy: { name: 'Heavy', color: '#ff8a5e' },
};

export const WEAPONS = {
  fists: {
    name: 'Fists', ammo: null, damage: 8, rate: 420, mag: 0, reload: 0,
    spread: 0, speed: 0, pellets: 0, range: 40, auto: false, melee: true, color: '#ccc',
  },
  pistol: {
    name: 'M500', label: 'PISTOL', ammo: 'light', damage: 17, rate: 240, mag: 7,
    reload: 1.15, spread: 0.045, speed: 1500, pellets: 1, range: 900, auto: false,
    recoil: 1.6, color: '#e6e6e6', tier: 1,
  },
  smg: {
    name: 'MP40', label: 'SMG', ammo: 'light', damage: 11, rate: 78, mag: 30,
    reload: 1.9, spread: 0.085, speed: 1400, pellets: 1, range: 720, auto: true,
    recoil: 1.1, color: '#59d6ff', tier: 2,
  },
  ar: {
    name: 'AK47', label: 'RIFLE', ammo: 'medium', damage: 23, rate: 115, mag: 30,
    reload: 2.2, spread: 0.055, speed: 1750, pellets: 1, range: 1150, auto: true,
    recoil: 2.1, color: '#ffb03a', tier: 3,
  },
  scar: {
    name: 'SCAR', label: 'RIFLE', ammo: 'medium', damage: 20, rate: 100, mag: 35,
    reload: 2.4, spread: 0.045, speed: 1850, pellets: 1, range: 1250, auto: true,
    recoil: 1.8, color: '#ffd66b', tier: 3,
  },
  shotgun: {
    name: 'M1014', label: 'SHOTGUN', ammo: 'heavy', damage: 11, rate: 850, mag: 6,
    reload: 2.7, spread: 0.2, speed: 1250, pellets: 7, range: 480, auto: false,
    recoil: 4.5, color: '#ff7a45', tier: 2,
  },
  sniper: {
    name: 'AWM', label: 'SNIPER', ammo: 'heavy', damage: 85, rate: 1500, mag: 5,
    reload: 3.0, spread: 0.008, speed: 2600, pellets: 1, range: 2400, auto: false,
    recoil: 5, color: '#c77dff', tier: 4,
  },
};

export const WEAPON_DROPS = ['pistol', 'pistol', 'smg', 'smg', 'ar', 'ar', 'scar', 'shotgun', 'shotgun', 'sniper'];

export const ZONE_PHASES = [
  { wait: 42, shrink: 30, radius: 0.52, dps: 2 },
  { wait: 30, shrink: 26, radius: 0.30, dps: 4 },
  { wait: 24, shrink: 22, radius: 0.16, dps: 7 },
  { wait: 20, shrink: 18, radius: 0.075, dps: 11 },
  { wait: 14, shrink: 16, radius: 0.0, dps: 16 },
];

export const NAMES = [
  'ShadowX', 'RaviOP', 'NovaKid', 'Blaze07', 'GhostRider', 'ToxicRaj', 'LoneWolf', 'SkyFall',
  'AceHunter', 'Viper', 'NeonBolt', 'ZeroKill', 'Frosty', 'IronFist', 'RapidFire', 'KingSlayer',
  'SniperBoi', 'Thunder', 'PixelNinja', 'MadMax', 'Cobra', 'RogueOne', 'Havoc', 'SlyFox',
  'Butcher', 'Krypto', 'Vortex', 'DesiGamer', 'AlphaWolf', 'RageQuit', 'SilentStorm', 'DeadEye',
];

export const SKINS = [
  { body: '#3b6fd4', head: '#f2c49b', accent: '#8fd3ff' },
  { body: '#d94f4f', head: '#e8b088', accent: '#ffb3a7' },
  { body: '#3fa86a', head: '#c98f63', accent: '#9ff3c0' },
  { body: '#8a5ad6', head: '#f2c49b', accent: '#d3b0ff' },
  { body: '#e0a13a', head: '#a86f43', accent: '#ffe0a3' },
  { body: '#2f9aa8', head: '#e8b088', accent: '#8ff0ff' },
  { body: '#c2559c', head: '#f2c49b', accent: '#ffb0e0' },
  { body: '#5d6470', head: '#c98f63', accent: '#c6cedb' },
];

export const DISTRICTS = [
  'Bermuda', 'Peak', 'Clock Tower', 'Bimasakti', 'Mill', 'Cape Town', 'Katulistiwa', 'Riverside',
  'Hangar', 'Shipyard', 'Refinery', 'Old Factory', 'Forsaken Creek', 'Nexus',
];

export const SETTINGS = {
  playerSpeed: 232,
  sprintMul: 1.42,
  botSpeed: 196,
  playerRadius: 17,
  bulletGravity: 0,
  reviveTime: 0,
};
