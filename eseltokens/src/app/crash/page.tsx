'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { apiPath } from '@/lib/clientPaths';
import NotificationsBell from '@/components/NotificationsBell';

const MULTIPLIER_SPEED = 0.00006;

interface CrashBet {
  username: string;
  amount: number;
  cashoutMultiplier: number | null;
  status: 'active' | 'won' | 'lost';
  isMe: boolean;
}

interface GameState {
  gameId: number;
  status: 'betting' | 'running' | 'crashed';
  createdAt: number;
  startedAt: number | null;
  crashedAt: number | null;
  crashPoint?: number;
  bettingEndsAt?: number;
  bets: CrashBet[];
  history: number[];
  serverTime: number;
}

function getMultiplierColor(mult: number): string {
  if (mult < 2) return '#22c55e';
  if (mult < 5) return '#eab308';
  if (mult < 10) return '#f97316';
  return '#ef4444';
}

function historyColor(point: number): string {
  if (point < 2) return 'bg-red-500/20 text-red-400 border-red-500/30';
  if (point < 5) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (point < 10) return 'bg-green-500/20 text-green-400 border-green-500/30';
  return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
}

export default function Crash() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;
  const userBalance = (session?.user as any)?.balance ?? 0;

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [betAmount, setBetAmount] = useState(1);
  const [betPlaced, setBetPlaced] = useState(false);
  const [cashedOut, setCashedOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cashoutInfo, setCashoutInfo] = useState<{ multiplier: number; payout: number } | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multiplierRef = useRef<HTMLDivElement>(null);
  const payoutRef = useRef<HTMLDivElement>(null);
  const betAmountRef = useRef(1);
  const animFrameRef = useRef<number | null>(null);
  const lastGameIdRef = useRef<number | null>(null);
  const countdownRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
    if (status !== 'loading') setInitialLoad(false);
  }, [status]);

  // Poll server
  useEffect(() => {
    if (!session) return;

    const poll = async () => {
      try {
        const res = await fetch(apiPath('/api/crash/state'));
        if (res.ok) {
          const data: GameState = await res.json();
          setGameState(data);

          // Reset bet state on new game
          if (lastGameIdRef.current !== null && data.gameId !== lastGameIdRef.current) {
            setBetPlaced(false);
            setCashedOut(false);
            setCashoutInfo(null);
            update();
          }
          lastGameIdRef.current = data.gameId;

          // Sync local bet state from server
          const myBet = data.bets.find(b => b.isMe);
          if (myBet) {
            setBetPlaced(true);
            betAmountRef.current = myBet.amount;
            if (myBet.status === 'won') {
              setCashedOut(true);
              if (myBet.cashoutMultiplier) {
                setCashoutInfo({ multiplier: myBet.cashoutMultiplier, payout: Math.floor(myBet.amount * myBet.cashoutMultiplier) });
              }
            }
          }
        }
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [session]);

  // Animation loop for multiplier + canvas
  useEffect(() => {
    if (!gameState) return;

    const animate = () => {
      const now = Date.now();

      if (gameState.status === 'betting' && countdownRef.current && gameState.bettingEndsAt) {
        const remaining = Math.max(0, gameState.bettingEndsAt - now) / 1000;
        countdownRef.current.textContent = remaining.toFixed(1) + 's';
      }

      if (gameState.status === 'running' && gameState.startedAt) {
        const elapsed = now - gameState.startedAt;
        const mult = Math.floor(100 * Math.exp(MULTIPLIER_SPEED * elapsed)) / 100;
        if (multiplierRef.current) {
          multiplierRef.current.textContent = mult.toFixed(2) + 'x';
          multiplierRef.current.style.color = getMultiplierColor(mult);
        }
        if (payoutRef.current) {
          const livePayout = Math.floor(betAmountRef.current * mult);
          payoutRef.current.textContent = livePayout + ' 🪙';
        }
        drawCanvas(elapsed, mult, false);
      }

      if (gameState.status === 'crashed' && gameState.crashPoint && gameState.startedAt && gameState.crashedAt) {
        if (multiplierRef.current) {
          multiplierRef.current.textContent = gameState.crashPoint.toFixed(2) + 'x';
          multiplierRef.current.style.color = '#ef4444';
        }
        const elapsed = gameState.crashedAt - gameState.startedAt;
        drawCanvas(elapsed, gameState.crashPoint, true);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [gameState?.status, gameState?.startedAt, gameState?.gameId, gameState?.crashPoint]);

  const drawCanvas = useCallback((elapsed: number, currentMult: number, crashed: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padL = 50;
    const padR = 20;
    const padT = 20;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    const maxTime = Math.max(elapsed * 1.3, 5000);
    const maxMult = Math.max(currentMult * 1.3, 2.5);

    const toX = (t: number) => padL + (t / maxTime) * plotW;
    const toY = (m: number) => padT + plotH - ((m - 1) / (maxMult - 1)) * plotH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';

    // Y-axis grid (multiplier levels)
    const yStep = maxMult <= 5 ? 0.5 : maxMult <= 20 ? 2 : maxMult <= 50 ? 5 : 10;
    for (let m = 1; m <= maxMult; m += yStep) {
      const y = toY(m);
      if (y < padT || y > padT + plotH) continue;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(m.toFixed(yStep < 1 ? 1 : 0) + 'x', 4, y + 4);
    }

    // X-axis grid (time)
    const tStep = maxTime <= 10000 ? 2000 : maxTime <= 30000 ? 5000 : 10000;
    for (let t = 0; t <= maxTime; t += tStep) {
      const x = toX(t);
      if (x < padL || x > w - padR) continue;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillText((t / 1000).toFixed(0) + 's', x - 6, h - 8);
    }

    // Draw curve
    ctx.beginPath();
    ctx.lineWidth = 3;
    const steps = Math.min(300, Math.max(50, Math.floor(elapsed / 20)));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * elapsed;
      const m = Math.exp(MULTIPLIER_SPEED * t);
      const x = toX(t);
      const y = toY(m);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    const lineColor = crashed ? '#ef4444' : getMultiplierColor(currentMult);
    ctx.strokeStyle = lineColor;
    ctx.stroke();

    // Fill under curve
    const endX = toX(elapsed);
    const endY = toY(currentMult);
    ctx.lineTo(endX, toY(1));
    ctx.lineTo(toX(0), toY(1));
    ctx.closePath();
    ctx.fillStyle = crashed
      ? 'rgba(239, 68, 68, 0.08)'
      : currentMult < 2 ? 'rgba(34, 197, 94, 0.08)'
      : currentMult < 5 ? 'rgba(234, 179, 8, 0.08)'
      : 'rgba(249, 115, 22, 0.08)';
    ctx.fill();

    // Dot at end of curve
    if (!crashed) {
      ctx.beginPath();
      ctx.arc(endX, endY, 5, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(endX, endY, 10, 0, Math.PI * 2);
      ctx.strokeStyle = lineColor.replace(')', ', 0.3)').replace('rgb', 'rgba');
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, []);

  const placeBet = async () => {
    if (betPlaced || !gameState || gameState.status !== 'betting') return;
    setErrorMsg('');
    try {
      const res = await fetch(apiPath('/api/crash/bet'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: betAmount }),
      });
      const data = await res.json();
      if (data.success) {
        setBetPlaced(true);
        betAmountRef.current = betAmount;
        update();
      } else {
        setErrorMsg(data.error || 'Fehler');
      }
    } catch {
      setErrorMsg('Verbindungsfehler');
    }
  };

  const cashOut = async () => {
    if (cashedOut || !gameState || gameState.status !== 'running') return;
    try {
      const res = await fetch(apiPath('/api/crash/cashout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setCashedOut(true);
        setCashoutInfo({ multiplier: data.multiplier, payout: data.payout });
        update();
      }
    } catch { /* ignore */ }
  };

  if (status === 'loading' && initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  const myBet = gameState?.bets.find(b => b.isMe);
  const phase = gameState?.status || 'betting';

  return (
    <div className="h-screen overflow-hidden relative flex flex-col" style={{ height: '100dvh' }}>
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full bg-orange-600/8 blur-[150px] -top-60 -right-40" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-red-500/6 blur-[120px] bottom-0 -left-32" />
      </div>

      {/* Nav */}
      <nav className="relative z-30 border-b border-purple-500/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => router.push('/dashboard')}>
            <span className="text-xl sm:text-2xl">🫏</span>
            <h1 className="text-base sm:text-xl font-bold">
              <span className="glow-text">Esel</span><span className="text-amber-400">Tokens</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationsBell />
            <button
              onClick={() => setMenuOpen(m => !m)}
              className="w-8 h-8 flex flex-col items-center justify-center gap-[5px] text-gray-400 hover:text-white transition-colors flex-shrink-0"
              aria-label="Menü"
            >
              <span className={`block w-5 h-0.5 bg-current transition-all duration-300 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
              <span className={`block w-5 h-0.5 bg-current transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-current transition-all duration-300 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
            </button>
            <div className="text-sm flex items-center gap-1">
              <span className="hidden sm:inline text-gray-500">Guthaben: </span>
              <span className="token-display text-base sm:text-lg">{userBalance}</span>
              <span className="text-gray-600 text-xs">🪙</span>
            </div>
          </div>
        </div>
      </nav>
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
      )}
      <div className={`flex-shrink-0 relative z-20 grid transition-[grid-template-rows] duration-300 ease-in-out ${menuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="bg-black/95 backdrop-blur-xl border-b border-white/5 px-4 py-3">
            <div className="max-w-6xl mx-auto">
              <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">Navigation</p>
              <div className="grid grid-cols-6 gap-2">
                {[
                  { href: '/dashboard', icon: '🏠', label: 'Dashboard', current: false },
                  { href: '/earn', icon: '➕', label: '+ Tokens', current: false },
                  { href: '/crash', icon: '📈', label: 'Crash', current: true },
                  { href: '/coinflip', icon: '🪙', label: 'Coinflip', current: false },
                  { href: '/jackpot', icon: '🎰', label: 'Jackpot', current: false },
                  { href: '/blackjack', icon: '🃏', label: 'Blackjack', current: false },
                ].map(item => (
                  <button
                    key={item.href}
                    onClick={() => { setMenuOpen(false); if (!item.current) router.push(item.href); }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-xs ${
                      item.current
                        ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300 cursor-default'
                        : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto w-full px-3 sm:px-4 py-2 flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="mb-2 hidden lg:flex items-center gap-3">
          <span className="text-3xl">📈</span>
          <h1 className="text-2xl font-bold text-white">Crash</h1>
        </div>

        {/* History bar */}
        {gameState && gameState.history.length > 0 && (
          <div className="mb-1.5 flex-shrink-0 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {gameState.history.map((point, i) => (
              <span key={i} className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border ${historyColor(point)}`}>
                {point.toFixed(2)}x
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 flex-1 min-h-0">
          {/* Main game area */}
          <div className="flex-1 min-h-0 lg:flex-[2]">
            <div className="game-card relative overflow-hidden h-full">
              {/* Canvas */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ display: phase === 'betting' ? 'none' : 'block' }}
              />

              {/* Overlay content */}
              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                {phase === 'betting' && (
                  <div className="text-center animate-fade-in">
                    <p className="text-gray-400 text-sm uppercase tracking-widest mb-3">Nächste Runde in</p>
                    <div ref={countdownRef} className="font-black text-amber-400 tabular-nums" style={{ fontSize: 'clamp(2.5rem, 15vw, 4rem)' }}>
                      ...
                    </div>
                    <p className="text-gray-500 text-sm mt-4">Setze deinen Einsatz!</p>
                  </div>
                )}

                {phase === 'running' && (
                  <div className="text-center">
                    <div
                      ref={multiplierRef}
                      className="font-black tabular-nums transition-none"
                      style={{ color: '#22c55e', textShadow: '0 0 40px rgba(34, 197, 94, 0.3)', fontSize: 'clamp(2.5rem, 15vw, 4.5rem)' }}
                    >
                      1.00x
                    </div>
                  </div>
                )}

                {phase === 'crashed' && (
                  <div className="text-center animate-result-pop">
                    <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Crashed</p>
                    <div
                      ref={multiplierRef}
                      className="font-black text-red-500 tabular-nums"
                      style={{ textShadow: '0 0 40px rgba(239, 68, 68, 0.4)', fontSize: 'clamp(2.5rem, 15vw, 4.5rem)' }}
                    >
                      {gameState?.crashPoint?.toFixed(2)}x
                    </div>
                    {myBet && cashedOut && cashoutInfo && (
                      <p className="text-green-400 font-bold text-xl mt-4 animate-fade-in">
                        +{cashoutInfo.payout} Tokens bei {cashoutInfo.multiplier.toFixed(2)}x! 🎉
                      </p>
                    )}
                    {myBet && myBet.status === 'lost' && (
                      <p className="text-red-400 font-bold text-xl mt-4 animate-fade-in">
                        -{myBet.amount} Tokens verloren 💀
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Side panel */}
          <div className="flex-shrink-0 lg:w-80 lg:min-h-0 lg:flex lg:flex-col lg:space-y-3">
            {/* Bet controls */}
            <div className="game-card p-3 lg:p-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Einsatz</h3>

              {phase === 'betting' && !betPlaced && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={betAmount}
                      onChange={e => setBetAmount(Math.max(1, Math.min(userBalance, parseInt(e.target.value) || 1)))}
                      className="game-input flex-1 text-center text-lg font-bold"
                      min={1}
                      max={userBalance}
                    />
                    <span className="text-gray-500 text-sm">🪙</span>
                  </div>
                  <div className="flex gap-2">
                    {[1, 5, 10, 25].map(v => (
                      <button
                        key={v}
                        onClick={() => setBetAmount(Math.min(v, userBalance))}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                      >
                        {v}
                      </button>
                    ))}
                    <button
                      onClick={() => setBetAmount(userBalance)}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                    >
                      Max
                    </button>
                  </div>
                  <button
                    onClick={placeBet}
                    disabled={betAmount < 1 || betAmount > userBalance}
                    className="w-full py-3 rounded-xl font-bold text-lg bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Wetten ({betAmount} 🪙)
                  </button>
                  {errorMsg && <p className="text-red-400 text-xs text-center">{errorMsg}</p>}
                </div>
              )}

              {phase === 'betting' && betPlaced && (
                <div className="text-center py-4">
                  <p className="text-green-400 font-bold text-lg">✅ Wette platziert!</p>
                  <p className="text-gray-500 text-sm mt-1">{myBet?.amount || betAmount} Tokens</p>
                </div>
              )}

              {phase === 'running' && betPlaced && !cashedOut && (
                <div className="space-y-2">
                  <div className="text-center py-2 rounded-lg bg-black/30 border border-green-500/20">
                    <p className="text-gray-500 text-xs uppercase tracking-wider">Aktueller Gewinn</p>
                    <div ref={payoutRef} className="text-2xl font-black text-green-400 tabular-nums">
                      {betAmount} 🪙
                    </div>
                  </div>
                  <button
                    onClick={cashOut}
                    className="w-full py-4 rounded-xl font-black text-xl bg-gradient-to-r from-green-500 to-emerald-500 text-black hover:from-green-400 hover:to-emerald-400 transition-all animate-pulse crash-cashout-btn"
                  >
                    💰 CASH OUT
                  </button>
                </div>
              )}

              {phase === 'running' && betPlaced && cashedOut && cashoutInfo && (
                <div className="text-center py-4">
                  <p className="text-green-400 font-bold text-lg">✅ Ausgecasht!</p>
                  <p className="text-gray-400 text-sm mt-1">bei {cashoutInfo.multiplier.toFixed(2)}x</p>
                  <p className="text-amber-400 font-bold text-xl mt-2">+{cashoutInfo.payout} 🪙</p>
                </div>
              )}

              {phase === 'running' && !betPlaced && (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-sm">Runde läuft...</p>
                  <p className="text-gray-600 text-xs mt-1">Warte auf die nächste Runde</p>
                </div>
              )}

              {phase === 'crashed' && !betPlaced && (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-sm">Nächste Runde startet gleich...</p>
                </div>
              )}

              {phase === 'crashed' && betPlaced && (
                <div className="text-center py-4">
                  {cashedOut && cashoutInfo ? (
                    <>
                      <p className="text-green-400 font-bold text-lg">Gewonnen! 🎉</p>
                      <p className="text-amber-400 font-bold text-xl mt-1">+{cashoutInfo.payout} 🪙 ({cashoutInfo.multiplier.toFixed(2)}x)</p>
                    </>
                  ) : (
                    <>
                      <p className="text-red-400 font-bold text-lg">Verloren 💀</p>
                      <p className="text-gray-500 text-sm mt-1">-{myBet?.amount} Tokens</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Players */}
            <div className="game-card p-4 flex-1 min-h-0 flex-col hidden lg:flex">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
                Spieler ({gameState?.bets.length || 0})
              </h3>
              <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                {gameState?.bets.map((bet, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-2.5 rounded-lg ${
                      bet.isMe ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${bet.isMe ? 'text-purple-300' : 'text-gray-300'}`}>
                        {bet.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{bet.amount} 🪙</span>
                      {bet.status === 'won' && bet.cashoutMultiplier && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                          {bet.cashoutMultiplier.toFixed(2)}x
                        </span>
                      )}
                      {bet.status === 'lost' && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                          ✗
                        </span>
                      )}
                      {bet.status === 'active' && phase === 'running' && (
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      )}
                    </div>
                  </div>
                ))}
                {(!gameState?.bets || gameState.bets.length === 0) && (
                  <p className="text-gray-600 text-center text-sm py-4">Noch keine Wetten</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
