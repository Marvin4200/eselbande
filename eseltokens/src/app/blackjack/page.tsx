'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { apiPath } from '@/lib/clientPaths';
import NotificationsBell from '@/components/NotificationsBell';

interface CardData {
  suit: string;
  rank: string;
}

interface HandData {
  cards: CardData[];
  bet: number;
  status: string;
  value: number;
  bust: boolean;
  blackjack: boolean;
  canSplit: boolean;
  canDouble: boolean;
}

interface PlayerData {
  seatIndex: number;
  username: string;
  userId: number;
  isMe: boolean;
  isReady: boolean;
  currentHandIndex: number;
  hands: HandData[];
}

interface TableData {
  id: string;
  status: string;
  dealerCards: (CardData | null)[];
  dealerValue: number | null;
  currentSeat: number;
}

interface GameState {
  table: TableData;
  players: PlayerData[];
  myPlayer: { seatIndex: number; isReady: boolean } | null;
  myBalance: number;
}

interface TableInfo {
  id: string;
  status: string;
  playerCount: number;
}

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};
const SUIT_COLORS: Record<string, string> = {
  hearts: 'text-red-500', diamonds: 'text-red-500',
  clubs: 'text-gray-900', spades: 'text-gray-900',
};

function Card({ card, faceDown = false, delay = 0, animate = true, wasHidden = false }: { card: CardData | null; faceDown?: boolean; delay?: number; animate?: boolean; wasHidden?: boolean }) {
  if (faceDown || !card) {
    return (
      <div
        className={`bj-card bj-card-back ${animate ? 'bj-card-enter' : ''}`}
        style={animate ? { animationDelay: `${delay}ms` } : undefined}
      >
        <div className="bj-card-pattern">🫏</div>
      </div>
    );
  }
  const color = SUIT_COLORS[card.suit] || 'text-gray-100';
  const animClass = animate ? 'bj-card-enter' : wasHidden ? 'bj-card-flip' : '';
  return (
    <div
      className={`bj-card ${color} ${animClass}`}
      style={animate ? { animationDelay: `${delay}ms` } : wasHidden ? { animationDelay: `${delay}ms` } : undefined}
    >
      <span className="bj-card-rank">{card.rank}</span>
      <span className="bj-card-suit">{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  );
}

function HandDisplay({ hand, isActive, knownCardCount = 0 }: { hand: HandData; isActive: boolean; knownCardCount?: number }) {
  const cardCount = hand.cards.length;
  // Overlap cards when more than 3 to save space
  const useOverlap = cardCount > 3;
  const overlapPx = cardCount > 5 ? -30 : -20;

  return (
    <div className={`relative ${isActive ? 'bj-hand-active' : ''}`}>
      <div className="flex justify-center mb-1" style={{ minHeight: '72px' }}>
        {hand.cards.map((c, i) => (
          <div
            key={i}
            style={useOverlap && i > 0 ? { marginLeft: `${overlapPx}px` } : undefined}
            className={!useOverlap && i > 0 ? 'ml-1' : ''}
          >
            <Card card={c} delay={i >= knownCardCount ? (i - knownCardCount) * 300 : 0} animate={i >= knownCardCount} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          hand.bust ? 'bg-red-500/20 text-red-400' :
          hand.blackjack ? 'bg-amber-500/20 text-amber-400' :
          hand.status === 'won' ? 'bg-green-500/20 text-green-400' :
          hand.status === 'lost' ? 'bg-red-500/20 text-red-400' :
          hand.status === 'push' ? 'bg-gray-500/20 text-gray-400' :
          'bg-white/10 text-white'
        }`}>
          {hand.bust ? 'BUST' : hand.blackjack ? 'BJ!' : hand.value}
        </span>
        <span className="text-xs text-amber-400">🪙 {hand.bet}</span>
        {hand.status === 'won' && <span className="text-xs text-green-400 font-bold">WIN</span>}
        {hand.status === 'lost' && <span className="text-xs text-red-400 font-bold">LOST</span>}
        {hand.status === 'push' && <span className="text-xs text-gray-400 font-bold">PUSH</span>}
        {hand.status === 'blackjack' && <span className="text-xs text-amber-400 font-bold">3:2!</span>}
      </div>
    </div>
  );
}

export default function BlackjackPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [bet, setBet] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const prevStatusRef = useRef<string>('');
  const knownCardsRef = useRef<Record<string, number>>({});
  const dealerHiddenRef = useRef<Set<number>>(new Set());
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
    if (status === 'authenticated' && userRole === 'pending') router.push('/');
  }, [status, userRole]);

  // Poll lobby
  useEffect(() => {
    if (activeTableId) return;
    const fetchTables = async () => {
      try {
        const res = await fetch(apiPath('/api/blackjack/tables'));
        const data = await res.json();
        setTables(Array.isArray(data) ? data : []);
      } catch {}
    };
    fetchTables();
    const interval = setInterval(fetchTables, 3000);
    return () => clearInterval(interval);
  }, [activeTableId]);

  // Poll game state
  useEffect(() => {
    if (!activeTableId) { setGameState(null); return; }
    const fetchState = async () => {
      try {
        const res = await fetch(apiPath(`/api/blackjack/state?tableId=${activeTableId}`));
        if (!res.ok) { setActiveTableId(null); return; }
        const data = await res.json();
        setGameState(data);

        // If game just finished, delay session refresh so dealer card animations play out
        if (data.table.status === 'finished' && prevStatusRef.current === 'playing') {
          if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = setTimeout(() => {
            updateTimeoutRef.current = null;
            update();
          }, 2500);
        }
        // Cancel pending update and reset cards when a new round starts
        if (data.table.status !== 'finished' && data.table.status !== 'playing') {
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
            updateTimeoutRef.current = null;
          }
        }
        if (data.table.status === 'betting' && prevStatusRef.current !== 'betting') {
          knownCardsRef.current = {};
          dealerHiddenRef.current = new Set();
        }
        prevStatusRef.current = data.table.status;
      } catch {}
    };
    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => {
      clearInterval(interval);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, [activeTableId]);

  // Update known card counts AFTER render so new cards animate once
  useEffect(() => {
    if (!gameState) {
      knownCardsRef.current = {};
      dealerHiddenRef.current = new Set();
      return;
    }
    const counts: Record<string, number> = {};
    counts['dealer'] = gameState.table.dealerCards.length;
    // Track which dealer cards are currently hidden (null)
    const hidden = new Set<number>();
    gameState.table.dealerCards.forEach((c, i) => {
      if (!c) hidden.add(i);
    });
    dealerHiddenRef.current = hidden;
    for (const p of gameState.players) {
      for (let hIdx = 0; hIdx < p.hands.length; hIdx++) {
        counts[`${p.seatIndex}-${hIdx}`] = p.hands[hIdx].cards.length;
      }
    }
    knownCardsRef.current = counts;
  });

  const createTable = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiPath('/api/blackjack/tables'), { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.tableId) {
          setActiveTableId(data.tableId);
        } else {
          setError(data.error);
        }
        return;
      }
      setActiveTableId(data.tableId);
    } catch { setError('Fehler'); }
    finally { setLoading(false); }
  };

  const joinTable = async (tableId: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiPath('/api/blackjack/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error) setError(data.error);
        return;
      }
      setActiveTableId(tableId);
    } catch { setError('Fehler'); }
    finally { setLoading(false); }
  };

  const leaveTable = async () => {
    if (!activeTableId) return;
    try {
      await fetch(apiPath('/api/blackjack/leave'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: activeTableId }),
      });
    } catch {}
    setActiveTableId(null);
    setGameState(null);
    update();
  };

  const toggleReady = async () => {
    if (!activeTableId) return;
    try {
      await fetch(apiPath('/api/blackjack/ready'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: activeTableId }),
      });
    } catch {}
  };

  const placeBet = async () => {
    if (!activeTableId || bet < 1) return;
    setError('');
    try {
      const res = await fetch(apiPath('/api/blackjack/bet'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: activeTableId, amount: bet }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error);
    } catch {}
  };

  const doAction = async (action: string) => {
    if (!activeTableId) return;
    setError('');
    try {
      const res = await fetch(apiPath('/api/blackjack/action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: activeTableId, action }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error);
    } catch {}
  };

  if (status === 'loading' && !activeTableId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !activeTableId) return null;

  // ────── GAME TABLE VIEW ──────
  if (activeTableId && gameState) {
    const { table, players, myPlayer } = gameState;
    const isMyTurn = myPlayer && table.currentSeat === myPlayer.seatIndex && table.status === 'playing';
    const myPlayerData = players.find(p => p.isMe);
    const myActiveHand = myPlayerData && myPlayerData.hands[myPlayerData.currentHandIndex];
    const hasBet = myPlayerData && myPlayerData.hands.length > 0 && myPlayerData.hands[0].bet > 0;

    const statusLabels: Record<string, string> = {
      waiting: '⏳ Warte auf Spieler...',
      betting: '💰 Einsätze platzieren',
      playing: '🃏 Spiel läuft',
      finished: '🏁 Runde beendet',
    };

    return (
      <div className="h-screen overflow-hidden relative flex flex-col" style={{ height: '100dvh' }}>
        {/* Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[600px] h-[600px] rounded-full bg-green-900/10 blur-[150px] -top-60 -right-40" />
          <div className="absolute w-[400px] h-[400px] rounded-full bg-emerald-800/8 blur-[120px] bottom-0 -left-32" />
        </div>

        {/* Nav */}
        <nav className="relative z-30 border-b border-green-500/10 bg-black/20 backdrop-blur-xl">
          <div className="w-full max-w-7xl mx-auto px-4 py-2 sm:py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={leaveTable} className="text-sm px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-all">
                ← Verlassen
              </button>
              <span className="text-2xl">🃏</span>
              <h1 className="text-xl font-bold text-white">Blackjack</h1>
            </div>
          <div className="flex items-center gap-2 sm:gap-3">
              <NotificationsBell />
              <span className="inline-block px-2 sm:px-3 py-1 rounded-full bg-green-900/30 border border-green-500/20 text-green-300 text-xs font-medium truncate max-w-[130px] sm:max-w-none">
                {statusLabels[table.status] || table.status}
              </span>
              <div className="text-sm flex items-center gap-1">
                <span className="hidden sm:inline text-gray-500">Guthaben: </span>
                <span className="token-display text-base sm:text-lg">{gameState.myBalance}</span>
                <span className="text-gray-600 text-xs">🪙</span>
              </div>
              <button
                onClick={() => setMenuOpen(m => !m)}
                className="w-8 h-8 flex flex-col items-center justify-center gap-[5px] text-gray-400 hover:text-white transition-colors flex-shrink-0"
                aria-label="Menü"
              >
                <span className={`block w-5 h-0.5 bg-current transition-all duration-300 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
                <span className={`block w-5 h-0.5 bg-current transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
                <span className={`block w-5 h-0.5 bg-current transition-all duration-300 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
              </button>
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
                    { href: '/jackpot', icon: '🎰', label: 'Jackpot', current: false },
                    { href: '/blackjack', icon: '🃏', label: 'Blackjack', current: true },
                  ].map(item => (
                    <button
                      key={item.href}
                      onClick={() => { setMenuOpen(false); if (!item.current) router.push(item.href); }}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-xs ${
                        item.current
                          ? 'bg-green-500/20 border border-green-500/30 text-green-300 cursor-default'
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

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 py-3 flex-1 flex flex-col min-h-0">
          {error && (
            <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          {/* Main grid: table + controls side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:flex-1 lg:min-h-0" style={{ gridTemplateRows: '1fr' }}>
            {/* Blackjack Table — left/center */}
            <div className="lg:col-span-3 min-w-0 lg:min-h-0 flex flex-col overflow-hidden">
              <div className="bj-table rounded-2xl p-3 sm:p-6 flex flex-col lg:flex-1 lg:min-h-0" style={{ minHeight: '300px' }}>
                {/* Dealer */}
                <div className="text-center mb-4" style={{ minHeight: '100px' }}>
                  <p className="text-green-200/60 text-xs uppercase tracking-widest mb-2">Dealer</p>
                  <div className="flex justify-center mb-1" style={{ minHeight: '72px' }}>
                    {table.dealerCards.length > 0 ? (
                      (() => {
                        const dealerKnown = knownCardsRef.current['dealer'] || 0;
                        const prevHidden = dealerHiddenRef.current;
                        const count = table.dealerCards.length;
                        const useOverlap = count > 3;
                        const overlapPx = count > 5 ? -30 : -20;
                        return table.dealerCards.map((c, i) => {
                          const isNew = i >= dealerKnown;
                          const wasHidden = !isNew && prevHidden.has(i) && c !== null;
                          const delay = isNew ? (i - dealerKnown) * 400 : wasHidden ? 0 : 0;
                          return (
                            <div
                              key={i}
                              style={useOverlap && i > 0 ? { marginLeft: `${overlapPx}px` } : undefined}
                              className={!useOverlap && i > 0 ? 'ml-2' : ''}
                            >
                              <Card card={c} faceDown={!c} delay={delay} animate={isNew} wasHidden={wasHidden} />
                            </div>
                          );
                        });
                      })()
                    ) : (
                      <div className="text-green-200/30 text-sm flex items-center justify-center" style={{ height: '72px' }}>Karten werden ausgeteilt...</div>
                    )}
                  </div>
                  <div style={{ minHeight: '24px' }} className="flex items-center justify-center">
                    {table.status === 'finished' && table.dealerValue !== null && (
                      <span className="inline-block px-3 py-0.5 rounded-full bg-white/10 text-white text-sm font-bold">
                        {table.dealerValue}
                      </span>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-green-400/20 to-transparent mb-4" />

                {/* Player Seats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 lg:flex-1 lg:min-h-0">
                  {[0, 1, 2, 3].map(seatIdx => {
                    const player = players.find(p => p.seatIndex === seatIdx);
                    const isCurrentTurn = table.status === 'playing' && table.currentSeat === seatIdx;

                    return (
                      <div
                        key={seatIdx}
                        className={`bj-seat rounded-xl p-3 text-center transition-all duration-300 ${
                          isCurrentTurn ? 'bj-seat-active ring-2 ring-amber-400/50' :
                          player ? 'bg-black/30 border border-green-500/10' :
                          'bg-black/10 border border-dashed border-green-500/10'
                        }`}
                      >
                        {player ? (
                          <>
                            <p className={`text-xs font-medium mb-1 ${player.isMe ? 'text-purple-300' : 'text-gray-300'}`}>
                              {player.username}
                              {player.isMe && <span className="text-xs text-purple-500 ml-1">(Du)</span>}
                            </p>
                            {isCurrentTurn ? (
                              <div className="text-xs text-amber-400 animate-pulse mb-1">← Am Zug</div>
                            ) : (
                              <div className="text-xs mb-1 invisible">p</div>
                            )}
                            {player.hands.length > 0 ? (
                              <div className="space-y-2 w-full">
                                {player.hands.map((hand, hIdx) => (
                                  <HandDisplay
                                    key={hIdx}
                                    hand={hand}
                                    isActive={isCurrentTurn && hIdx === player.currentHandIndex}
                                    knownCardCount={knownCardsRef.current[`${player.seatIndex}-${hIdx}`] || 0}
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="py-2 flex flex-col items-center justify-center flex-1">
                                {table.status === 'waiting' && (
                                  <span className={`text-xs ${player.isReady ? 'text-green-400' : 'text-gray-500'}`}>
                                    {player.isReady ? '✓ Bereit' : 'Wartet...'}
                                  </span>
                                )}
                                {table.status === 'betting' && (
                                  <span className="text-xs text-amber-400 animate-pulse">Setzt...</span>
                                )}
                                {table.status === 'finished' && (
                                  <span className={`text-xs ${player.isReady ? 'text-green-400' : 'text-gray-500'}`}>
                                    {player.isReady ? '✓ Bereit' : 'Wartet...'}
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center flex-1">
                            <p className="text-green-500/20 text-xs">Platz {seatIdx + 1}</p>
                            <p className="text-green-500/15 text-xs">Frei</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Side panel — controls */}
            <div className="min-w-0 space-y-3 lg:min-h-0 lg:flex lg:flex-col overflow-hidden">
              <div className="game-card p-4 lg:flex-1 lg:flex lg:flex-col justify-center" style={{ transform: 'none' }}>
                {/* Waiting: Ready button */}
                {table.status === 'waiting' && myPlayer && (
                  <div className="text-center">
                    <p className="text-gray-400 text-xs mb-3">
                      Drücke Bereit wenn du spielen möchtest.
                    </p>
                    <button
                      onClick={toggleReady}
                      className={`w-full px-6 py-3 rounded-xl font-bold text-lg transition-all ${
                        myPlayer.isReady
                          ? 'bg-green-500/20 border-2 border-green-500/40 text-green-400 hover:bg-green-500/30'
                          : 'bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                      }`}
                    >
                      {myPlayer.isReady ? '✓ Bereit!' : 'Bereit?'}
                    </button>
                  </div>
                )}

                {/* Betting */}
                {table.status === 'betting' && myPlayer && !hasBet && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Einsatz</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setBet(1)} className="bj-chip text-xs flex-1">Min</button>
                      <button onClick={() => setBet(Math.max(1, Math.floor(gameState.myBalance * 0.25)))} className="bj-chip text-xs flex-1">25%</button>
                      <button onClick={() => setBet(Math.max(1, Math.floor(gameState.myBalance * 0.5)))} className="bj-chip text-xs flex-1">50%</button>
                      <button onClick={() => setBet(gameState.myBalance)} className="bj-chip text-xs flex-1">Max</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={bet}
                        onChange={e => setBet(Math.max(1, Math.min(gameState.myBalance, parseInt(e.target.value) || 1)))}
                        className="game-input flex-1 text-center text-lg"
                        min={1}
                        max={gameState.myBalance}
                      />
                    </div>
                    <button onClick={placeBet} className="btn-gold text-lg w-full py-3">
                      🪙 Setzen ({bet})
                    </button>
                  </div>
                )}

                {/* Waiting for others to bet */}
                {table.status === 'betting' && hasBet && (
                  <div className="text-center py-4">
                    <p className="text-amber-400 animate-pulse">Warte auf andere Spieler...</p>
                  </div>
                )}

                {/* Playing: Action buttons */}
                {table.status === 'playing' && isMyTurn && myActiveHand && (
                  <div className="text-center">
                    <p className="text-green-300 text-sm mb-3 font-medium">Du bist dran!</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => doAction('hit')} className="bj-btn-hit py-3">
                        🃏 Hit
                      </button>
                      <button onClick={() => doAction('stand')} className="bj-btn-stand py-3">
                        ✋ Stand
                      </button>
                      {myActiveHand.canDouble && (
                        <button
                          onClick={() => doAction('double')}
                          className="bj-btn-double py-3"
                          disabled={gameState.myBalance < myActiveHand.bet}
                        >
                          ×2 Double
                        </button>
                      )}
                      {myActiveHand.canSplit && (
                        <button
                          onClick={() => doAction('split')}
                          className="bj-btn-split py-3"
                          disabled={gameState.myBalance < myActiveHand.bet}
                        >
                          ✂️ Split
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Playing but not my turn */}
                {table.status === 'playing' && !isMyTurn && myPlayer && (
                  <div className="text-center py-4">
                    <p className="text-gray-500">Warte auf andere Spieler...</p>
                  </div>
                )}

                {/* Finished */}
                {table.status === 'finished' && myPlayer && (
                  <div className="text-center">
                    {/* Results summary */}
                    {myPlayerData && myPlayerData.hands.length > 0 && (
                      <div className="mb-3">
                        {(() => {
                          let totalResult = 0;
                          for (const h of myPlayerData.hands) {
                            if (h.status === 'won') totalResult += h.bet * 2;
                            else if (h.status === 'blackjack') totalResult += h.bet + Math.floor(h.bet * 1.5);
                            else if (h.status === 'lost') totalResult -= h.bet;
                          }
                          if (totalResult > 0) {
                            return <p className="text-xl font-bold text-green-400 mb-2 animate-result-pop">+{totalResult} Tokens! 🎉</p>;
                          } else if (totalResult < 0) {
                            return <p className="text-xl font-bold text-red-400 mb-2 animate-result-pop">{totalResult} Tokens 💀</p>;
                          } else {
                            return <p className="text-xl font-bold text-gray-400 mb-2 animate-result-pop">Unentschieden</p>;
                          }
                        })()}
                      </div>
                    )}
                    <button
                      onClick={toggleReady}
                      className={`w-full px-6 py-3 rounded-xl font-bold text-lg transition-all ${
                        myPlayer.isReady
                          ? 'bg-green-500/20 border-2 border-green-500/40 text-green-400'
                          : 'bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                      }`}
                    >
                      {myPlayer.isReady ? '✓ Bereit' : 'Nächste Runde?'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ────── LOBBY VIEW ──────
  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full bg-green-900/10 blur-[150px] -top-60 -right-40" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-emerald-800/8 blur-[120px] bottom-0 -left-32" />
      </div>

      {/* Nav */}
      <nav className="relative z-30 border-b border-green-500/10 bg-black/20 backdrop-blur-xl">
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
            <span className="text-sm text-gray-400 hidden sm:inline">{session?.user?.name}</span>
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
                  { href: '/coinflip', icon: '🪙', label: 'Coinflip', current: false },
                  { href: '/jackpot', icon: '🎰', label: 'Jackpot', current: false },
                  { href: '/blackjack', icon: '🃏', label: 'Blackjack', current: true },
                ].map(item => (
                  <button
                    key={item.href}
                    onClick={() => { setMenuOpen(false); if (!item.current) router.push(item.href); }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all text-xs ${
                      item.current
                        ? 'bg-green-500/20 border border-green-500/30 text-green-300 cursor-default'
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

      {/* Main content area — fits viewport */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: header + create */}
          <div className="lg:col-span-2 flex flex-col">
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
              <span className="text-3xl">🃏</span>
              <div>
                <h1 className="text-2xl font-bold text-white">Blackjack</h1>
                <p className="text-gray-500 text-sm">Spiele mit bis zu 4 Spielern an einem Tisch!</p>
              </div>
            </div>

            {error && (
              <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center">
                {error}
              </div>
            )}

            {/* Create table */}
            <div className="mb-4">
              <button
                onClick={createTable}
                disabled={loading}
                className="btn-primary text-lg px-8 py-3 inline-flex items-center gap-2"
              >
                <span>➕</span> Neuen Tisch erstellen
              </button>
            </div>

            {/* Table list */}
            <div className="game-card p-4 flex-1 min-h-0 flex flex-col">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>🎰</span> Offene Tische
              </h3>
              <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                {tables.filter(t => t.status === 'waiting').map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-green-500/10 hover:bg-white/[0.06] transition-all">
                    <div>
                      <p className="text-white font-medium text-sm">Tisch #{t.id.slice(0, 6)}</p>
                      <p className="text-xs text-gray-500">{t.playerCount}/4 Spieler</p>
                    </div>
                    <button
                      onClick={() => joinTable(t.id)}
                      disabled={loading || t.playerCount >= 4}
                      className="btn-primary text-sm"
                    >
                      Beitreten
                    </button>
                  </div>
                ))}
                {tables.filter(t => t.status !== 'waiting').map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-gray-500/10">
                    <div>
                      <p className="text-gray-400 font-medium text-sm">Tisch #{t.id.slice(0, 6)}</p>
                      <p className="text-xs text-gray-600">{t.playerCount}/4 • {t.status === 'playing' || t.status === 'betting' ? 'Läuft' : 'Beendet'}</p>
                    </div>
                    <span className="text-xs text-gray-600 px-2 py-1 rounded-full bg-gray-500/10">
                      {t.status === 'playing' || t.status === 'betting' ? '🔴 Läuft' : '⏹ Beendet'}
                    </span>
                  </div>
                ))}
                {tables.length === 0 && (
                  <p className="text-gray-600 text-center py-8 text-sm">Keine Tische vorhanden. Erstelle einen!</p>
                )}
              </div>
            </div>
          </div>

          {/* Right: rules sidebar */}
          <div className="flex flex-col">
            <div className="game-card p-4 flex-1">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>📋</span> Regeln
              </h3>
              <div className="text-xs text-gray-400 space-y-2">
                <div className="space-y-1">
                  <p>• Ziel: Näher an 21 als der Dealer</p>
                  <p>• Ass = 1 oder 11</p>
                  <p>• Bildkarten (J/Q/K) = 10</p>
                  <p>• Blackjack (21 mit 2 Karten) zahlt 3:2</p>
                </div>
                <div className="h-px bg-white/5 my-2" />
                <div className="space-y-1">
                  <p>🃏 <span className="text-green-300">Hit</span> = Karte ziehen</p>
                  <p>✋ <span className="text-blue-300">Stand</span> = Keine Karte</p>
                  <p>×2 <span className="text-amber-300">Double</span> = Verdoppeln + 1 Karte</p>
                  <p>✂️ <span className="text-purple-300">Split</span> = Paar teilen</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
