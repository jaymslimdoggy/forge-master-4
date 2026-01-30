
import { Quality, Equipment, EquipmentType, Stat, Material, ForgeSession, MaterialEffectType } from '../types';
import { STAT_CONFIG, FORGE_ACTIONS, HEAT_CONFIG } from '../constants';

// --- Helper to aggregate effects ---
export const getEffectStrength = (materials: Material[], type: MaterialEffectType): number => {
    return materials.reduce((sum, m) => m.effectType === type ? sum + m.effectValue : sum, 0);
};

// --- Helper: Determine Heat Zone ---
export const getHeatZone = (temp: number) => {
    if (temp < HEAT_CONFIG.OPTIMAL_START) return 'LOW';
    if (temp >= HEAT_CONFIG.OVERHEAT_START) return 'OVERHEAT';
    return 'OPTIMAL';
};

// --- Helper: Calculate Cost (Exported for UI) ---
export const getForgeActionCost = (session: ForgeSession, action: 'LIGHT' | 'HEAVY' | 'QUENCH' | 'POLISH'): number => {
    if (action === 'QUENCH') return 0; 
    
    // Polish Logic: EXPONENTIAL COST
    if (action === 'POLISH') {
         return 10 + (5 * Math.pow(session.polishCount, 2));
    }

    const config = action === 'LIGHT' ? FORGE_ACTIONS.LIGHT : FORGE_ACTIONS.HEAVY;
    
    if (action === 'LIGHT' && session.comboActive) {
        return 0;
    }

    const zone = getHeatZone(session.temperature);
    let zoneCostMult = 1.0;
    
    const hasTalentHeatShield = action === 'HEAVY' && session.unlockedTalents.includes('t_dur_2');
    const heatResistStrength = getEffectStrength(session.materials, 'SPECIAL_HEAT_RESIST');

    if (zone === 'LOW') zoneCostMult = HEAT_CONFIG.LOW_COST_MULT;
    else if (zone === 'OPTIMAL') zoneCostMult = HEAT_CONFIG.OPTIMAL_COST_MULT;
    else {
        let overheatMult = HEAT_CONFIG.OVERHEAT_COST_MULT; 
        const penalty = HEAT_CONFIG.OVERHEAT_COST_MULT - 1;
        const reduction = Math.min(penalty, heatResistStrength); 
        overheatMult -= reduction;

        if (hasTalentHeatShield) overheatMult = Math.min(overheatMult, 1.5); 
        
        zoneCostMult = Math.max(1.0, overheatMult);
    }

    let baseActionCost = config.baseCost;
    
    // Cryo Support: Zero Temp Buff
    if (action === 'HEAVY' && session.temperature < 10) {
        const zeroBuffStrength = getEffectStrength(session.materials, 'SPECIAL_ZERO_TEMP_BUFF');
        if (zeroBuffStrength > 0) {
            baseActionCost = Math.floor(baseActionCost * (1 - zeroBuffStrength));
        }
    }
    
    if (action === 'LIGHT') {
        const mithrilStrength = getEffectStrength(session.materials, 'SPECIAL_LIGHT_NO_HEAT');
        if (mithrilStrength > 0 && mithrilStrength < 2.0) {
            baseActionCost += 1; 
        }
    }

    let activeCost = baseActionCost;
    if (session.activeDebuff === 'HARDENED') activeCost *= 2;
    
    if (session.unlockedTalents.includes('t_dur_5')) {
        activeCost *= 0.85; 
    }
    
    activeCost = Math.floor(activeCost * (1 - session.costModifier));
    activeCost = Math.max(1, activeCost);

    return Math.floor(activeCost * zoneCostMult);
};

// --- Forge Mini-Game Logic ---

