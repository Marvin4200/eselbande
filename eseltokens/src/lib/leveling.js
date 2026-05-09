// XP per token redeemed
export const XP_PER_TOKEN = 10;

// Softcap starts at level 20 — XP growth rate increases
// Hardcap starts at level 50 — XP growth rate increases more
// But it never stops — infinite levels

/**
 * XP required to go from level N to level N+1
 * Normal (1-19):   100 * 1.12^level
 * Softcap (20-49): base * 1.20^(level-19)
 * Hardcap (50+):   base * 1.35^(level-49)
 */
export function xpForLevel(level) {
  if (level < 1) return 0;

  if (level < 20) {
    return Math.floor(100 * Math.pow(1.12, level));
  }

  // Calculate the XP at the softcap boundary
  const softcapBase = Math.floor(100 * Math.pow(1.12, 20));

  if (level < 50) {
    return Math.floor(softcapBase * Math.pow(1.20, level - 19));
  }

  // Calculate the XP at the hardcap boundary
  const hardcapBase = Math.floor(softcapBase * Math.pow(1.20, 31));
  return Math.floor(hardcapBase * Math.pow(1.35, level - 49));
}

/**
 * Total XP needed to reach a given level (from 0)
 */
export function totalXpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

/**
 * Given total XP, compute current level and progress
 */
export function getLevelInfo(totalXp) {
  let level = 1;
  let remaining = totalXp;

  while (true) {
    const needed = xpForLevel(level);
    if (remaining < needed) {
      return {
        level,
        currentXp: remaining,
        xpNeeded: needed,
        totalXp,
        progress: needed > 0 ? remaining / needed : 0,
      };
    }
    remaining -= needed;
    level++;
  }
}

/**
 * Get a title/rank name based on level
 */
export function getLevelTitle(level) {
  if (level >= 100) return 'Esel-Gott';
  if (level >= 75) return 'Esel-Legende';
  if (level >= 50) return 'Esel-Meister';
  if (level >= 40) return 'Esel-Veteran';
  if (level >= 30) return 'Esel-Experte';
  if (level >= 20) return 'Esel-Profi';
  if (level >= 15) return 'Esel-Kenner';
  if (level >= 10) return 'Esel-Reiter';
  if (level >= 5) return 'Esel-Freund';
  return 'Neuling';
}

/**
 * Get color class based on level tier
 */
export function getLevelColor(level) {
  if (level >= 100) return 'from-red-500 to-amber-400';
  if (level >= 75) return 'from-amber-400 to-yellow-300';
  if (level >= 50) return 'from-purple-500 to-pink-400';
  if (level >= 40) return 'from-blue-500 to-purple-400';
  if (level >= 30) return 'from-emerald-400 to-cyan-400';
  if (level >= 20) return 'from-green-400 to-emerald-400';
  if (level >= 10) return 'from-blue-400 to-blue-300';
  if (level >= 5) return 'from-gray-300 to-gray-200';
  return 'from-gray-500 to-gray-400';
}
