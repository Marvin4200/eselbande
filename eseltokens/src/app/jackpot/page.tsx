'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { apiPath } from '@/lib/clientPaths';
import NotificationsBell from '@/components/NotificationsBell';

const SPIN_DURATION_MS = 6000;
const EXTRA_ROTATIONS  = 8;
const WHEEL_SIZE       = 320; // canvas resolution in px

interface Player {
  userId: number;
  username: string;
  amount: number;
  percentage: number;
  color: string;
  isMe: boolean;
  isHouse?: boolean;
}

interface Winner extends Player {
  payout: number;
}

interface HistoryEntry {
  id: number;
  pot: number;
  winner: string;
  payout: number;
  winnerId: number;
  houseWon: boolean;
  isMe: boolean;
}

interface GameState {
  gameId: number;
  status: 'depositing' | 'spinning' | 'finished';
  createdAt: number;
  spinningAt: number | null;
  finishedAt: number | null;
  depositEndsAt: number;
  totalPot: number;
  houseCut: number;
  players: Player[];
  winner: Winner | null;
  winningTicket: number | null;
  houseWon: boolean;
  myBalance: number;
  history: HistoryEntry[];
  serverTime: number;
}

// ─── Canvas helpers ────────────────────────────────────────────────────────

function drawPointerOn(ctx: CanvasRenderingContext2D, cx: number) {
  const pw = 11, ph = 20;
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx - pw, 0);
  ctx.lineTo(cx + pw, 0);
  ctx.lineTo(cx, ph);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWheel(
  canvas: HTMLCanvasElement,
  players: Player[],
  rotation: number,
  status: string,
  flashProgress: number,   // 0–1, amber glow on winner
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const S = WHEEL_SIZE;
  const cx = S / 2;
  const cy = S / 2;
  const radius = S / 2 - 6;

  ctx.clearRect(0, 0, S, S);

  // ── empty wheel ──────────────────────────────
  if (players.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(139,92,246,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Warte auf Spieler\u2026', cx, cy);
    drawPointerOn(ctx, cx);
    return;
  }

  // ── segments ─────────────────────────────────
  const totalPot = players.reduce((s, p) => s + p.amount, 0);
  let startAngle = rotation - Math.PI / 2; // 0 = top

  for (const player of players) {
    const slice = (player.amount / totalPot) * Math.PI * 2;
    const endAngle = startAngle + slice;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (slice > 0.22) {
      const mid = startAngle + slice / 2;
      const lx = cx + Math.cos(mid) * radius * 0.63;
      const ly = cy + Math.sin(mid) * radius * 0.63;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(mid + Math.PI / 2);
      if ((player as any).isHouse) {
        // House segment: draw 🫏 emoji + label
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🫏', 0, -8);
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = 'rgba(255,200,255,0.8)';
        ctx.fillText(player.percentage.toFixed(1) + '%', 0, 8);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.username.slice(0, 9), 0, -7);
        ctx.font = '9px sans-serif';
        ctx.fillText(player.percentage.toFixed(1) + '%', 0, 7);
      }
      ctx.restore();
    }

    startAngle = endAngle;
  }

  // ── outer ring / glow ─────────────────────────
  const glowAlpha   = flashProgress > 0 ? 0.3 + flashProgress * 0.7 : (status === 'spinning' ? 0.5 : 0.12);
  const ringColor   = flashProgress > 0 ? `rgba(245,158,11,${glowAlpha})` : `rgba(139,92,246,${glowAlpha})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = flashProgress > 0 ? 4 : 2;
  if (flashProgress > 0) { ctx.shadowColor = 'rgba(245,158,11,0.8)'; ctx.shadowBlur = 18 * flashProgress; }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── centre hub ────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#0f0f1a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(139,92,246,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `bold ${Math.round(S * 0.06)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\uD83C\uDFB0', cx, cy + 1);

  // ── pointer arrow at top ──────────────────────
  drawPointerOn(ctx, cx);
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function JackpotPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [gameState, setGameState]         = useState<GameState | null>(null);
  const [depositAmount, setDepositAmount] = useState(10);
  const [errorMsg, setErrorMsg]           = useState('');
  const [initialLoad, setInitialLoad]     = useState(true);
  const [winnerFlash, setWinnerFlash]     = useState(false);
  const [menuOpen, setMenuOpen]            = useState(false);

  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const animFrameRef    = useRef<number | null>(null);
  const countdownRef    = useRef<HTMLDivElement>(null);
  const lastGameIdRef   = useRef<number | null>(null);
  const gameStateRef    = useRef<GameState | null>(null);
  const rotationRef     = useRef(0);
  const flashRef        = useRef(0);
  const winnerShownRef  = useRef(false); // prevents re-triggering per round

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
    if (status !== 'loading') setInitialLoad(false);
  }, [status]);

  // Polling
  useEffect(() => {
    if (!session) return;

    const poll = async () => {
      try {
        const res = await fetch(apiPath('/api/jackpot/state'));
        if (!res.ok) return;
        const data: GameState = await res.json();

        if (lastGameIdRef.current !== null && data.gameId !== lastGameIdRef.current) {
          setErrorMsg('');
          winnerShownRef.current = false;
          setWinnerFlash(false);
          rotationRef.current = 0;
          flashRef.current = 0;
        }

        if (data.status === 'finished' && (data.winner || data.houseWon) && !winnerShownRef.current) {
          winnerShownRef.current = true;
          setWinnerFlash(true);
          flashRef.current = 1;
        }

        lastGameIdRef.current = data.gameId;
        gameStateRef.current  = data;
        setGameState(data);
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [session]);

  // Animation loop
  useEffect(() => {
    if (!gameState) return;

    const animate = () => {
      const gs = gameStateRef.current;
      if (!gs) { animFrameRef.current = requestAnimationFrame(animate); return; }

      const now = Date.now();

      if (gs.status === 'depositing' && countdownRef.current) {
        const rem = Math.max(0, gs.depositEndsAt - now) / 1000;
        countdownRef.current.textContent = rem.toFixed(1) + 's';
      }

      if (gs.status === 'spinning' && gs.spinningAt && gs.winner && gs.totalPot > 0) {
        const elapsed  = now - gs.spinningAt;
        const progress = Math.min(1, elapsed / SPIN_DURATION_MS);
        const eased    = 1 - Math.pow(1 - progress, 4); // quartic ease-out

        // Use visual total (includes house segment) to match drawWheel proportions
        const visualTotal = gs.players.reduce((s, p) => s + p.amount, 0);

        // Find midpoint angle of winner slice
        let winnerAngle = 0;
        let cursor = 0;
        for (const p of gs.players) {
          const slice = (p.amount / visualTotal) * Math.PI * 2;
          if (p.userId === gs.winner.userId) {
            winnerAngle = cursor + slice / 2;
            break;
          }
          cursor += slice;
        }

        // drawWheel uses (rotation - PI/2) as start angle.
        // Pointer is at top (canvas arc angle = -PI/2). For winner to sit under pointer:
        //   rotation - PI/2 + winnerAngle = -PI/2  => rotation = -winnerAngle
        // Add EXTRA_ROTATIONS full spins for drama.
        const target = EXTRA_ROTATIONS * Math.PI * 2 - winnerAngle;
        rotationRef.current = eased * target;

        // Keep flash alive while spinning
        if (progress < 1) flashRef.current = 0;
      } else if (gs.status === 'depositing') {
        rotationRef.current += 0.003;
        flashRef.current = 0;
      } else if (gs.status === 'finished') {
        flashRef.current = Math.max(0, flashRef.current - 0.005);
      }

      const canvas = canvasRef.current;
      if (canvas) drawWheel(canvas, gs.players, rotationRef.current, gs.status, flashRef.current);

      animFrameRef.current = requestAnimationFrame(animate);
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [gameState?.gameId, gameState?.status]);

  const placeDeposit = useCallback(async () => {
    setErrorMsg('');
    try {
      const res = await fetch(apiPath('/api/jackpot/deposit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: depositAmount }),
      });
      const data = await res.json();
      if (!data.success) setErrorMsg(data.error || 'Fehler');
    } catch {
      setErrorMsg('Verbindungsfehler');
    }
  }, [depositAmount]);

  if (initialLoad || status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a15]">
        <div className="text-purple-400 text-xl animate-pulse">Laden...</div>
      </div>
    );
  }

  if (!session) return null;

  const gs        = gameState;
  const phase     = gs?.status ?? 'depositing';
  const myBalance = gs?.myBalance ?? 0;
  const myPlayer  = gs?.players.find(p => p.isMe);

  return (
    <div className="h-screen overflow-hidden relative flex flex-col bg-[#0a0a15]" style={{ height: '100dvh' }}>
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full bg-purple-900/10 blur-[150px] -top-60 -right-40" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-pink-800/8 blur-[120px] bottom-0 -left-32" />
      </div>

      {/* Nav */}
      <nav className="relative z-30 border-b border-purple-500/10 bg-black/20 backdrop-blur-xl">
        <div className="w-full max-w-7xl mx-auto px-4 py-2 sm:py-4 flex items-center justify-between">
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
              <span className="token-display text-base sm:text-lg">{myBalance}</span>
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
            <div className="w-full max-w-7xl mx-auto">
              <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">Navigation</p>
              <div className="grid grid-cols-6 gap-2">
                {[
                  { href: '/dashboard', icon: '🏠', label: 'Dashboard', current: false },
                  { href: '/earn', icon: '➕', label: '+ Tokens', current: false },
                  { href: '/crash', icon: '📈', label: 'Crash', current: false },
                  { href: '/coinflip', icon: '🪙', label: 'Coinflip', current: false },
                  { href: '/jackpot', icon: '🎰', label: 'Jackpot', current: true },
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

      <div className="relative z-10 w-full max-w-7xl mx-auto px-3 sm:px-4 py-2 flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="mb-2 hidden lg:flex items-center gap-3">
          <span className="text-3xl">&#x1F3B0;</span>
          <h1 className="text-2xl font-bold text-white">Jackpot</h1>
          {phase === 'depositing' && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
              Einzahlen &#8211; <span ref={countdownRef} className="font-mono font-bold">&#8230;</span>
            </span>
          )}
          {phase === 'spinning' && (
            <span className="text-xs px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 animate-pulse">
              &#x1F3A1; Dreht sich&#8230;
            </span>
          )}
          {phase === 'finished' && (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
              Runde beendet
            </span>
          )}
        </div>

        {/* History bar */}
        {gs && gs.history.length > 0 && (
          <div className="mb-1.5 flex-shrink-0 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {gs.history.map(h => (
              <span key={h.id} className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border ${
                h.houseWon
                  ? 'bg-red-900/20 border-red-500/30 text-red-400'
                  : h.isMe
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                    : 'bg-white/5 border-white/10 text-gray-400'
              }`}>
                <span className="hidden sm:inline">{h.winner}: </span>{h.payout}🪙
              </span>
            ))}
          </div>
        )}

        {/* Main grid */}
        <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 flex-1 min-h-0">

          {/* Wheel area */}
          <div className="flex-1 min-h-[200px] lg:flex-[2]">
            <div className="game-card flex flex-col items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 h-full overflow-hidden" style={{ transform: 'none' }}>

              {/* Winner celebration confetti banner */}
              {winnerFlash && gs?.houseWon && (
                <div className="w-full flex justify-center">
                  <div className="px-5 py-3 rounded-2xl border-2 border-red-500/50 bg-red-900/20 text-center animate-result-pop">
                    <p className="text-xl font-black text-red-400">🫏 Das Haus gewinnt! Pech gehabt!</p>
                    <p className="text-sm text-red-500/70 mt-0.5">{gs.totalPot}🪙 gehen ans Haus</p>
                  </div>
                </div>
              )}
              {winnerFlash && !gs?.houseWon && gs?.winner && (
                <div className="w-full flex justify-center">
                  <div className={`px-5 py-3 rounded-2xl border-2 text-center animate-result-pop ${
                    gs.winner.isMe
                      ? 'border-amber-400/70 bg-amber-500/10'
                      : 'border-purple-500/40 bg-purple-500/10'
                  }`}>
                    {gs.winner.isMe ? (
                      <p className="text-xl font-black text-amber-400">🎉 Du gewinnst {gs.winner.payout}🪙!</p>
                    ) : (
                      <p className="text-lg font-bold" style={{ color: gs.winner.color }}>
                        🏆 {gs.winner.username} gewinnt {gs.winner.payout}🪙!
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Fixed-size wheel canvas — scales down on tiny screens */}
              <div className="relative flex-shrink-0" style={{ width: 'min(280px, calc(100vw - 3rem), max(100px, calc(100dvh - 28rem)))', height: 'min(280px, calc(100vw - 3rem), max(100px, calc(100dvh - 28rem)))' }}>
                <canvas
                  ref={canvasRef}
                  width={WHEEL_SIZE}
                  height={WHEEL_SIZE}
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
                {/* Celebration emoji burst */}
                {winnerFlash && gs?.houseWon && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-5xl animate-result-pop" style={{ marginTop: '-30%' }}>🫏</div>
                  </div>
                )}
                {winnerFlash && !gs?.houseWon && gs?.winner && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-5xl animate-result-pop" style={{ marginTop: '-30%' }}>
                      {gs.winner.isMe ? '🎉' : '🏆'}
                    </div>
                  </div>
                )}
              </div>

              {/* Pot display */}
              <div className="text-center">
                <p className="text-gray-500 text-xs uppercase tracking-widest mb-0.5">Gesamt-Pot</p>
                <p className="text-2xl sm:text-3xl font-black text-amber-400" style={{ textShadow: '0 0 24px rgba(245,158,11,0.4)' }}>
                  {gs?.totalPot ?? 0}&#x1F4B0;
                </p>
                {gs && gs.totalPot > 0 && gs.houseCut > 0 && (
                  <p className="text-gray-600 text-xs mt-0.5">Gewinner erhält: {gs.totalPot - gs.houseCut}&#x1F4B0;</p>
                )}
              </div>

              {phase === 'depositing' && gs && gs.players.length < 2 && (
                <p className="text-gray-600 text-xs">Mindestens 2 Spieler erforderlich</p>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="flex-shrink-0 lg:w-80 lg:min-h-0 lg:flex lg:flex-col lg:space-y-3">

            {/* Deposit card */}
            <div className="game-card p-3 lg:p-4" style={{ transform: 'none' }}>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Einzahlen</h3>

              {phase === 'depositing' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={e => setDepositAmount(Math.max(1, Math.min(myBalance || 999999, parseInt(e.target.value) || 1)))}
                      className="game-input flex-1 text-center text-lg font-bold"
                      min={1}
                      max={myBalance}
                    />
                    <span className="text-gray-500 text-sm">&#x1F4B0;</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[10, 25, 50, 100].map(v => (
                      <button key={v}
                        onClick={() => setDepositAmount(Math.min(v, myBalance || v))}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all">
                        {v}
                      </button>
                    ))}
                    <button
                      onClick={() => setDepositAmount(Math.max(1, myBalance))}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all">
                      Max
                    </button>
                  </div>
                  <button
                    onClick={placeDeposit}
                    disabled={myBalance < 1 || depositAmount < 1 || depositAmount > myBalance}
                    className="w-full py-3 rounded-xl font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    &#x1F3B0; Einzahlen ({depositAmount}&#x1F4B0;)
                  </button>
                  {errorMsg && (
                    <p className="text-red-400 text-sm text-center font-medium bg-red-900/20 border border-red-500/20 rounded-lg py-2 px-3">
                      {errorMsg}
                    </p>
                  )}
                  {myPlayer && (
                    <p className="text-center text-xs text-purple-400">
                      Dein Einsatz: <span className="font-bold">{myPlayer.amount}&#x1F4B0;</span> ({myPlayer.percentage.toFixed(1)}% Chance)
                    </p>
                  )}
                </div>
              )}

              {phase === 'spinning' && (
                <div className="text-center py-5">
                  <p className="text-purple-300 font-bold animate-pulse">&#x1F3A1; Das Rad dreht sich&#8230;</p>
                  {myPlayer && <p className="text-gray-500 text-sm mt-2">Deine Chance: {myPlayer.percentage.toFixed(1)}%</p>}
                </div>
              )}

              {phase === 'finished' && (
                <div className="text-center py-4">
                  {gs?.houseWon
                    ? <p className="text-red-400 font-black text-lg animate-result-pop">🫏 Das Haus hat gewonnen!</p>
                    : gs?.winner?.isMe
                      ? <p className="text-amber-400 font-black text-xl animate-result-pop">🎉 Gewonnen!</p>
                      : <p className="text-gray-500 text-sm">Nächste Runde startet gleich…</p>
                  }
                </div>
              )}
            </div>

            {/* Player list */}
            <div className="game-card p-4 lg:flex-1 hidden lg:flex lg:flex-col lg:min-h-0 overflow-hidden" style={{ transform: 'none' }}>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                Spieler {gs && gs.players.filter(p => !p.isHouse).length > 0 && <span className="font-normal text-gray-600">({gs.players.filter(p => !p.isHouse).length})</span>}
              </h3>
              {gs && gs.players.length > 0 ? (
                <div className="space-y-1.5 overflow-y-auto flex-1 scrollbar-hide">
                  {gs.players.slice().sort((a, b) => {
                    if (a.isHouse) return 1;  // house always at bottom
                    if (b.isHouse) return -1;
                    return b.amount - a.amount;
                  }).map(p => (
                    <div key={p.userId} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all border ${
                      p.isHouse
                        ? 'bg-purple-900/20 border-purple-800/40'
                        : p.isMe
                          ? 'bg-purple-500/10 border-purple-500/20'
                          : 'bg-white/3 border-white/5'
                    }${gs.winner && gs.winner.userId === p.userId ? ' ring-1 ring-amber-400/60' : ''}`}>
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className={`text-sm flex-1 truncate ${p.isHouse ? 'text-purple-300 italic' : p.isMe ? 'text-purple-300 font-medium' : 'text-gray-300'}`}>
                        {p.username}
                        {p.isMe && <span className="text-xs text-purple-500 ml-1">(Du)</span>}
                        {gs.winner && gs.winner.userId === p.userId && <span className="ml-1">👑</span>}
                      </span>
                      {p.isHouse
                        ? <span className="text-xs text-purple-500 italic">immer dabei</span>
                        : <span className="text-xs text-amber-400 font-bold">{p.amount}🪙</span>
                      }
                      <span className="text-xs text-gray-600 w-10 text-right">{p.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-gray-600 text-sm">Noch keine Einzahlungen</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
