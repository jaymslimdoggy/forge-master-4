
import React, { useRef, useEffect, useState } from 'react';
import { Player, ForgeSession, Material, Quality, EquipmentType } from '../../types';
import { FORGE_ACTIONS, HEAT_CONFIG } from '../../constants';
import { getForgeActionCost, getEffectStrength } from '../../services/gameLogic';
import { FloatingText, FloatingTextLayer } from '../Shared/FloatingTextLayer';

interface ForgeViewProps {
  player: Player;
  forgeSession: ForgeSession | null;
  forgeSlots: (Material | null)[];
  forgeType: EquipmentType;
  forgePreview: { durability: number, costRed: number, scoreMult: number };
  groupedMaterials: { mat: Material, count: number, instances: Material[] }[];
  floatingTexts: FloatingText[];
  onSetForgeType: (t: EquipmentType) => void;
  onAddSlot: (mat: Material, idx: number) => void;
  onRemoveSlot: (idx: number) => void;
  onStartForge: () => void;
  onForgeAction: (action: 'LIGHT' | 'HEAVY' | 'QUENCH' | 'POLISH') => void;
  onFinishForge: () => void;
  onMarkTutorialSeen: () => void;
}

export const ForgeView: React.FC<ForgeViewProps> = ({
  player,
  forgeSession,
  forgeSlots,
  forgeType,
  forgePreview,
  groupedMaterials,
  floatingTexts,
  onSetForgeType,
  onAddSlot,
  onRemoveSlot,
  onStartForge,
  onForgeAction,
  onFinishForge,
  onMarkTutorialSeen
}) => {
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isTempering = forgeSession && forgeSession.progress >= 100;
  
  const [scoreDelta, setScoreDelta] = useState<{ val: number, id: number } | null>(null);
  const [prevScore, setPrevScore] = useState(0);
  const [hitEffect, setHitEffect] = useState(false);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = 0;
    }
  }, [forgeSession?.logs]);

  useEffect(() => {
      if (forgeSession) {
          if (forgeSession.qualityScore !== prevScore) {
              const diff = forgeSession.qualityScore - prevScore;
              if (diff !== 0) {
                  setScoreDelta({ val: diff, id: Date.now() });
                  setHitEffect(true);
                  setTimeout(() => setHitEffect(false), 150); 
              }
              setPrevScore(forgeSession.qualityScore);
          }
      } else {
          setPrevScore(0);
          setScoreDelta(null);
      }
  }, [forgeSession?.qualityScore]);

  const getSlotStatus = (index: number) => {
    const unlockLevel = [1, 2, 4][index];
    const isLocked = player.level < unlockLevel;
    return { isLocked, unlockLevel };
  };

  // --- Calculate Predicted Quality & Bonus ---
  const activeMats = forgeSlots.filter((m): m is Material => m !== null);
  const totalQualityPoints = activeMats.reduce((sum, m) => sum + m.quality, 0);
  
  let predictedQualityStr = '???';
  let predictedQualityColor = 'text-zinc-500';
  
  if (activeMats.length > 0) {
      if (totalQualityPoints >= 8) {
          predictedQualityStr = '传说 (金)';
          predictedQualityColor = 'text-yellow-400';
      } else if (totalQualityPoints >= 5) {
          predictedQualityStr = '精工 (绿)';
          predictedQualityColor = 'text-green-400';
      } else {
          predictedQualityStr = '粗制 (白)';
          predictedQualityColor = 'text-zinc-300';
      }
  }

  const matTierBonus = 1.0 + Math.max(0, (totalQualityPoints - 3) * 0.1);

  if (forgeSession) {
      const tempPercent = forgeSession.temperature;
      let zoneName = '低温';
      let zoneColor = 'text-blue-400';
      const isOverheat = tempPercent >= HEAT_CONFIG.OVERHEAT_START;

      if (isOverheat) {
          zoneName = '过热 (高耗高收益)';
          zoneColor = 'text-red-500 animate-pulse';
      } else if (tempPercent >= HEAT_CONFIG.OPTIMAL_START) {
          zoneName = '最佳 (高收益)';
          zoneColor = 'text-green-400';
      }

      const durabilityRatio = forgeSession.currentDurability / forgeSession.maxDurability;

      const polishCost = getForgeActionCost(forgeSession, 'POLISH');
      const polishRisk = polishCost >= forgeSession.currentDurability;
      const riskColor = polishRisk ? 'text-red-500' : 'text-green-500';

      const baseScore = FORGE_ACTIONS.POLISH.baseScore || 100;
      const scoreGrowth = FORGE_ACTIONS.POLISH.scoreGrowth || 50;
      const expectedScore = baseScore + (forgeSession.polishCount * scoreGrowth);

      const lightCost = getForgeActionCost(forgeSession, 'LIGHT');
      const heavyCost = getForgeActionCost(forgeSession, 'HEAVY');

      return (
      <div className={`flex-1 bg-zinc-900 rounded-2xl border p-2 flex flex-col relative overflow-hidden transition-colors duration-700 ${forgeSession.status === 'FAILURE' ? 'border-red-600' : isTempering ? 'border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.3)]' : 'border-zinc-700'}`}>
        
        <FloatingTextLayer texts={floatingTexts} />
        
        {forgeSession.status === 'FAILURE' && (
          <div className="absolute inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center animate-fadeIn">
             <i className="fas fa-heart-broken text-9xl text-red-600 mb-6 animate-bounce"></i>
             <div className="text-5xl font-black text-red-500 uppercase tracking-widest">装备碎裂</div>
             <div className="text-zinc-200 mt-4 text-2xl">耐力耗尽</div>
          </div>
        )}
        <div className={`absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] opacity-50 transition-all duration-1000 ${isTempering ? 'from-purple-900/40 via-zinc-900/80 to-zinc-950' : 'from-orange-900/20 via-zinc-900/50 to-zinc-950'}`}></div>
        
        {/* Score Header */}
        <div className={`shrink-0 p-4 bg-zinc-800/80 rounded-xl border border-zinc-700/50 backdrop-blur-sm z-10 flex justify-between items-center mb-4 transition-transform duration-100 relative ${hitEffect ? 'scale-[1.02] border-yellow-500/50' : ''}`}>
          
          <div className="absolute top-2 left-4 flex flex-col items-start opacity-70">
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">材质加成</div>
              <div className="text-yellow-500 font-mono font-black text-2xl leading-none drop-shadow-md">x{forgeSession.materialTierBonus.toFixed(1)}</div>
          </div>

          <div className="flex flex-col w-full text-center relative">
             <span className="text-lg text-zinc-200 uppercase font-black tracking-widest mb-1">{isTempering ? '打磨阶段' : '品质评分'}</span>
             <div className="flex items-center justify-center gap-2">
                 <span className={`text-7xl font-black tabular-nums tracking-tighter drop-shadow-[0_0_15px_rgba(234,179,8,0.4)] transition-all ${isTempering ? 'text-purple-400' : 'text-yellow-400'} ${hitEffect ? 'scale-110 text-yellow-300' : ''}`}>
                     {forgeSession.qualityScore}
                 </span>
                 {scoreDelta && (
                     <span key={scoreDelta.id} className="text-4xl font-black text-amber-300 animate-floatUp absolute left-[65%] top-2">
                         +{scoreDelta.val}
                     </span>
                 )}
             </div>
          </div>
        </div>

        {/* Status Dashboard */}
        <div className="flex-1 flex flex-col justify-start px-4 gap-4 z-10 relative">
           
           {isTempering ? (
               <div className={`animate-fadeIn ${polishRisk ? 'animate-shake' : ''}`}>
                  <div className="flex justify-between text-lg font-bold mb-1 uppercase tracking-wider text-red-400">
                    <span className="flex items-center gap-2"><i className="fas fa-heart mr-2"></i>当前耐久</span>
                    <span>{forgeSession.currentDurability} / {forgeSession.maxDurability}</span>
                  </div>
                  
                  <div className={`h-6 bg-zinc-950 rounded-full overflow-hidden border shadow-inner mb-2 ${polishRisk ? 'border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'border-zinc-700'}`}>
                     <div className={`h-full transition-all duration-300 ${polishRisk ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-red-800 to-red-600'}`} style={{ width: `${Math.max(0, durabilityRatio * 100)}%` }}></div>
                  </div>

                  <div className="flex justify-between text-xs font-bold mb-1 uppercase tracking-wider text-zinc-400 bg-black/30 p-2 rounded">
                    <span>下轮消耗 (指数增长)</span>
                    <span className={riskColor}>{polishCost}</span>
                  </div>
                  
                  {polishRisk && (
                      <div className="text-center bg-red-900/80 text-white font-black text-sm py-2 rounded animate-pulse border border-red-500 mt-1">
                          <i className="fas fa-exclamation-triangle mr-2"></i> 警告：存在碎裂风险！
                      </div>
                  )}
               </div>
           ) : (
               <div>
                  <div className="flex justify-between text-lg font-bold mb-1 uppercase tracking-wider text-red-400">
                    <span><i className="fas fa-heart mr-2"></i>耐力</span>
                    <span>{forgeSession.currentDurability} / {forgeSession.maxDurability}</span>
                  </div>
                  <div className="h-6 bg-zinc-950 rounded-full overflow-hidden border border-zinc-700 shadow-inner">
                     <div className={`h-full transition-all duration-300 ${forgeSession.currentDurability < 10 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-red-800 to-red-600'}`} style={{ width: `${Math.max(0, durabilityRatio * 100)}%` }}></div>
                  </div>
               </div>
           )}

           {!isTempering && (
               <div>
                   <div className="flex justify-between text-lg font-bold mb-1 uppercase tracking-wider">
                       <span className={zoneColor}><i className="fas fa-thermometer-half mr-2"></i>{zoneName}</span>
                       <span className={zoneColor}>{forgeSession.temperature}°C</span>
                   </div>
                   <div className="h-6 bg-zinc-950 rounded-full overflow-hidden border border-zinc-700 shadow-inner relative flex">
                       <div className="absolute top-0 bottom-0 left-[30%] w-0.5 bg-white/20 z-10"></div> 
                       <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-red-500/50 z-10"></div> 
                       
                       <div className="h-full bg-gradient-to-r from-blue-500 via-yellow-400 to-red-600 transition-all duration-500" style={{width: `${forgeSession.temperature}%`}}></div>
                   </div>
                   <div className="flex justify-between text-xs font-bold text-zinc-500 mt-1 px-1">
                       <span>低温(x0.8)</span>
                       <span>最佳(x1.5)</span>
                       <span>过热(x2.5 / 耗耐x2)</span>
                   </div>
               </div>
           )}

           <div className="flex gap-4 items-center mt-2">
               <div className="flex-1">
                  <div className="flex justify-between text-sm font-bold mb-1 text-green-400 uppercase tracking-wider">
                      <span>锻造进度</span>
                      <span>{Math.min(100, forgeSession.progress)}%</span>
                  </div>
                  <div className="h-4 bg-zinc-950 rounded-full overflow-hidden border border-zinc-700">
                      <div className="h-full bg-green-500 transition-all duration-300 relative" style={{ width: `${Math.min(100, forgeSession.progress)}%` }}>
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 shadow-[0_0_5px_white]"></div>
                      </div>
                  </div>
               </div>
               
               {!isTempering && (
                   <div className="flex flex-col items-center justify-center bg-zinc-800 p-2 rounded-xl border border-zinc-700 min-w-[5rem] shrink-0">
                       <div className="text-[10px] text-zinc-400 font-bold uppercase mb-1">专注 ({forgeSession.maxFocus})</div>
                       <div className="flex gap-1 h-6 items-end">
                           {Array.from({length: forgeSession.maxFocus}).map((_, i) => (
                               <div key={i} className={`w-3 rounded-sm transition-all duration-300 border border-black/20 ${i < forgeSession.focus ? 'h-full bg-yellow-400 shadow-[0_0_8px_gold]' : 'h-1.5 bg-zinc-700'}`}></div>
                           ))}
                       </div>
                   </div>
               )}
           </div>

           {/* ACTIVE MATERIALS PANEL (Centered) */}
           <div className="flex justify-center gap-2 mt-auto">
               {forgeSession.materials.map(mat => (
                   <div key={mat.id} className="bg-black/60 backdrop-blur border border-zinc-700 px-3 py-1.5 rounded-lg flex items-center gap-3 shadow-lg max-w-[150px] min-w-[120px]">
                       <div className={`text-xl quality-${mat.quality} shrink-0`}><i className={`fas ${mat.isDungeonOnly ? 'fa-gem' : 'fa-cube'}`}></i></div>
                       <div className="min-w-0">
                           <div className={`text-[10px] font-black quality-${mat.quality} truncate`}>{mat.name}</div>
                           <div className="text-[8px] text-zinc-400 leading-tight truncate">{mat.description}</div>
                       </div>
                   </div>
               ))}
           </div>

        </div>
        
        <div className="shrink-0 p-4 z-10 min-h-[170px] flex items-end">
           {!isTempering ? (
             <div className="grid grid-cols-3 gap-3 w-full">
                <button onClick={() => onForgeAction('LIGHT')} disabled={forgeSession.status !== 'ACTIVE'} className={`bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-2xl p-2 flex flex-col items-center justify-center active:scale-90 active:brightness-125 transition group h-36 relative shadow-lg active:border-green-400 duration-100 overflow-hidden ${forgeSession.comboActive ? 'border-green-400 shadow-[0_0_15px_rgba(74,222,128,0.4)] animate-pulse' : ''}`}>
                   <div className="flex items-center justify-center gap-2 mb-1 w-full relative z-10"><i className="fas fa-hammer text-blue-400 text-2xl group-hover:-rotate-12 transition-transform"></i><span className="font-black text-xl text-white whitespace-nowrap">轻击</span></div>
                   <div className="text-center w-full flex flex-col justify-center gap-0.5 relative z-10">
                       {forgeSession.comboActive ? (
                           <>
                             <div className="text-xs font-black text-green-300 bg-green-900/50 px-1 py-0.5 rounded">免耗 / 双倍专注!</div>
                             <div className="text-[10px] text-zinc-300 mt-1">消耗 0 耐久</div>
                           </>
                       ) : (
                           <>
                             <div className="text-sm font-bold text-green-400">专注 +1</div>
                             <div className="flex items-baseline justify-center gap-1 mt-1 text-zinc-400 text-[10px] font-bold">
                                <span>消耗</span>
                                <span className="text-red-500 text-2xl font-black">{lightCost}</span>
                                <span>耐久</span>
                             </div>
                           </>
                       )}
                   </div>
                   {forgeSession.comboActive && <div className="absolute inset-0 bg-green-500/10 z-0"></div>}
                </button>

                <button onClick={() => onForgeAction('HEAVY')} disabled={forgeSession.status !== 'ACTIVE'} className="bg-zinc-800 hover:bg-zinc-700 border border-orange-900/50 rounded-2xl p-2 flex flex-col items-center justify-center active:scale-90 active:brightness-125 transition group relative overflow-hidden h-36 shadow-lg active:border-orange-500 duration-100">
                   <div className={`absolute inset-0 bg-orange-900/10 transition-colors ${forgeSession.focus > 0 ? 'bg-orange-500/20 animate-pulse' : ''}`}></div>
                   <div className="flex items-center justify-center gap-2 mb-1 z-10 w-full"><i className="fas fa-gavel text-orange-500 text-2xl group-hover:scale-110 transition-transform"></i><span className="font-black text-xl text-orange-100 whitespace-nowrap">重锤</span></div>
                   <div className="text-center z-10 w-full flex flex-col justify-center gap-0.5">
                       <div className="text-xs font-bold text-orange-300">{forgeSession.focus > 0 ? '消耗所有专注' : '需专注提升威力'}</div>
                       <div className={`text-sm font-black ${forgeSession.focus > 0 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                           倍率: x{(1 + forgeSession.focus * 0.5).toFixed(1)}
                       </div>
                       <div className="flex items-baseline justify-center gap-1 mt-1 text-zinc-400 text-[10px] font-bold">
                          <span>消耗</span>
                          <span className={`text-red-500 font-black transition-all ${isOverheat ? 'text-4xl drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse' : 'text-2xl'}`}>{heavyCost}</span>
                          <span>耐久</span>
                       </div>
                   </div>
                </button>

                <button onClick={() => onForgeAction('QUENCH')} disabled={forgeSession.status !== 'ACTIVE'} className={`bg-zinc-800 border border-zinc-600 rounded-2xl p-2 flex flex-col items-center justify-center transition relative h-36 shadow-lg hover:bg-zinc-700 active:scale-90 active:brightness-125 active:border-cyan-400 duration-100`}>
                   <div className="flex items-center justify-center gap-2 mb-1 w-full"><i className="fas fa-snowflake text-cyan-400 text-2xl animate-pulse"></i><span className="font-black text-xl text-white whitespace-nowrap">淬火</span></div>
                   <div className="text-center w-full flex flex-col justify-center gap-0.5">
                       <div className="text-sm font-bold text-cyan-300">
                           {getEffectStrength(forgeSession.materials, 'SPECIAL_QUENCH_HEAT_RISE') > 0 ? `温度 +${getEffectStrength(forgeSession.materials, 'SPECIAL_QUENCH_HEAT_RISE')}` : '温度 -35'}
                       </div>
                       <div className="text-[10px] text-green-400 mt-1 font-bold">耐久 +20</div>
                   </div>
                </button>
             </div>
           ) : (
             <div className="grid grid-cols-2 gap-6 w-full items-end">
                <button onClick={onFinishForge} className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-green-800 to-green-600 hover:from-green-700 hover:to-green-500 rounded-2xl border-2 border-green-400 shadow-lg active:scale-95 transition h-40">
                   <div className="text-3xl font-black text-white uppercase tracking-widest mb-2 flex items-center gap-3"><i className="fas fa-check-circle"></i>完成</div>
                   <div className="text-base text-green-100 font-bold">见好就收</div>
                </button>
                
                <div className="relative">
                    <div className="text-center mb-2 animate-bounce">
                        <span className="text-3xl font-black text-yellow-300 drop-shadow-md">+{expectedScore}</span>
                        <div className="text-xs text-yellow-500 font-bold uppercase tracking-wider">预期收益</div>
                    </div>
                    <button onClick={() => onForgeAction('POLISH')} className={`w-full flex flex-col items-center justify-center p-6 rounded-2xl border-2 shadow-lg active:scale-95 transition relative overflow-hidden group h-40 bg-gradient-to-br from-yellow-700 via-purple-900 to-red-900 border-yellow-500 hover:border-yellow-300 ${polishRisk ? 'animate-pulse border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.5)]' : 'shadow-[0_0_20px_rgba(234,179,8,0.4)]'}`}>
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent,rgba(255,255,255,0.2),transparent)] translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    
                    <div className="text-3xl font-black text-white uppercase tracking-widest mb-2 flex items-center gap-3 relative z-10"><i className="fas fa-gem animate-bounce text-yellow-300"></i>打磨</div>
                    
                    {polishRisk ? (
                            <div className="absolute bottom-4 left-0 right-0 text-center">
                                <span className="text-[10px] text-white bg-red-600 px-2 py-0.5 rounded font-black animate-bounce shadow-sm uppercase tracking-wider">
                                    <i className="fas fa-skull mr-1"></i> 碎裂风险 (高耗)
                                </span>
                            </div>
                    ) : (
                            <div className="text-xs text-zinc-300 mt-1 relative z-10">搏一搏，单车变摩托</div>
                    )}
                    </button>
                </div>
             </div>
           )}
        </div>
        
        <div className="h-28 bg-black/40 p-4 overflow-y-auto text-base font-mono space-y-1.5 border-t border-zinc-800 z-10 shrink-0" ref={logsContainerRef}>
          {forgeSession.logs.map((log, i) => <div key={i} className={`opacity-90 ${i === 0 ? 'text-white font-bold' : 'text-zinc-400'}`}>{i === 0 ? '> ' : ''}{log}</div>)}
        </div>
      </div>
    );
  }

  // Pre-Forge UI
  return (
    <div className="flex-col flex h-full gap-4 relative">
        
       {!player.hasSeenForgeTutorial && (
            <div className="absolute inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-8 text-center animate-fadeIn rounded-2xl overflow-y-auto">
                <h2 className="text-4xl font-black text-yellow-500 mb-6 uppercase tracking-widest border-b-4 border-yellow-600 pb-2 shrink-0">锻造指南</h2>
                <div className="flex-1 w-full max-w-5xl flex flex-col gap-4 mb-6">
                    <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-700 text-left relative overflow-hidden">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2"><i className="fas fa-bullseye text-green-500 mr-2"></i>核心目标</h3>
                                <p className="text-zinc-400 text-sm leading-relaxed">
                                    利用有限的<span className="text-green-400 font-bold">耐久度</span>，通过操作控制<span className="text-orange-400 font-bold">温度</span>，尽可能堆高<span className="text-yellow-400 font-bold">品质评分</span>。
                                </p>
                            </div>
                             <div className="bg-red-900/30 p-3 rounded-xl border border-red-500/50 max-w-sm ml-4">
                                <h4 className="text-red-400 font-bold text-sm mb-1"><i className="fas fa-exclamation-triangle mr-1"></i> 碎裂风险</h4>
                                <p className="text-red-200 text-xs">
                                    若在锻造过程中<span className="text-white font-black">耐久度归零</span>，装备将直接<span className="font-black text-red-500 text-base">碎裂</span>，投入的材料全部损毁！
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-700 text-left">
                        <h3 className="text-xl font-bold text-white mb-2"><i className="fas fa-fire-alt text-orange-500 mr-2"></i> 温度控制</h3>
                        <div className="grid grid-cols-3 gap-4 text-sm text-center">
                            <div className="bg-blue-900/20 p-2 rounded border border-blue-900/50">
                                <div className="text-blue-400 font-bold mb-1">低温区 (0-30°C)</div>
                                <div className="text-zinc-500 text-xs">低收益，安全</div>
                            </div>
                            <div className="bg-green-900/20 p-2 rounded border border-green-900/50">
                                <div className="text-green-400 font-bold mb-1">最佳区 (30-80°C)</div>
                                <div className="text-zinc-500 text-xs">收益 x1.5</div>
                            </div>
                            <div className="bg-red-900/20 p-2 rounded border border-red-900/50">
                                <div className="text-red-500 font-bold mb-1">过热区 (80-100°C)</div>
                                <div className="text-zinc-500 text-xs">收益 x2.5 / <span className="text-red-400">消耗加倍</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-700 text-left">
                            <h4 className="text-lg font-bold text-blue-300 mb-1"><i className="fas fa-hammer mr-2"></i>轻击</h4>
                            <p className="text-zinc-500 text-xs">小幅升温，获得1层<span className="text-yellow-500 font-bold">专注</span>。主要用于控温和攒豆。</p>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-700 text-left">
                            <h4 className="text-lg font-bold text-orange-300 mb-1"><i className="fas fa-gavel mr-2"></i>重锤</h4>
                            <p className="text-zinc-500 text-xs">大幅升温，消耗所有<span className="text-yellow-500 font-bold">专注</span>造成巨额得分。专注层数越高，威力越大。</p>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-700 text-left">
                            <h4 className="text-lg font-bold text-cyan-300 mb-1"><i className="fas fa-snowflake mr-2"></i>淬火</h4>
                            <p className="text-zinc-500 text-xs">降低温度，并<span className="text-green-500 font-bold">恢复耐久</span>。防止过热或补充耐久的关键。</p>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-700 text-left">
                            <h4 className="text-lg font-bold text-purple-300 mb-1"><i className="fas fa-gem mr-2"></i>打磨</h4>
                            <p className="text-zinc-500 text-xs">进度满后出现。消耗耐久换取额外分数，风险随次数递增。见好就收！</p>
                        </div>
                    </div>
                </div>
                <button onClick={onMarkTutorialSeen} className="px-16 py-5 bg-yellow-600 hover:bg-yellow-500 text-white font-black text-2xl rounded-2xl shadow-xl transition active:scale-95 uppercase tracking-widest animate-bounce border-b-4 border-yellow-800 shrink-0">
                    我明白了
                </button>
            </div>
       )}

       <div className="bg-zinc-800 p-6 rounded-2xl border border-zinc-700 flex flex-col items-center relative overflow-hidden shrink-0 shadow-lg">
        
        <div className="absolute top-2 left-4 flex flex-col items-start opacity-70">
            <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">最高记录</div>
            <div className="text-yellow-500 font-mono font-black text-4xl leading-none drop-shadow-md">{player.maxScore}</div>
        </div>

        <h2 className="text-3xl mb-6 font-black flex items-center justify-center text-zinc-200 uppercase tracking-widest"><i className="fas fa-fire-alt mr-2 text-orange-500"></i> 锻造台</h2>
        <div className="flex gap-6 mb-8 bg-zinc-900/50 p-2 rounded-xl w-full max-w-lg">
          <button onClick={() => onSetForgeType('WEAPON')} className={`px-10 py-4 flex-1 rounded-xl text-xl font-black transition uppercase tracking-widest border-2 ${forgeType === 'WEAPON' ? 'bg-red-900/50 text-red-100 border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)]' : 'border-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50'}`}>
              <i className="fas fa-khanda mr-2"></i>武器
          </button>
          <button onClick={() => onSetForgeType('ARMOR')} className={`px-10 py-4 flex-1 rounded-xl text-xl font-black transition uppercase tracking-widest border-2 ${forgeType === 'ARMOR' ? 'bg-blue-900/50 text-blue-100 border-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'border-transparent text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50'}`}>
              <i className="fas fa-shield-alt mr-2"></i>防具
          </button>
        </div>
        <div className="flex justify-center items-center gap-6 mb-8 w-full px-4">
          {forgeSlots.map((slot, i) => {
            const { isLocked, unlockLevel } = getSlotStatus(i);
            return (
              <div key={i} onClick={() => !isLocked && onRemoveSlot(i)} className={`w-32 h-40 rounded-2xl border-2 flex flex-col items-center justify-center transition relative group ${isLocked ? 'border-zinc-800 bg-zinc-900 cursor-not-allowed opacity-60' : slot ? 'border-zinc-500 bg-zinc-800 cursor-pointer border-dashed' : 'border-zinc-700 border-dashed hover:border-zinc-500 cursor-pointer'}`}>
                {isLocked ? <><i className="fas fa-lock text-4xl text-zinc-700 mb-2"></i><div className="text-xs text-zinc-600 font-bold uppercase">LV.{unlockLevel} 解锁</div></> : slot ? <><div className={`text-6xl mb-4 quality-${slot.quality}`}><i className="fas fa-cube"></i></div><div className={`text-base font-bold text-center px-1 leading-tight quality-${slot.quality}`}>{slot.name}</div></> : <i className="fas fa-plus text-zinc-700 text-4xl group-hover:text-zinc-500"></i>}
              </div>
            );
          })}
        </div>
        
        {/* NEW DASHBOARD PREVIEW */}
        <div className="w-full bg-zinc-900/50 rounded-xl p-6 border border-zinc-700/50 mb-6 grid grid-cols-4 gap-4 text-center">
           <div className="border-r border-zinc-700/50 pr-4">
               <div className="text-xs text-zinc-400 font-bold uppercase mb-1">预计品质</div>
               <div className={`text-xl font-black ${predictedQualityColor}`}>{predictedQualityStr}</div>
           </div>
           <div className="border-r border-zinc-700/50 pr-4">
               <div className="text-xs text-zinc-400 font-bold uppercase mb-1">材质加成</div>
               <div className={`text-xl font-black ${matTierBonus > 1 ? 'text-yellow-400' : 'text-zinc-500'}`}>x{matTierBonus.toFixed(1)}</div>
           </div>
           <div className="border-r border-zinc-700/50 pr-4">
               <div className="text-xs text-zinc-400 font-bold uppercase mb-1">初始耐久</div>
               <div className="text-white font-mono font-black text-xl">{forgePreview.durability}</div>
           </div>
           <div>
               <div className="text-xs text-zinc-400 font-bold uppercase mb-1">品质倍率</div>
               {player.persistentBuffs.forgeBonus ? (
                   <div className="text-purple-400 font-mono font-black text-xl animate-pulse">
                       x{forgePreview.scoreMult.toFixed(2)} (↑)
                   </div>
               ) : (
                   <div className="text-yellow-500 font-mono font-black text-xl">x{forgePreview.scoreMult.toFixed(2)}</div>
               )}
           </div>
        </div>
        
        {player.persistentBuffs.forgeBonus && (
            <div className="absolute top-6 right-6 bg-purple-900/50 border border-purple-500 text-purple-300 px-3 py-1 rounded-full text-xs font-black animate-pulse shadow-lg">
                <i className="fas fa-star mr-1"></i> 女神祝福：打造倍率 +50%
            </div>
        )}

        <button disabled={forgeSlots.filter(s => s !== null).length === 0} onClick={onStartForge} className={`w-full py-6 text-white font-black text-3xl rounded-2xl shadow-xl active:scale-95 transition tracking-widest bg-gradient-to-r from-orange-700 to-red-700 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:grayscale`}>开始锻造</button>
      </div>
       <div className="bg-zinc-800 p-6 rounded-2xl border border-zinc-700 flex-1 min-h-0 flex flex-col">
        <h3 className="text-lg font-black text-zinc-300 mb-4 uppercase tracking-widest flex items-center shrink-0"><i className="fas fa-cubes mr-2"></i> 材料仓库</h3>
        <div className="grid grid-cols-3 gap-3 overflow-y-auto scrollbar-thin content-start p-1">
          {groupedMaterials.length === 0 && <div className="col-span-3 text-zinc-400 text-lg py-12 italic text-center">空空如也...去商店买点吧</div>}
          {groupedMaterials.map(({ mat, count, instances }) => (
            <button key={`${mat.name}_${mat.quality}`} onClick={() => { const emptyIndex = forgeSlots.findIndex((s, i) => s === null && !getSlotStatus(i).isLocked); if (emptyIndex !== -1 && instances.length > 0) onAddSlot(instances[0], emptyIndex); }} className={`p-4 rounded-xl border bg-zinc-900 flex flex-col items-center justify-center min-h-[160px] hover:bg-zinc-800 transition active:scale-95 relative group shadow-md ${mat.quality === Quality.Rare ? 'border-yellow-900/50' : mat.quality === Quality.Refined ? 'border-green-900/50' : 'border-zinc-700'}`}>
               <div className="absolute top-2 right-2 bg-zinc-800 text-sm font-mono font-black px-2 py-0.5 rounded text-white border border-zinc-600 z-10 shadow">x{count}</div>
               <div className={`text-5xl mb-3 quality-${mat.quality}`}><i className="fas fa-cube"></i></div>
               <div className={`text-xl font-black quality-${mat.quality} truncate w-full text-center leading-tight mb-3`}>{mat.name}</div>
               <div className="text-sm text-zinc-200 font-bold bg-zinc-950/80 px-2 py-2 rounded-xl w-full border border-zinc-700/30 min-h-[3.5rem] flex items-center justify-center mt-auto">
                  <div className="text-center leading-snug">
                     {mat.effectType === 'DURABILITY' && <i className="fas fa-shield-alt text-zinc-400 mr-1.5"></i>}
                     {mat.effectType === 'COST_REDUCTION' && <i className="fas fa-feather text-blue-400 mr-1.5"></i>}
                     {mat.effectType === 'SCORE_MULT' && <i className="fas fa-star text-yellow-500 mr-1.5"></i>}
                     {mat.effectType.startsWith('SPECIAL') && <i className="fas fa-gem text-purple-400 mr-1.5"></i>}
                     <span>{mat.effectType === 'COST_REDUCTION' ? `耐久消耗 -${Math.round(mat.effectValue*100)}%` : mat.description}</span>
                  </div>
               </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