export const createForgeSession = (materials: Material[], playerLevel: number, unlockedTalents: string[] = []): ForgeSession => {
  let baseDurability = 58 + (playerLevel * 2); 
  let maxFocus = 3; 

  if (unlockedTalents.includes('t_dur_1')) baseDurability += 15;
  if (unlockedTalents.includes('t_dur_4')) baseDurability += 40;
  
  if (unlockedTalents.includes('t_qual_3')) maxFocus += 1; 

  let costReductionPct = 0;
  let scoreMult = 1.0;
  let baseScore = 0;

  materials.forEach(m => {
    if (m.effectType === 'DURABILITY') baseDurability += m.effectValue;
    if (m.effectType === 'COST_REDUCTION') costReductionPct += m.effectValue;
    if (m.effectType === 'SCORE_MULT') scoreMult += m.effectValue;
    if (m.effectType === 'SPECIAL_FOCUS_BUFF') maxFocus += Math.floor(m.effectValue);

    if (m.quality === Quality.Common) baseScore += 50;
    else if (m.quality === Quality.Refined) baseScore += 100;
    else if (m.quality === Quality.Rare) baseScore += 200;
  });

  const totalQualityPoints = materials.reduce((sum, m) => sum + m.quality, 0);
  const effectiveBonusPoints = Math.max(0, totalQualityPoints - 3);
  const materialTierBonus = 1.0 + (effectiveBonusPoints * 0.1);

  costReductionPct = Math.min(0.80, costReductionPct);

  if (unlockedTalents.includes('t_qual_5')) scoreMult += 0.30;

  const sessionTalents = {
      lightCostReduction: 0, 
      heavyCostReductionPct: 0, 
      heavyProgressBonusPct: 0, 
      polishScoreBonusPct: 0, 
      heavyFreeChance: 0, 
      allCostReductionPct: unlockedTalents.includes('t_dur_5') ? 0.15 : 0,
  };

  return {
    playerLevel,
    maxDurability: baseDurability,
    currentDurability: baseDurability,
    progress: 0,
    qualityScore: baseScore, 
    costModifier: costReductionPct,
    scoreMultiplier: scoreMult,
    materialTierBonus: materialTierBonus,
    turnCount: 0,
    logs: [`锻造开始！材质加成: x${materialTierBonus.toFixed(1)}，基础分: ${baseScore}`],
    status: 'ACTIVE',
    materials,
    activeDebuff: null,
    durabilitySpent: 0,
    temperature: 0, 
    focus: 0,
    maxFocus,    
    polishCount: 0,
    comboActive: false,
    deathSaveUsed: false,
    unlockedTalents, 
    talents: sessionTalents
  };
};

