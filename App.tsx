import { useCallback, useEffect, useRef, useState } from 'react';
import { AssetWorkbenchModal } from './components/AssetWorkbenchModal';
import { BattlefieldCanvas } from './components/BattlefieldCanvas';
import { ModelPreviewBay } from './components/ModelPreviewBay';
import { RadarMinimap } from './components/RadarMinimap';
import { SupplyGuidePanel } from './components/SupplyGuidePanel';
import { assetRegistry } from './game/assets';
import { ALL_35_CLASSIC_STAGES } from './game/maps';
import {
  STEP_DT,
  createInitialSimulationState,
  mapCameraRelativeInputToCardinal,
  stepSimulation
} from './game/simulation';
import { soundManager } from './game/sound';
import {
  AssetSlotId,
  BiomeType,
  CameraMode,
  CampaignMode,
  CardinalDir,
  ModelMode,
  SimulationState
} from './game/types';
import {
  LocaleCode,
  TRANSLATIONS,
  detectDefaultLocale,
  saveLocalePreference
} from './i18n/translations';

export function App() {
  const [locale, setLocale] = useState<LocaleCode>(() => detectDefaultLocale());
  const t = TRANSLATIONS[locale];

  const [modelMode, setModelMode] = useState<ModelMode>('tripo');
  const [cameraMode, setCameraMode] = useState<CameraMode>('battlefield');
  const [campaignMode, setCampaignMode] = useState<CampaignMode>('endless');
  const [preferredBiome, setPreferredBiome] = useState<BiomeType>('grass');
  const [stageNumber, setStageNumber] = useState<number>(1);
  const [runSeed, setRunSeed] = useState<string>('FAMI-1985');
  const [coopMode, setCoopMode] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<AssetSlotId>('player');
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState<boolean>(false);
  const [assetRevision, setAssetRevision] = useState<number>(1);
  const [, setHudTick] = useState<number>(0);

  const cameraYawRef = useRef<number>(0);

  const simStateRef = useRef<SimulationState>(
    createInitialSimulationState({
      campaignMode: 'endless',
      stageNumber: 1,
      runSeed: 'FAMI-1985',
      preferredBiome: 'grass',
      coopMode: false,
      readySupplySlots: assetRegistry.getStatus().readySupplySlots
    })
  );

  // Track pressed keys and touch controls
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const touchMoveDirRef = useRef<CardinalDir | null>(null);
  const touchFireRef = useRef<boolean>(false);

  // Preload 17 GLB models and 15 OGG audio cues on mount
  useEffect(() => {
    assetRegistry.preloadAllAssets();
    soundManager.preloadAll();

    const unsubAsset = assetRegistry.onStatusChange(() => {
      const st = assetRegistry.getStatus();
      simStateRef.current.readySupplySlots = st.readySupplySlots;
      setAssetRevision((r) => r + 1);
    });
    const unsubAudio = soundManager.onStatusChange(() => {
      setHudTick((n) => n + 1);
    });

    return () => {
      unsubAsset();
      unsubAudio();
    };
  }, []);

  const handleLanguageChange = (next: LocaleCode) => {
    setLocale(next);
    saveLocalePreference(next);
  };

  const startStage = useCallback(
    (opts: {
      nextStageNum: number;
      nextSeed: string;
      nextCampaign: CampaignMode;
      nextBiome: BiomeType;
      nextCoop: boolean;
      carryProgress: boolean;
    }) => {
      soundManager.unlockOnUserGesture();
      const cur = simStateRef.current;
      const carryScore = opts.carryProgress ? cur.score : 0;
      const carryLives = opts.carryProgress ? cur.sharedLives : 3;
      const p1Star = opts.carryProgress && cur.players[0]?.alive ? cur.players[0].starLevel : 0;
      const p2Star = opts.carryProgress && cur.players[1]?.alive ? cur.players[1].starLevel : 0;
      const p1Hp = opts.carryProgress && cur.players[0]?.alive ? cur.players[0].hp : 3;
      const p2Hp = opts.carryProgress && cur.players[1]?.alive ? cur.players[1].hp : 3;

      simStateRef.current = createInitialSimulationState({
        campaignMode: opts.nextCampaign,
        stageNumber: opts.nextStageNum,
        runSeed: opts.nextSeed,
        preferredBiome: opts.nextBiome,
        coopMode: opts.nextCoop,
        carryScore,
        carryLives,
        carryPlayerStars: [p1Star, p2Star],
        carryPlayerHp: [p1Hp, p2Hp],
        readySupplySlots: assetRegistry.getStatus().readySupplySlots
      });
      soundManager.play('levelstarting');
      setStageNumber(opts.nextStageNum);
      setRunSeed(opts.nextSeed);
      setCampaignMode(opts.nextCampaign);
      setPreferredBiome(opts.nextBiome);
      setCoopMode(opts.nextCoop);
      setHudTick((n) => n + 1);
    },
    []
  );

  const togglePause = useCallback(() => {
    const st = simStateRef.current;
    if (st.status === 'playing') {
      st.status = 'paused';
      soundManager.setEngineLoop('off');
      soundManager.play('pause');
      setHudTick((n) => n + 1);
    } else if (st.status === 'paused') {
      st.status = 'playing';
      soundManager.play('pause');
      setHudTick((n) => n + 1);
    }
  }, []);

  const handleRerollMap = () => {
    const randomSeed = `BC-${Math.floor(1000 + Math.random() * 9000)}`;
    startStage({
      nextStageNum: stageNumber,
      nextSeed: randomSeed,
      nextCampaign: campaignMode,
      nextBiome: preferredBiome,
      nextCoop: coopMode,
      carryProgress: false
    });
  };

  const handleRetryStage = () => {
    startStage({
      nextStageNum: stageNumber,
      nextSeed: runSeed,
      nextCampaign: campaignMode,
      nextBiome: preferredBiome,
      nextCoop: coopMode,
      carryProgress: false
    });
  };

  const handleNextStage = () => {
    const nextNum = campaignMode === 'classic' ? (stageNumber % 35) + 1 : stageNumber + 1;
    startStage({
      nextStageNum: nextNum,
      nextSeed: runSeed,
      nextCampaign: campaignMode,
      nextBiome: preferredBiome,
      nextCoop: coopMode,
      carryProgress: true
    });
  };

  // Keyboard & Focus-Loss Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      soundManager.unlockOnUserGesture();
      const code = e.code;

      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      if (code === 'KeyP' || code === 'Escape') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (code === 'KeyC') {
        e.preventDefault();
        setCameraMode((prev) => (prev === 'battlefield' ? 'tactical' : 'battlefield'));
        return;
      }
      if (code === 'Digit1') {
        setModelMode('tripo');
        return;
      }
      if (code === 'Digit2') {
        setModelMode('three');
        return;
      }

      pressedKeysRef.current.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);
    };

    const onBlurOrHide = () => {
      pressedKeysRef.current.clear();
      touchMoveDirRef.current = null;
      touchFireRef.current = false;
      if (simStateRef.current.status === 'playing') {
        simStateRef.current.status = 'paused';
        soundManager.setEngineLoop('off');
        setHudTick((n) => n + 1);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) onBlurOrHide();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlurOrHide);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlurOrHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [togglePause]);

  // Fixed 120 Hz Simulation Loop independent of rendering framerate
  useEffect(() => {
    let lastTime = performance.now();
    let accumulator = 0;
    let frameCount = 0;
    let rafId = 0;

    const resolvePlayerInput = () => {
      const keys = pressedKeysRef.current;
      const yaw = cameraYawRef.current;
      const isCoop = simStateRef.current.coopMode;

      // Player 1 Raw Direction
      let p1Raw: CardinalDir | null = touchMoveDirRef.current;
      if (!p1Raw) {
        if (keys.has('KeyW') || (!isCoop && keys.has('ArrowUp'))) p1Raw = 'N';
        else if (keys.has('KeyS') || (!isCoop && keys.has('ArrowDown'))) p1Raw = 'S';
        else if (keys.has('KeyA') || (!isCoop && keys.has('ArrowLeft'))) p1Raw = 'W';
        else if (keys.has('KeyD') || (!isCoop && keys.has('ArrowRight'))) p1Raw = 'E';
      }

      const p1Move = p1Raw ? mapCameraRelativeInputToCardinal(p1Raw, yaw) : null;
      const p1Fire =
        touchFireRef.current ||
        keys.has('Space') ||
        keys.has('KeyJ') ||
        (!isCoop && (keys.has('Enter') || keys.has('Numpad0')));

      // Player 2 Raw Direction (Co-op: Arrows + Enter/Numpad0)
      let p2Raw: CardinalDir | null = null;
      if (isCoop) {
        if (keys.has('ArrowUp')) p2Raw = 'N';
        else if (keys.has('ArrowDown')) p2Raw = 'S';
        else if (keys.has('ArrowLeft')) p2Raw = 'W';
        else if (keys.has('ArrowRight')) p2Raw = 'E';
      }
      const p2Move = p2Raw ? mapCameraRelativeInputToCardinal(p2Raw, yaw) : null;
      const p2Fire = isCoop && (keys.has('Enter') || keys.has('Numpad0'));

      return {
        p1: { moveDir: p1Move, firePressed: p1Fire },
        p2: { moveDir: p2Move, firePressed: p2Fire }
      };
    };

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const elapsedSec = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      accumulator += elapsedSec;

      const inputs = resolvePlayerInput();
      while (accumulator >= STEP_DT) {
        stepSimulation(simStateRef.current, inputs, STEP_DT);
        accumulator -= STEP_DT;
      }

      frameCount++;
      if (frameCount % 6 === 0) {
        setHudTick((n) => (n + 1) % 1000000);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const sim = simStateRef.current;
  const audioStatus = soundManager.getStatus();
  const assetStatus = assetRegistry.getStatus();

  // Active timed-effect pills for the bottom battlefield bar (matching ref_image.png)
  const p1 = sim.players[0];
  const activeTimedEffects: string[] = [];
  if (p1 && p1.shieldTimer > 0) {
    activeTimedEffects.push(`${t.effects.shield} ${Math.ceil(p1.shieldTimer)}s`);
  }
  if (sim.freezeTimer > 0) {
    activeTimedEffects.push(`${t.effects.freeze} ${Math.ceil(sim.freezeTimer)}s`);
  }
  if (sim.shovelTimer > 0) {
    activeTimedEffects.push(`${t.effects.shovel} ${Math.ceil(sim.shovelTimer)}s`);
  }
  if (p1 && p1.ammoTimer > 0) {
    activeTimedEffects.push(`${t.effects.ammo} ${Math.ceil(p1.ammoTimer)}s`);
  }
  if (p1 && p1.magnetTimer > 0) {
    activeTimedEffects.push(`${t.effects.magnet} ${Math.ceil(p1.magnetTimer)}s`);
  }
  if (p1 && p1.boostTimer > 0) {
    activeTimedEffects.push(`${t.effects.boost} ${Math.ceil(p1.boostTimer)}s`);
  }

  return (
    <div className="min-h-screen bg-[#11160e] text-[#e6ecd9] flex flex-col font-sans selection:bg-[#eab308] selection:text-black">
      {/* Top Dark Olive Command Bar */}
      <header className="bg-[#181f14] border-b border-[#2e3a25] px-3 py-2">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Brand Title + Status Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-[#eab308] inline-block shadow-[0_0_8px_#eab308]" />
              <h1 className="text-base sm:text-lg font-extrabold tracking-wider text-white">
                {t.title}
              </h1>
            </div>
            <span className="hidden md:inline text-[11px] font-mono text-[#9fb086]">
              {t.subtitle}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#232d1c] border border-[#3c4b2f] text-[#b8c79f]">
              {assetStatus.allReady && audioStatus.isReady
                ? t.allAssetsReady
                : assetStatus.coreReady
                ? t.bgAssetsLoading
                : t.coreAssetsReady}
            </span>
          </div>

          {/* Right Controls: Audio Volume/Mute, Provenance & Language */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-[#12170f] border border-[#2f3b25] rounded px-2 py-1">
              <button
                type="button"
                onClick={() => soundManager.setMuted(!audioStatus.muted)}
                className="text-[#facc15] font-semibold hover:underline cursor-pointer"
              >
                {audioStatus.muted ? t.unmute : t.mute}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioStatus.muted ? 0 : audioStatus.volume}
                onChange={(e) => soundManager.setVolume(parseFloat(e.target.value))}
                className="w-16 accent-[#eab308] cursor-pointer"
                aria-label={t.volume}
              />
            </div>

            <button
              type="button"
              onClick={() => setIsWorkbenchOpen(true)}
              className="px-2.5 py-1 rounded bg-[#26311e] hover:bg-[#324028] border border-[#435435] text-[#facc15] font-semibold cursor-pointer"
            >
              {t.provenanceBtn}
            </button>

            <select
              value={locale}
              onChange={(e) => handleLanguageChange(e.target.value as LocaleCode)}
              className="bg-[#12170f] border border-[#38462c] rounded px-2 py-1 text-xs text-[#e6ecd9] cursor-pointer"
              aria-label="Language"
            >
              <option value="en">EN · English</option>
              <option value="zh-CN">简体中文</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-2 sm:px-3 py-2 flex flex-col gap-2">
        {/* Large Tripo 3D / Three.js Model Switch & Rotating 3D Tank Preview Above Battlefield */}
        <ModelPreviewBay
          modelMode={modelMode}
          onSelectModelMode={(m) => setModelMode(m)}
          selectedSlot={selectedSlot}
          onSelectSlot={(s) => setSelectedSlot(s)}
          onOpenCustomizeModal={() => setIsWorkbenchOpen(true)}
          assetRevision={assetRevision}
          t={t}
        />

        {/* Center Row: Battlefield Viewport + Right Olive Command Sidebar */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2.5 min-h-[480px]">
          {/* Perspective-3D Battlefield Viewport (8 cols on desktop) */}
          <div className="lg:col-span-8 xl:col-span-9 relative rounded-lg overflow-hidden border border-[#3a482d] bg-[#141a12] min-h-[440px] sm:min-h-[540px] flex flex-col">
            <div className="flex-1 relative">
              <BattlefieldCanvas
                simStateRef={simStateRef}
                modelMode={modelMode}
                cameraMode={cameraMode}
                cameraYawRef={cameraYawRef}
                assetRevision={assetRevision}
              />

              {/* Top Battlefield HUD Bar (Matches ref_image.png!) */}
              <div className="absolute top-0 left-0 right-0 px-3.5 py-2.5 bg-gradient-to-b from-[#141a12]/85 via-[#141a12]/50 to-transparent flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[11px] font-mono tracking-widest uppercase text-[#d2dec4]">
                    {t.stage}
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-[#eab308] leading-none font-mono">
                    {String(sim.stageNumber).padStart(2, '0')}
                  </span>
                  <span className="text-xs sm:text-sm font-bold tracking-widest uppercase text-[#e6ecd9]">
                    {sim.stageName}
                  </span>
                </div>

                {/* Camera Mode Switch + Quick Action Buttons (Visible without scrolling) */}
                <div className="flex items-center gap-1.5 pointer-events-auto">
                  <button
                    type="button"
                    onClick={togglePause}
                    className="px-2.5 py-1.5 rounded bg-[#1b2216]/90 hover:bg-[#2a3522] border border-[#455636] text-xs font-bold text-[#facc15] cursor-pointer"
                  >
                    {sim.status === 'paused' ? t.resume : t.pause}
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryStage}
                    className="px-2.5 py-1.5 rounded bg-[#1b2216]/90 hover:bg-[#2a3522] border border-[#455636] text-xs font-semibold text-[#e6ecd9] cursor-pointer"
                  >
                    {t.retryStage}
                  </button>

                  <div className="inline-flex rounded bg-[#151b12]/90 border border-[#3b492f] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCameraMode('tactical')}
                      className={`px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase transition cursor-pointer ${
                        cameraMode === 'tactical'
                          ? 'bg-[#354128] text-white'
                          : 'text-[#a8b890] hover:text-white'
                      }`}
                    >
                      {t.cameraTactical}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraMode('battlefield')}
                      className={`px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase transition cursor-pointer ${
                        cameraMode === 'battlefield'
                          ? 'bg-[#354128] text-white'
                          : 'text-[#a8b890] hover:text-white'
                      }`}
                    >
                      {t.cameraBattlefield}
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom-Left Radar Minimap + Bottom Timed-Effect Bar (Matches ref_image.png!) */}
              <div className="absolute bottom-7 left-3 right-3 flex items-end gap-3 pointer-events-none">
                <div className="pointer-events-auto shrink-0">
                  <RadarMinimap simState={sim} />
                </div>

                {/* Timed-effect Indicator Bar */}
                <div className="flex-1 bg-[#1e2618]/88 border border-[#3e4d31] rounded px-3 py-2 min-h-[38px] flex flex-wrap items-center justify-between gap-2 backdrop-blur-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {activeTimedEffects.length > 0 ? (
                      activeTimedEffects.map((txt, idx) => (
                        <span
                          key={idx}
                          className="text-xs font-bold text-[#f4f7ed] bg-[#2e3b24] border border-[#eab308]/40 px-2 py-0.5 rounded"
                        >
                          {txt}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[#9eb087] font-mono">
                        P1 HP: {p1 ? '▮'.repeat(p1.hp) + '▯'.repeat(3 - p1.hp) : '▯▯▯'} · ★
                        {p1 ? p1.starLevel : 0}
                        {sim.coopMode && sim.players[1]
                          ? ` | P2 HP: ${'▮'.repeat(sim.players[1].hp)}${'▯'.repeat(
                              3 - sim.players[1].hp
                            )} · ★${sim.players[1].starLevel}`
                          : ''}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-[#c5d3b0]">
                    {t.score}: <strong className="text-[#facc15]">{sim.score}</strong> ·{' '}
                    {t.lives}: <strong className="text-[#4ade80]">♥ {sim.sharedLives}</strong> ·{' '}
                    {t.enemiesLeft}:{' '}
                    <strong className="text-[#f87171]">{sim.enemiesRemainingTotal}</strong>
                  </div>
                </div>
              </div>

              {/* Bottom Status Caption Line (Matches ref_image.png!) */}
              <div className="absolute bottom-1.5 left-3.5 right-3.5 flex items-center justify-between text-[11px] font-mono text-[#d6dec8]/90 drop-shadow pointer-events-none">
                <span className="tracking-widest uppercase">{t.bottomHintLeft}</span>
                <span>{t.bottomHintRight}</span>
              </div>

              {/* Narrow-Screen / Multitouch Controls Overlay (Simultaneous D-pad + Fire hold) */}
              <div className="lg:hidden absolute bottom-16 right-3 left-36 flex items-end justify-between pointer-events-none">
                {/* 4-Way Cardinal D-Pad */}
                <div
                  className="grid grid-cols-3 gap-1 w-28 h-28 pointer-events-auto touch-none select-none"
                  onPointerUp={() => {
                    touchMoveDirRef.current = null;
                  }}
                  onPointerCancel={() => {
                    touchMoveDirRef.current = null;
                  }}
                  onPointerLeave={() => {
                    touchMoveDirRef.current = null;
                  }}
                >
                  <div />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      soundManager.unlockOnUserGesture();
                      touchMoveDirRef.current = 'N';
                    }}
                    className="rounded bg-[#1b2216]/90 active:bg-[#eab308] active:text-black border border-[#4b5d3b] text-xs font-bold flex items-center justify-center"
                  >
                    ▲
                  </button>
                  <div />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      soundManager.unlockOnUserGesture();
                      touchMoveDirRef.current = 'W';
                    }}
                    className="rounded bg-[#1b2216]/90 active:bg-[#eab308] active:text-black border border-[#4b5d3b] text-xs font-bold flex items-center justify-center"
                  >
                    ◀
                  </button>
                  <div className="rounded bg-[#141911]/80 border border-[#333f28]" />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      soundManager.unlockOnUserGesture();
                      touchMoveDirRef.current = 'E';
                    }}
                    className="rounded bg-[#1b2216]/90 active:bg-[#eab308] active:text-black border border-[#4b5d3b] text-xs font-bold flex items-center justify-center"
                  >
                    ▶
                  </button>
                  <div />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      soundManager.unlockOnUserGesture();
                      touchMoveDirRef.current = 'S';
                    }}
                    className="rounded bg-[#1b2216]/90 active:bg-[#eab308] active:text-black border border-[#4b5d3b] text-xs font-bold flex items-center justify-center"
                  >
                    ▼
                  </button>
                  <div />
                </div>

                {/* Simultaneous Fire Hold Button */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    soundManager.unlockOnUserGesture();
                    touchFireRef.current = true;
                  }}
                  onPointerUp={() => {
                    touchFireRef.current = false;
                  }}
                  onPointerCancel={() => {
                    touchFireRef.current = false;
                  }}
                  onPointerLeave={() => {
                    touchFireRef.current = false;
                  }}
                  className="w-20 h-20 rounded-full bg-[#eab308]/90 active:bg-[#facc15] text-[#141911] font-black text-sm tracking-wider border-2 border-white/40 shadow-xl pointer-events-auto touch-none select-none flex items-center justify-center"
                >
                  {t.touchFire}
                </button>
              </div>

              {/* Pause / Victory / Defeat Modal Overlay inside Battlefield */}
              {sim.status !== 'playing' && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-20">
                  <div className="bg-[#1b2216] border-2 border-[#eab308] rounded-xl max-w-md w-full p-5 text-center space-y-4 shadow-2xl">
                    <h2 className="text-2xl font-black tracking-wider text-[#facc15]">
                      {sim.status === 'victory'
                        ? t.victoryTitle
                        : sim.status === 'defeat'
                        ? t.defeatTitle
                        : t.pausedTitle}
                    </h2>
                    <p className="text-xs text-[#c7d4b4] leading-relaxed">
                      {sim.status === 'victory'
                        ? t.victorySub
                        : sim.status === 'defeat'
                        ? sim.defeatReason === 'eagle'
                          ? t.defeatEagleSub
                          : t.defeatLivesSub
                        : t.pausedSub}
                    </p>

                    <div className="flex justify-center gap-4 text-xs font-mono bg-[#13180f] p-2.5 rounded border border-[#303d26]">
                      <span>
                        {t.score}: <strong className="text-[#facc15]">{sim.score}</strong>
                      </span>
                      <span>
                        {t.bestScore}: <strong className="text-white">{sim.bestScore}</strong>
                      </span>
                      <span>
                        {t.lives}: <strong className="text-[#4ade80]">{sim.sharedLives}</strong>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                      {sim.status === 'paused' && (
                        <button
                          type="button"
                          onClick={togglePause}
                          className="px-4 py-2 rounded bg-[#eab308] hover:bg-[#facc15] text-[#141911] font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          {t.resume}
                        </button>
                      )}
                      {sim.status === 'victory' && (
                        <button
                          type="button"
                          onClick={handleNextStage}
                          className="px-5 py-2 rounded bg-[#eab308] hover:bg-[#facc15] text-[#141911] font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          {t.nextStage} →
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleRetryStage}
                        className="px-4 py-2 rounded bg-[#2b3622] hover:bg-[#38462c] border border-[#4a5c3a] text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                      >
                        {t.retryStage}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Olive Command Interface Sidebar (4 cols on desktop) */}
          <aside className="lg:col-span-4 xl:col-span-3 flex flex-col gap-2.5">
            {/* Score, Shared Lives & Remaining 20 Enemy Icons Panel */}
            <div className="bg-[#1a2115] border border-[#35422a] rounded-lg p-3 space-y-2.5">
              <div className="grid grid-cols-3 gap-2 text-center bg-[#13180f] p-2 rounded border border-[#2a3420]">
                <div>
                  <div className="text-[10px] font-mono text-[#98a980]">{t.score}</div>
                  <div className="text-base font-black font-mono text-[#facc15]">{sim.score}</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-[#98a980]">{t.bestScore}</div>
                  <div className="text-base font-black font-mono text-white">{sim.bestScore}</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-[#98a980]">{t.lives}</div>
                  <div className="text-base font-black font-mono text-[#4ade80]">
                    ♥ × {sim.sharedLives}
                  </div>
                </div>
              </div>

              {/* 20 Enemy Wave Icons */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#a3b38b] mb-1">
                  <span>{t.enemiesLeft}</span>
                  <span className="text-[#facc15] font-bold">{sim.enemiesRemainingTotal} / 20</span>
                </div>
                <div className="grid grid-cols-10 gap-1 bg-[#13180f] p-2 rounded border border-[#2a3420]">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const active = i < sim.enemiesRemainingTotal;
                    return (
                      <div
                        key={i}
                        className={`h-3.5 rounded-xs flex items-center justify-center text-[9px] font-bold ${
                          active
                            ? 'bg-[#eab308] text-[#141911]'
                            : 'bg-[#21291b] text-[#435237]'
                        }`}
                        title={`Enemy #${i + 1}`}
                      >
                        ▲
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Campaign & Stage / Seed Configuration Panel */}
            <div className="bg-[#1a2115] border border-[#35422a] rounded-lg p-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold uppercase tracking-wider text-[#facc15]">
                  {t.campaignMode}
                </span>
                <div className="inline-flex rounded bg-[#12170f] p-0.5 border border-[#2f3b25]">
                  <button
                    type="button"
                    onClick={() =>
                      startStage({
                        nextStageNum: 1,
                        nextSeed: runSeed,
                        nextCampaign: 'endless',
                        nextBiome: preferredBiome,
                        nextCoop: coopMode,
                        carryProgress: false
                      })
                    }
                    className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      campaignMode === 'endless'
                        ? 'bg-[#eab308] text-[#141911]'
                        : 'text-[#a3b38b]'
                    }`}
                  >
                    {t.endlessCampaign}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startStage({
                        nextStageNum: stageNumber,
                        nextSeed: runSeed,
                        nextCampaign: 'classic',
                        nextBiome: preferredBiome,
                        nextCoop: coopMode,
                        carryProgress: false
                      })
                    }
                    className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      campaignMode === 'classic'
                        ? 'bg-[#eab308] text-[#141911]'
                        : 'text-[#a3b38b]'
                    }`}
                  >
                    {t.classicCampaign}
                  </button>
                </div>
              </div>

              {campaignMode === 'endless' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-[#98a980] mb-1">
                      {t.biomeLabel}
                    </label>
                    <select
                      value={preferredBiome}
                      onChange={(e) => {
                        const b = e.target.value as BiomeType;
                        startStage({
                          nextStageNum: stageNumber,
                          nextSeed: runSeed,
                          nextCampaign: 'endless',
                          nextBiome: b,
                          nextCoop: coopMode,
                          carryProgress: false
                        });
                      }}
                      className="w-full bg-[#12170f] border border-[#35432a] rounded px-2 py-1 text-xs"
                    >
                      <option value="grass">{t.biomeGrass}</option>
                      <option value="snow">{t.biomeSnow}</option>
                      <option value="industrial">{t.biomeIndustrial}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-[#98a980] mb-1">
                      {t.seedLabel}
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={runSeed}
                        onChange={(e) => setRunSeed(e.target.value)}
                        onBlur={() =>
                          startStage({
                            nextStageNum: stageNumber,
                            nextSeed: runSeed || 'SEED-1',
                            nextCampaign: 'endless',
                            nextBiome: preferredBiome,
                            nextCoop: coopMode,
                            carryProgress: false
                          })
                        }
                        className="w-full min-w-0 bg-[#12170f] border border-[#35432a] rounded px-2 py-1 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleRerollMap}
                        className="px-2 py-1 rounded bg-[#293420] hover:bg-[#36442b] border border-[#475938] text-[#facc15] font-semibold shrink-0 cursor-pointer"
                        title={t.rerollMap}
                      >
                        🎲
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-mono text-[#98a980] mb-1">
                    {t.classicStageLabel} (1–35)
                  </label>
                  <select
                    value={stageNumber}
                    onChange={(e) => {
                      const s = parseInt(e.target.value, 10);
                      startStage({
                        nextStageNum: s,
                        nextSeed: runSeed,
                        nextCampaign: 'classic',
                        nextBiome: preferredBiome,
                        nextCoop: coopMode,
                        carryProgress: false
                      });
                    }}
                    className="w-full bg-[#12170f] border border-[#35432a] rounded px-2 py-1.5 text-xs font-mono"
                  >
                    {ALL_35_CLASSIC_STAGES.map((st) => (
                      <option key={st.stage} value={st.stage}>
                        STAGE {String(st.stage).padStart(2, '0')} — {st.name} ({st.biome.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Solo / Co-op Toggle & Next Stage / Reroll Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="inline-flex rounded bg-[#12170f] p-0.5 border border-[#2f3b25]">
                  <button
                    type="button"
                    onClick={() =>
                      startStage({
                        nextStageNum: stageNumber,
                        nextSeed: runSeed,
                        nextCampaign: campaignMode,
                        nextBiome: preferredBiome,
                        nextCoop: false,
                        carryProgress: false
                      })
                    }
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      !coopMode ? 'bg-[#eab308] text-[#141911]' : 'text-[#a3b38b]'
                    }`}
                  >
                    {t.playersSolo}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startStage({
                        nextStageNum: stageNumber,
                        nextSeed: runSeed,
                        nextCampaign: campaignMode,
                        nextBiome: preferredBiome,
                        nextCoop: true,
                        carryProgress: false
                      })
                    }
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      coopMode ? 'bg-[#eab308] text-[#141911]' : 'text-[#a3b38b]'
                    }`}
                  >
                    {t.playersCoop}
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleRerollMap}
                    className="px-2.5 py-1 rounded bg-[#27321f] hover:bg-[#35432a] border border-[#445636] text-xs font-semibold cursor-pointer"
                  >
                    {t.rerollMap}
                  </button>
                  <button
                    type="button"
                    onClick={handleNextStage}
                    className="px-2.5 py-1 rounded bg-[#eab308] hover:bg-[#facc15] text-[#141911] text-xs font-bold cursor-pointer"
                  >
                    {t.nextStage} →
                  </button>
                </div>
              </div>
            </div>

            {/* Illustrated 10-Supply Guide Panel */}
            <SupplyGuidePanel
              t={t}
              selectedSlot={selectedSlot}
              onSelectSlot={(s) => setSelectedSlot(s)}
            />

            {/* Compact Tactical Controls Summary */}
            <div className="bg-[#1a2115] border border-[#35422a] rounded-lg p-2.5 text-[11px] text-[#b4c39e] space-y-1">
              <div className="font-bold text-[#facc15] uppercase tracking-wider">
                {t.controlsGuideTitle}
              </div>
              <div>{coopMode ? t.controlsCoopDesc : t.controlsSoloDesc}</div>
              <div className="text-[#8fa078] font-mono text-[10px]">{t.controlsSystemDesc}</div>
            </div>
          </aside>
        </div>
      </main>

      {/* Interactive Asset Customization, GLB Slot Importer & Provenance Modal */}
      <AssetWorkbenchModal
        isOpen={isWorkbenchOpen}
        onClose={() => setIsWorkbenchOpen(false)}
        selectedSlot={selectedSlot}
        onSelectSlot={(s) => setSelectedSlot(s)}
        onAssetChanged={() => setAssetRevision((r) => r + 1)}
      />
    </div>
  );
}
export default App;
