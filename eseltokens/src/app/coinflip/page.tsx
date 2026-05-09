'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { apiPath } from '@/lib/clientPaths';
import NotificationsBell from '@/components/NotificationsBell';

type FlipResult = 'win' | 'lose' | null;

export default function CoinflipPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [bet, setBet] = useState(1);
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<FlipResult>(null);
  const [resultAmount, setResultAmount] = useState(0);
  const [balance, setBalance] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ won: boolean; amount: number }>>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const coinRef = useRef<HTMLDivElement>(null);

  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status !== 'loading') setInitialLoad(false);
  }, [status]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      setTimeout(() => { router.push('/'); }, 0);
    }
    if (status === 'authenticated' && userRole === 'pending') {
      setTimeout(() => { router.push('/'); }, 0);
    }
  }, [status, userRole]);

  useEffect(() => {
    if (session && !isFlipping) {
      setBalance((session.user as any)?.balance ?? 0);
    }
  }, [session]);

  const doFlip = async () => {
    if (isFlipping || bet < 1 || bet > balance) return;

    setIsFlipping(true);
    setResult(null);
    setShowResult(false);

    try {
      const res = await fetch(apiPath('/api/tokens/coinflip'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: bet }),
      });
      const data = await res.json();

      if (!res.ok) {
        setIsFlipping(false);
        return;
      }

      // Set result immediately to start the correct full animation
      setResult(data.won ? 'win' : 'lose');
      setResultAmount(data.amount);

      // Show result text + update balance after animation completes (2.6s)
      setTimeout(() => {
        setBalance(data.newBalance);
        setShowResult(true);
        setHistory(prev => [{ won: data.won, amount: data.amount }, ...prev].slice(0, 10));
        setIsFlipping(false);
        update();
      }, 2700);
    } catch {
      setIsFlipping(false);
    }
  };

  const setQuickBet = (pct: number) => {
    setBet(Math.max(1, Math.floor(balance * pct)));
  };

  if (status === 'loading' && initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && initialLoad) return null;

  return (
    <div className="h-screen overflow-hidden relative flex flex-col" style={{ height: '100dvh' }}>
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full bg-purple-600/8 blur-[150px] -top-60 -right-40" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-amber-500/6 blur-[120px] bottom-0 -left-32" />
      </div>

      {/* Win/Lose screen flash */}
      {showResult && (
        <div className={`fixed inset-0 z-50 pointer-events-none ${
          result === 'win' ? 'animate-win-flash' : 'animate-lose-flash'
        }`} />
      )}

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
              <span className="token-display text-base sm:text-lg">{balance}</span>
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
                  { href: '/crash', icon: '📈', label: 'Crash', current: false },
                  { href: '/coinflip', icon: '🪙', label: 'Coinflip', current: true },
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
        {/* Header + History row */}
        <div className="mb-2 hidden lg:flex items-center gap-3">
          <span className="text-3xl">🪙</span>
          <h1 className="text-2xl font-bold text-white">CoinFlip</h1>
          <span className="text-gray-600 text-sm ml-2">Doppelt oder Nichts!</span>
        </div>

        {/* Session history bar */}
        {history.length > 0 && (
          <div className="mb-1.5 flex-shrink-0 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <span className="text-xs text-gray-500 flex-shrink-0">{history.filter(h => h.won).length}W / {history.filter(h => !h.won).length}L</span>
            {history.map((h, i) => (
              <span
                key={i}
                className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg border ${
                  h.won
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}
              >
                {h.won ? '+' : '-'}{h.amount}
              </span>
            ))}
          </div>
        )}

        {/* Main grid */}
        <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 flex-1 min-h-0">
          {/* Coin area — left/center */}
          <div className="flex-1 min-h-0 lg:flex-[2]">
            <div className="game-card relative overflow-hidden flex flex-col items-center justify-center h-full">
              {/* The Coin */}
              <div className="relative mb-4">
                {/* Glow ring */}
                <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
                  isFlipping ? 'animate-coin-glow' : ''
                } ${showResult && result === 'win' ? 'shadow-[0_0_80px_rgba(245,158,11,0.6)]' : ''}
                ${showResult && result === 'lose' ? 'shadow-[0_0_80px_rgba(239,68,68,0.4)]' : ''}`} />

                <div
                  ref={coinRef}
                  className={`coin-container ${
                    isFlipping && result === 'win' ? 'coin-spin-heads' : ''
                  } ${isFlipping && result === 'lose' ? 'coin-spin-tails' : ''}`}
                  style={!isFlipping && result ? { transform: `rotateY(${result === 'win' ? 3600 : 3780}deg)` } : undefined}
                >
                  <div className="coin-face coin-heads">
                    <div className="w-36 h-36 rounded-full bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-500 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.3)] border-4 border-amber-300/50">
                      <span className="text-6xl select-none">🫏</span>
                    </div>
                  </div>
                  <div className="coin-face coin-tails">
                    <div className="w-36 h-36 rounded-full bg-gradient-to-br from-gray-500 via-gray-400 to-gray-600 flex items-center justify-center shadow-[0_0_40px_rgba(100,100,100,0.3)] border-4 border-gray-400/50">
                      <span className="text-6xl select-none">💀</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Result text */}
              {showResult && (
                <div className={`text-center animate-result-pop ${result === 'win' ? 'result-win' : 'result-lose'}`}>
                  <p className={`text-3xl sm:text-4xl font-black mb-1 ${
                    result === 'win' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {result === 'win' ? '🎉 GEWONNEN!' : '💀 VERLOREN!'}
                  </p>
                  <p className={`text-lg sm:text-xl font-bold ${
                    result === 'win' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {result === 'win' ? `+${resultAmount}` : `-${resultAmount}`} Tokens
                  </p>
                </div>
              )}

              {/* Idle state hint */}
              {!isFlipping && !showResult && (
                <p className="text-gray-600 text-sm mt-2">Platziere deinen Einsatz und drücke FLIP!</p>
              )}
            </div>
          </div>

          {/* Side panel — right */}
          <div className="flex-shrink-0 lg:w-72 lg:min-h-0 lg:flex lg:flex-col">
            {/* Bet controls */}
            <div className="game-card p-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Einsatz</h3>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBet(Math.max(1, bet - 1))}
                    disabled={isFlipping || bet <= 1}
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all disabled:opacity-30 font-bold text-lg flex-shrink-0"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={balance}
                    value={bet}
                    onChange={(e) => setBet(Math.max(1, Math.min(balance, parseInt(e.target.value) || 1)))}
                    disabled={isFlipping}
                    className="game-input flex-1 text-center text-lg font-bold"
                  />
                  <button
                    onClick={() => setBet(Math.min(balance, bet + 1))}
                    disabled={isFlipping || bet >= balance}
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all disabled:opacity-30 font-bold text-lg flex-shrink-0"
                  >
                    +
                  </button>
                </div>

                <div className="flex gap-2">
                  {[
                    { label: 'Min', pct: 0 },
                    { label: '25%', pct: 0.25 },
                    { label: '50%', pct: 0.5 },
                    { label: 'Max', pct: 1 },
                  ].map(({ label, pct }) => (
                    <button
                      key={label}
                      onClick={() => pct === 0 ? setBet(1) : setQuickBet(pct)}
                      disabled={isFlipping}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={doFlip}
                  disabled={isFlipping || balance < 1 || bet > balance}
                  className={`w-full py-3 rounded-xl font-black text-lg transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed ${
                    isFlipping
                      ? 'bg-gray-700 text-gray-400 cursor-wait'
                      : 'btn-coinflip'
                  }`}
                >
                  {isFlipping ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      Dreht sich...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      🪙 FLIP! ({bet} 🪙)
                    </span>
                  )}
                </button>

                {balance < 1 && (
                  <p className="text-red-400/70 text-xs text-center">Keine Tokens mehr!</p>
                )}
              </div>
            </div>

            {/* Info / stats card */}
            <div className="game-card p-4 lg:flex-1 lg:min-h-0 hidden lg:flex flex-col">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Regeln</h3>
              <div className="text-xs text-gray-500 space-y-1.5">
                <p>🫏 <span className="text-amber-300">Esel</span> = Gewonnen → 2x Einsatz</p>
                <p>💀 <span className="text-red-300">Totenkopf</span> = Verloren</p>
                <p className="pt-1 border-t border-white/5 text-gray-600">50/50 Chance • Doppelt oder Nichts</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