export const executeForgeAction = (session: ForgeSession, action: 'LIGHT' | 'HEAVY' | 'QUENCH' | 'POLISH'): ForgeSession => {
  const newSession = { ...session, turnCount: session.turnCount + 1 };
  
  const levelCoefficient = 1 + (session.playerLevel * 0.2);

  const miracleStrength = getEffectStrength(session.materials, 'SPECIAL_MIRACLE');
  let isMiracle = false;
  if (miracleStrength > 0 && Math.random() < miracleStrength) {
      isMiracle = true;
  }
  
  let actualCost = getForgeActionCost(session, action);
  if (isMiracle) actualCost = 0;

  if (action === 'POLISH') {
     let freeChance = 0;
     let diamondBonusScore = 0;
     
     session.materials.forEach(m => {
         if (m.effectType === 'SPECIAL_POLISH_BUFF') {
             if (m.quality === Quality.Common) diamondBonusScore += 50;
             else if (m.quality === Quality.Refined) freeChance += 0.2;
             else if (m.quality === Quality.Rare) {
                 freeChance += 0.3;
                 diamondBonusScore += 100;
             }
         }
     });

     freeChance = Math.min(0.80, freeChance);

     if (actualCost > 0 && Math.random() < freeChance) {
         actualCost = 0;
         newSession.logs = [`[金刚尘] 完美的切面！本次打磨不消耗耐久。`, ...session.logs];
     }

     if (actualCost >= newSession.currentDurability) {
         newSession.currentDurability -= actualCost; 
     } else {
         newSession.currentDurability -= actualCost;
     }
     
     let scoreBase = FORGE_ACTIONS.POLISH.baseScore || 100;
     const scoreGrowth = FORGE_ACTIONS.POLISH.scoreGrowth || 50;
     let roundScore = scoreBase + (newSession.polishCount * scoreGrowth);
     
     roundScore += diamondBonusScore;

     let totalScore = Math.floor(roundScore * session.scoreMultiplier * session.materialTierBonus * levelCoefficient);
     if (isMiracle) totalScore *= 2;

     newSession.qualityScore += totalScore;
     newSession.polishCount++;

     let logStr = `打磨完成 (消耗${actualCost})：品质 +${totalScore}`;
     if (isMiracle) logStr += ' [奇迹!]';
     
     newSession.logs = [logStr, ...session.logs];
  }
  else if (action === 'QUENCH') {
    let heatRed = FORGE_ACTIONS.QUENCH.heatReduce;
    let restoreAmount = FORGE_ACTIONS.QUENCH.durabilityRestore || 20;
    
    // Sulfur Logic: Quench Raises Heat
    const sulfurStrength = getEffectStrength(session.materials, 'SPECIAL_QUENCH_HEAT_RISE');
    let heatChangeMsg = `温度 -${heatRed}`;
    
    if (sulfurStrength > 0) {
        heatRed = -sulfurStrength; // Negative reduction = Increase
        heatChangeMsg = `[硫磺] 温度 +${sulfurStrength}`;
        // If rare (20+), add bonus durability
        if (sulfurStrength >= 20) restoreAmount += 10;
    }

    const frostStrength = getEffectStrength(session.materials, 'SPECIAL_QUENCH_FOCUS');
    if (frostStrength > 0) {
        let focusGain = 0;
        if (frostStrength >= 2.0) focusGain = 2; 
        else if (frostStrength >= 1.0) focusGain = 1; 
        else if (Math.random() < 0.5) focusGain = 1; 
        
        if (focusGain > 0) {
            newSession.focus = Math.min(newSession.maxFocus, newSession.focus + focusGain);
        }
    }

    if (session.unlockedTalents.includes('t_dur_3')) {
        restoreAmount += 10;
        if (Math.random() < 0.2) {
             newSession.turnCount--; 
             newSession.logs = [`[深度淬火] 不消耗行动次数！`, ...session.logs];
        }
    }

    newSession.temperature = Math.max(0, Math.min(HEAT_CONFIG.MAX_TEMP, session.temperature - heatRed));
    newSession.currentDurability = Math.min(newSession.maxDurability, session.currentDurability + restoreAmount);

    if (isMiracle && miracleStrength >= 0.15) {
        newSession.currentDurability = Math.min(newSession.maxDurability, newSession.currentDurability + 5);
    }

    let logStr = `淬火：${heatChangeMsg}，耐久 +${restoreAmount}`;
    newSession.logs = [logStr, ...newSession.logs]; 
  }
  else {
      const config = action === 'LIGHT' ? FORGE_ACTIONS.LIGHT : FORGE_ACTIONS.HEAVY;
      
      newSession.currentDurability -= actualCost;
      newSession.durabilitySpent += actualCost;

      const zone = getHeatZone(session.temperature);
      let zoneName = zone === 'LOW' ? '低温' : zone === 'OPTIMAL' ? '最佳' : '过热';
      let zoneScoreMult = zone === 'LOW' ? HEAT_CONFIG.LOW_SCORE_MULT : zone === 'OPTIMAL' ? HEAT_CONFIG.OPTIMAL_SCORE_MULT : HEAT_CONFIG.OVERHEAT_SCORE_MULT;
      
      if (zone === 'OPTIMAL' && session.unlockedTalents.includes('t_qual_4')) {
          zoneScoreMult = 1.8;
      }

      let heatAdd = config.heatAdd;
      
      if (action === 'LIGHT') {
          const mithrilStrength = getEffectStrength(session.materials, 'SPECIAL_LIGHT_NO_HEAT');
          if (mithrilStrength >= 1.0) heatAdd = 0; 
          else if (mithrilStrength > 0) heatAdd = Math.floor(heatAdd / 2); 
      }
      if (action === 'HEAVY') {
          const zeroBuffStrength = getEffectStrength(session.materials, 'SPECIAL_ZERO_TEMP_BUFF');
          if (zeroBuffStrength > 0 && session.temperature < 10) {
              heatAdd = 0; // Zero Temp Buff: No heat on heavy
          }
      }

      newSession.temperature = Math.min(HEAT_CONFIG.MAX_TEMP, session.temperature + heatAdd);

      const [minP, maxP] = config.progressRange;
      let progressGain = Math.floor(Math.random() * (maxP - minP + 1)) + minP;
      
      const [minS, maxS] = config.scoreRange;
      let baseScore = Math.floor(Math.random() * (maxS - minS + 1)) + minS;

      let logStatus = ` [${zoneName}]`;

      if (action === 'LIGHT') {
          const featherStrength = getEffectStrength(session.materials, 'SPECIAL_LIGHT_MULTIHIT');
          let isMultihit = false;
          if (featherStrength > 0) {
              if (featherStrength >= 0.6 && session.comboActive) {
                  isMultihit = true; 
              } else if (Math.random() < featherStrength) {
                  isMultihit = true;
              }
          }

          if (isMultihit) {
              baseScore *= 2;
              logStatus += ' [双重打击!]';
          }

          if (session.comboActive) {
              const echoStrength = getEffectStrength(session.materials, 'SPECIAL_COMBO_REGEN');
              if (echoStrength > 0) {
                  const heal = Math.floor(echoStrength); 
                  newSession.currentDurability = Math.min(newSession.maxDurability, newSession.currentDurability + heal);
                  
                  let addFocus = false;
                  if (echoStrength > 8) addFocus = true; 
                  else if (echoStrength > 5 && Math.random() < 0.5) addFocus = true; 
                  
                  if (addFocus) {
                       newSession.focus = Math.min(newSession.maxFocus, newSession.focus + 1);
                       logStatus += ' [回响:回气]';
                  }
                  logStatus += ` [回响:耐久+${heal}]`; // Corrected term
              }
              
              let focusGain = 2;
              if (isMultihit) focusGain += 1;
              
              newSession.focus = Math.min(newSession.maxFocus, newSession.focus + focusGain); 
              logStatus += ` [连击触发:专注+${focusGain}]`;
              newSession.comboActive = false; 
              
              if (session.unlockedTalents.includes('t_qual_2')) {
                  baseScore *= 2;
                  logStatus += ' [余震暴击]';
              }
          } else {
              let focusGain = 1;
              if (isMultihit) focusGain += 1;
              newSession.focus = Math.min(newSession.maxFocus, newSession.focus + focusGain); 
              if(isMultihit) logStatus += ' [专注+2]';
          }
          
          if (session.unlockedTalents.includes('t_qual_1')) baseScore += 2;
      } 
      else {
          const focus = session.focus;
          newSession.comboActive = true; 

          let focusMult = 1.0;
          let progressMult = 1.0;

          if (focus > 0) {
              focusMult = 1 + (focus * 0.5); 
              progressMult = 1 + (focus * 0.2); 
              logStatus += ` [专注x${focus}]`;
              newSession.focus = 0; 
              
              const mindStrength = getEffectStrength(session.materials, 'SPECIAL_FOCUS_BUFF');
              if (mindStrength > 2.0 && focus >= session.maxFocus) {
                   baseScore *= 2; 
                   logStatus += ' [全知暴击]';
              } else if (mindStrength > 1.0 && focus >= session.maxFocus) {
                   baseScore = Math.floor(baseScore * 1.2); 
              }

          } else {
              logStatus += ` [无专注]`;
          }
          
          baseScore = Math.floor(baseScore * focusMult);
          progressGain = Math.floor(progressGain * progressMult);
      }

      const magmaStrength = getEffectStrength(session.materials, 'SPECIAL_HEAT_TO_SCORE');
      if (magmaStrength > 0) {
          let magmaBonus = Math.floor(newSession.temperature * magmaStrength);
          if (magmaStrength >= 2.0 && newSession.temperature >= 100) {
              magmaBonus += 50;
          }
          baseScore += magmaBonus;
          logStatus += ` [熔岩+${magmaBonus}]`;
      }

      let totalScore = Math.floor(baseScore * zoneScoreMult * session.scoreMultiplier * session.materialTierBonus * levelCoefficient);
      
      if (session.unlockedTalents.includes('t_qual_3')) {
          const chance = (action === 'HEAVY' ? session.focus : newSession.focus) * 0.02;
          if (Math.random() < chance) {
              totalScore = Math.floor(totalScore * 1.5);
              logStatus += ' [心流暴击]';
          }
      }

      if (isMiracle) {
          totalScore *= 2;
          logStatus += ' [奇迹暴击!]';
          if (miracleStrength >= 0.15) {
              newSession.currentDurability = Math.min(newSession.maxDurability, newSession.currentDurability + 5);
          }
      }

      newSession.progress = Math.min(100, session.progress + progressGain);
      newSession.qualityScore += totalScore;

      if (newSession.progress >= 100 && session.progress < 100) {
          newSession.logs = [`进入打磨阶段！准备最后一搏...`, ...newSession.logs];
      } else {
          newSession.logs = [`${config.name}: 进度+${progressGain}%, 分+${totalScore} (耗${actualCost})${logStatus}`, ...session.logs];
      }
  }

  const bloodStrength = getEffectStrength(session.materials, 'SPECIAL_BLOOD_PACT');
  if (bloodStrength > 0) {
      const missingDur = Math.max(0, newSession.maxDurability - newSession.currentDurability);
      const stacks = Math.floor(missingDur / 10);
      let pactBonus = stacks * bloodStrength * 0.01; 
      
      if (bloodStrength >= 0.5 && (newSession.currentDurability / newSession.maxDurability) < 0.1) {
          pactBonus *= 2;
      }
      
      let baseMult = 1.0;
      session.materials.forEach(m => { if (m.effectType === 'SCORE_MULT') baseMult += m.effectValue; });
      if (session.unlockedTalents.includes('t_qual_5')) baseMult += 0.30;
      
      newSession.scoreMultiplier = baseMult + pactBonus;
  }

  if (newSession.currentDurability <= 0) {
      const amberStrength = getEffectStrength(session.materials, 'SPECIAL_DEATH_SAVE');
      if (amberStrength > 0 && !session.deathSaveUsed) {
          newSession.deathSaveUsed = true;
          let healAmount = 0;
          let resetTemp = false;
          
          if (amberStrength >= 100) { 
              healAmount = Math.floor(newSession.maxDurability * 0.5);
              resetTemp = true;
              newSession.logs = [`[时光琥珀] 时间回溯！耐久恢复50%，温度重置！`, ...newSession.logs];
          } else if (amberStrength >= 30) { 
              healAmount = 30;
              newSession.logs = [`[完整琥珀] 琥珀碎裂，抵挡了致命损伤！(+30耐久)`, ...newSession.logs];
          } else { 
              healAmount = 10;
              newSession.logs = [`[树脂化石] 勉强维持了形态... (+10耐久)`, ...newSession.logs];
          }
          
          newSession.currentDurability = healAmount;
          if (resetTemp) newSession.temperature = 0;
          
      } else {
          const obsidianStrength = getEffectStrength(session.materials, 'SPECIAL_HEAT_RESIST');
          if (obsidianStrength >= 1.0 && action !== 'POLISH') {
              newSession.currentDurability = 1; 
              newSession.logs = [`[永恒黑甲] 铠甲承受了冲击，强制保留 1 点耐久！`, ...newSession.logs];
          } else {
              newSession.currentDurability = 0;
              newSession.status = 'FAILURE';
              const heatZone = getHeatZone(newSession.temperature);
              let failMsg = `耐久耗尽！在${heatZone==='OVERHEAT'?'过热':heatZone==='LOW'?'低温':'最佳'}区操作导致崩坏...`;
              if (action === 'POLISH') failMsg = `打磨过度，前功尽弃...`;
              newSession.logs = [failMsg, ...newSession.logs];
          }
      }
  }

  return newSession;
};

export const completeForgeSession = (session: ForgeSession): ForgeSession => {
    return {
        ...session,
        status: 'SUCCESS',
        logs: [`锻造完成！最终品质分：${session.qualityScore}`, ...session.logs]
    };
};

// Helper: Get Range for Percent Stats (Crit/Lifesteal) based on Score Tier & Quality
const getPercentStatRange = (score: number, quality: Quality): [number, number] => {
    let tier = 1;
    if (score > 4000) tier = 3;
    else if (score > 2000) tier = 2;

    if (tier === 1) { // 0 - 2000
        if (quality === Quality.Common) return [1, 2];
        if (quality === Quality.Refined) return [1, 3];
        return [2, 3];
    } else if (tier === 2) { // 2001 - 4000
        if (quality === Quality.Common) return [1, 2];
        if (quality === Quality.Refined) return [2, 3];
        return [3, 4];
    } else { // 4001+
        if (quality === Quality.Common) return [1, 3];
        if (quality === Quality.Refined) return [2, 4];
        return [3, 5];
    }
};

// Helper: Sort Stats for Display
const sortStats = (stats: Stat[], type: EquipmentType) => {
    // Priority Map: Lower is better
    const order: Record<string, number> = type === 'WEAPON' 
        ? { 'ATK': 1, 'CRIT': 2, 'LIFESTEAL': 3 }
        : { 'HP': 1, 'DEF': 2, 'LIFESTEAL': 3 };
    
    return stats.sort((a, b) => {
        const oa = order[a.type] || 99;
        const ob = order[b.type] || 99;
        return oa - ob;
    });
}

// --- NEW STAT FORMULAS ---
// Revised Linear Model for High Score Baseline (e.g., Lvl 1 ~800-1000 score)
const calculateStatValue = (type: 'ATK' | 'HP' | 'DEF', score: number): number => {
    // Score Anchors:
    // 800 -> 25 ATK (Lvl 1 Normal)
    // 1500 -> 42 ATK (Lvl 1 Limit)
    // 3000 -> 80 ATK (Lvl 5)
    // 10000 -> 255 ATK (Endgame)
    
    // Formula: (Score / Divisor) + Base
    
    if (type === 'ATK') {
        return Math.floor(score / 40) + 5;
    } else if (type === 'HP') {
        return Math.floor(score / 8) + 20; 
    } else { // DEF
        return Math.floor(score / 200); // Rare stat
    }
};

// --- FINALIZE FORGE (REFACTORED) ---
export const finalizeForge = (session: ForgeSession, type: EquipmentType, playerLevel: number): Equipment => {
    const totalMatPoints = session.materials.reduce((sum, m) => sum + m.quality, 0);
    
    let quality = Quality.Common;
    let statSlots = 2;

    if (totalMatPoints >= 8) { // 8-9
        quality = Quality.Rare;
        statSlots = 4;
    } else if (totalMatPoints >= 5) { // 5-7
        quality = Quality.Refined;
        statSlots = 3;
    } else { // 1-4
        quality = Quality.Common;
        statSlots = 2;
    }

    const selectedStats: Stat[] = [];
    
    // Tracker to prevent >2 same type
    const statCounts: Record<string, number> = { ATK: 0, HP: 0, DEF: 0, CRIT: 0, LIFESTEAL: 0 };

    const addStat = (key: string, isMandatory: boolean = false) => {
        if (!isMandatory && (statCounts[key] || 0) >= 2) return false;

        const config = STAT_CONFIG[key as keyof typeof STAT_CONFIG];
        let finalValue = 0;
         
        if (key === 'CRIT' || key === 'LIFESTEAL') {
             // Tiered % Logic
             const [minP, maxP] = getPercentStatRange(session.qualityScore, quality);
             finalValue = Math.floor(Math.random() * (maxP - minP + 1)) + minP;
        } else {
             // NEW: Score Logic
             const baseVal = calculateStatValue(key as 'ATK' | 'HP' | 'DEF', session.qualityScore);
             // Add a tiny jitter (+- 5%) so duplicates aren't identical
             const jitter = 0.95 + Math.random() * 0.1;
             finalValue = Math.max(1, Math.floor(baseVal * jitter));
        }

        selectedStats.push({
            type: key,
            label: config.label,
            value: finalValue,
            suffix: config.suffix
        });
        statCounts[key] = (statCounts[key] || 0) + 1;
        return true;
    };

    // 1. Mandatory Stats
    if (type === 'WEAPON') {
        addStat('ATK', true);
    } else {
        addStat('HP', true);
        if (statSlots >= 2) addStat('DEF', true);
    }

    // 2. Fill remaining slots
    const WEAPON_POOL = ['ATK', 'CRIT', 'LIFESTEAL'];
    const ARMOR_POOL = ['HP', 'DEF', 'LIFESTEAL'];
    const pool = type === 'WEAPON' ? WEAPON_POOL : ARMOR_POOL;

    while (selectedStats.length < statSlots) {
        const randomKey = pool[Math.floor(Math.random() * pool.length)];
        if (pool.every(k => (statCounts[k] || 0) >= 2)) break;
        addStat(randomKey);
    }

    const sortedStats = sortStats(selectedStats, type);

    const matName = session.materials[0].name.replace(/粗糙|坚硬|深渊|轻|流风|天界|微光|耀斑|日核|碎片|晶体|核心|石|块|尘|珠/g, '').trim() || session.materials[0].name.substring(0,2);
    const prefix = quality === Quality.Rare ? '传说' : quality === Quality.Refined ? '精工' : '粗制';
    const name = `${prefix}·${matName}${type === 'WEAPON' ? '之刃' : '护甲'}`;

    return {
        id: Date.now().toString(),
        name,
        type,
        quality,
        stats: sortedStats,
        value: Math.floor(session.qualityScore * (quality === Quality.Rare ? 2 : 1)),
        materialsUsed: session.materials.map(m => m.quality),
        score: session.qualityScore,
        maxDurability: 100,
        currentDurability: 100
    };
};

export const generateEquipment = (type: EquipmentType, qualities: Quality[], level: number): Equipment => {
    // Reverse Engineering based on new formula: ATK = Score/40 + 5
    // Target ATK for Level 1 ~25 -> Target Score ~800
    // Target ATK for Level 5 ~80 -> Target Score ~3000
    // Growth factor ~1.3 - 1.4x per level in Score
    
    const avgQuality = Math.round(qualities.reduce((a,b)=>a+b,0) / qualities.length);
    
    // Base score for Level 1 is 800
    let baseScore = 800 * Math.pow(1.35, level - 1);
    
    // Quality Bonus
    if (avgQuality === Quality.Refined) baseScore *= 1.4;
    if (avgQuality === Quality.Rare) baseScore *= 2.0;
    
    // Variance
    const score = Math.floor(baseScore * (0.85 + Math.random() * 0.3));
    
    const mockMat: Material = { 
        id: 'mock', quality: avgQuality, name: '未知材料', price: 0, 
        effectType: 'DURABILITY', effectValue: 0, description: '' 
    };
    const mockSession: ForgeSession = {
        ...createForgeSession([mockMat, mockMat, mockMat], level, []),
        qualityScore: score,
        materials: qualities.map(q => ({...mockMat, quality: q}))
    };
    
    return finalizeForge(mockSession, type, level);
};

export const generateBlacksmithReward = (avgScore: number, type: EquipmentType, level: number): Equipment => {
    const roll = Math.random();
    let q = Quality.Common;
    if (roll < 0.10) q = Quality.Rare;      
    else if (roll < 0.65) q = Quality.Refined; 
    
    const mockMat: Material = { 
        id: 'mock', quality: q, name: '铁匠', price: 0, 
        effectType: 'DURABILITY', effectValue: 0, description: '' 
    };
    
    const score = Math.floor(avgScore * (0.9 + Math.random() * 0.3));
    
    const mockSession: ForgeSession = {
        ...createForgeSession([mockMat, mockMat, mockMat], level, []),
        qualityScore: score,
        materials: [mockMat, mockMat, mockMat].map(m => ({...m, quality: q}))
    };
    
    return finalizeForge(mockSession, type, level);
};
