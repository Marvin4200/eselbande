'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { apiPath } from '@/lib/clientPaths';
import NotificationsBell from '@/components/NotificationsBell';

// Leveling functions (mirrored from server lib for client use)
function xpForLevel(level: number): number {
  if (level < 1) return 0;
  if (level < 20) return Math.floor(100 * Math.pow(1.12, level));
  const softcapBase = Math.floor(100 * Math.pow(1.12, 20));
  if (level < 50) return Math.floor(softcapBase * Math.pow(1.20, level - 19));
  const hardcapBase = Math.floor(softcapBase * Math.pow(1.20, 31));
  return Math.floor(hardcapBase * Math.pow(1.35, level - 49));
}

function getLevelInfo(totalXp: number) {
  let level = 1;
  let remaining = totalXp;
  while (true) {
    const needed = xpForLevel(level);
    if (remaining < needed) {
      return { level, currentXp: remaining, xpNeeded: needed, totalXp, progress: needed > 0 ? remaining / needed : 0 };
    }
    remaining -= needed;
    level++;
  }
}

function getLevelTitle(level: number): string {
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

function getLevelColor(level: number): string {
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

interface User {
  id: number;
  username: string;
  balance: number;
  xp: number;
}

interface Transaction {
  id: number;
  fromUsername: string;
  toUsername?: string;
  type:
    | 'give'
    | 'redeem'
    | 'coinflip_win'
    | 'coinflip_lose'
    | 'blackjack_win'
    | 'blackjack_lose'
    | 'crash_win'
    | 'crash_lose'
    | 'jackpot_win'
    | 'jackpot_lose'
    | 'reward_starter_pack'
    | 'reward_daily'
    | 'reward_topgg_vote'
    | 'reward_voice_activity';
  amount: number;
  createdAt: string;
}

export default function Dashboard() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [giveAmount, setGiveAmount] = useState(1);
  const [showGiveEffect, setShowGiveEffect] = useState(false);
  const [showRedeemEffect, setShowRedeemEffect] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState(10);
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'level' | 'tokens'>('level');
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status !== 'loading') setInitialLoad(false);
  }, [status]);
  const userBalance = (session?.user as any)?.balance ?? 0;
  const userXp = (session?.user as any)?.xp ?? 0;
  const userId = (session?.user as any)?.id;
  const userName = session?.user?.name ?? '';
  const levelInfo = useMemo(() => getLevelInfo(userXp), [userXp]);

  // Live XP preview for redeem
  const previewXp = userXp + redeemAmount * 10;
  const previewLevel = useMemo(() => getLevelInfo(previewXp), [previewXp]);
  const levelsGained = previewLevel.level - levelInfo.level;

  useEffect(() => {
    if (status === 'unauthenticated') {
      setTimeout(() => { router.push('/'); }, 0);
    }
    if (status === 'authenticated' && userRole === 'pending') {
      setTimeout(() => { router.push('/'); }, 0);
    }
  }, [status, userRole]);

  useEffect(() => {
    if (session) {
      fetchUsers();
      fetchTransactions();
    }
  }, [session]);

  const fetchUsers = async () => {
    const res = await fetch(apiPath('/api/users'));
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  const fetchTransactions = async () => {
    const res = await fetch(apiPath('/api/transactions'));
    const data = await res.json();
    setTransactions(Array.isArray(data) ? data : []);
  };

  const giveToken = async () => {
    if (!selectedUser || giveAmount < 1) return;
    setShowGiveEffect(true);
    await fetch(apiPath('/api/tokens/give'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: selectedUser, amount: giveAmount }),
    });
    fetchUsers();
    fetchTransactions();
    update();
    setTimeout(() => setShowGiveEffect(false), 800);
  };

  const redeemToken = async () => {
    if (redeemAmount < 1 || redeemAmount > userBalance) return;
    setShowRedeemEffect(true);
    const res = await fetch(apiPath('/api/tokens/redeem'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: redeemAmount }),
    });
    const data = await res.json();
    fetchUsers();
    fetchTransactions();
    update();
    if (data.leveledUp) {
      setLevelUpMsg(`🎉 Level Up! Level ${data.newLevel}`);
      setTimeout(() => setLevelUpMsg(null), 3000);
    }
    setTimeout(() => setShowRedeemEffect(false), 800);
  };

  if (status === 'loading' && initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && initialLoad) return null;

  const sortedByTokens = [...users].sort((a, b) => b.balance - a.balance);
  const sortedByLevel = [...users].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
  const leaderboardUsers = leaderboardTab === 'level' ? sortedByLevel : sortedByTokens;
  const givePresets = [1, 5, 10, 25];

  return (
    <div className="min-h-screen relative">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full bg-purple-600/8 blur-[150px] -top-60 -right-40" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-amber-500/6 blur-[120px] bottom-0 -left-32" />
      </div>

      {/* Top Navigation Bar */}
      <nav className="relative z-30 border-b border-purple-500/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/dashboard')}>
            <span className="text-2xl">🫏</span>
            <h1 className="text-xl font-bold">
              <span className="glow-text">Esel</span><span className="text-amber-400">Tokens</span>
            </h1>
          </div>

          {/* Right: user dropdown (desktop) + hamburger */}
          <div className="flex items-center gap-3">
            <NotificationsBell />
            {/* Desktop user dropdown */}
            <div className="hidden md:block relative group">
              <div className="flex items-center gap-2 cursor-pointer text-sm px-3 py-2 rounded-lg hover:bg-white/5 transition-all">
                <span className="text-purple-300 font-medium">{userName}</span>
                <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="absolute right-0 top-full h-2 w-44 hidden group-hover:block" />
                <div className="absolute right-0 top-full mt-2 w-44 py-1.5 rounded-xl bg-[#1a1a2e] backdrop-blur-xl border border-purple-500/15 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                {userRole === 'admin' && (
                  <button onClick={() => router.push('/admin')} className="w-full text-left text-sm px-4 py-2 text-purple-300 hover:bg-purple-500/15 transition-colors flex items-center gap-2">
                    ⚙️ Admin Panel
                  </button>
                )}
                {(userRole === 'moderator' || userRole === 'admin') && (
                  <button onClick={() => router.push('/moderator')} className="w-full text-left text-sm px-4 py-2 text-blue-300 hover:bg-blue-500/15 transition-colors flex items-center gap-2">
                    🛡️ Moderator
                  </button>
                )}
                {(userRole === 'admin' || userRole === 'moderator') && <div className="my-1 h-px bg-white/5" />}
                <button onClick={() => signOut()} className="w-full text-left text-sm px-4 py-2 text-red-400 hover:bg-red-500/15 transition-colors flex items-center gap-2">
                  🚪 Logout
                </button>
              </div>
            </div>

            {/* Hamburger — all screen sizes */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
              aria-label="Menü öffnen"
            >
              <span className={`block w-5 h-0.5 bg-current transition-all duration-300 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
              <span className={`block w-5 h-0.5 bg-current transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-current transition-all duration-300 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Backdrop */}
        {menuOpen && <div className="fixed inset-0 z-[-1]" onClick={() => setMenuOpen(false)} />}

        {/* Slide-down panel */}
        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${menuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className={`overflow-hidden transition-opacity duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0'}`}>
            <div className="border-t border-white/5 bg-black/60 backdrop-blur-xl">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
                <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">Spiele</p>
                <div className="grid grid-cols-6 gap-2 mb-4">
                  {[
                    { href: '/dashboard', icon: '🏠', label: 'Dashboard', current: true },
                    { href: '/earn', icon: '➕', label: '+ Tokens', current: false },
                    { href: '/crash', icon: '📈', label: 'Crash', current: false },
                    { href: '/coinflip', icon: '🪙', label: 'Coinflip', current: false },
                    { href: '/jackpot', icon: '🎰', label: 'Jackpot', current: false },
                    { href: '/blackjack', icon: '🃏', label: 'Blackjack', current: false },
                  ].map(item => (
                    <button
                      key={item.href}
                      onClick={() => { setMenuOpen(false); if (!item.current) router.push(item.href); }}
                      className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-lg transition-all text-xs ${
                        item.current
                          ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300 cursor-default'
                          : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="text-lg sm:text-xl">{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
                {/* Mobile-only account section */}
                <div className="md:hidden border-t border-white/5 pt-3 space-y-1">
                  <p className="text-xs text-gray-600 px-1 pb-1">{userName}</p>
                  {userRole === 'admin' && (
                    <button onClick={() => { router.push('/admin'); setMenuOpen(false); }} className="w-full text-left text-sm px-3 py-2.5 rounded-lg text-purple-300 hover:bg-purple-500/15 transition-colors flex items-center gap-2">
                      ⚙️ Admin Panel
                    </button>
                  )}
                  {(userRole === 'moderator' || userRole === 'admin') && (
                    <button onClick={() => { router.push('/moderator'); setMenuOpen(false); }} className="w-full text-left text-sm px-3 py-2.5 rounded-lg text-blue-300 hover:bg-blue-500/15 transition-colors flex items-center gap-2">
                      🛡️ Moderator
                    </button>
                  )}
                  <button onClick={() => signOut()} className="w-full text-left text-sm px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/15 transition-colors flex items-center gap-2">
                    🚪 Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
      {/* Level Up Notification */}
      {levelUpMsg && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-result-pop pointer-events-none">
          <div className="px-8 py-5 rounded-2xl bg-gradient-to-r from-amber-500/25 to-purple-500/25 border border-amber-500/40 backdrop-blur-xl shadow-2xl shadow-amber-500/20">
            <p className="text-2xl font-black text-amber-300 text-center">{levelUpMsg}</p>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6">

        {/* ── HERO: Level + Tokens ── */}
        <div className="game-card p-5 sm:p-8 animate-fade-in-up relative overflow-hidden">
          <div className={`absolute -top-16 -right-16 w-48 h-48 bg-gradient-to-br ${getLevelColor(levelInfo.level)} opacity-[0.07] rounded-full blur-[60px]`} />
          <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/4 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2" />
          <div className="relative flex flex-col md:flex-row gap-6 md:gap-0 md:items-center md:justify-between">

            {/* Left: Level */}
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br ${getLevelColor(levelInfo.level)} flex items-center justify-center shadow-lg`}>
                  <span className="text-3xl sm:text-4xl font-black text-black/80">{levelInfo.level}</span>
                </div>
                {levelInfo.level >= 20 && (
                  <div className="absolute -top-1.5 -right-1.5 text-xs px-1.5 py-0.5 rounded-full bg-black/60 border border-white/10 text-white/60 font-medium">
                    {levelInfo.level >= 50 ? '🔥' : '⚡'}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">Dein Level</p>
                <p className="text-xl sm:text-2xl font-bold text-white leading-tight">{getLevelTitle(levelInfo.level)}</p>
                <p className="text-xs text-gray-500 mt-1">{userXp.toLocaleString('de-DE')} XP gesamt</p>
                <div className="mt-2.5 w-40 sm:w-56">
                  <div className="xp-bar-bg">
                    <div
                      className={`xp-bar-fill bg-gradient-to-r ${getLevelColor(levelInfo.level)}`}
                      style={{ width: `${Math.min(100, levelInfo.progress * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {levelInfo.currentXp.toLocaleString('de-DE')} / {levelInfo.xpNeeded.toLocaleString('de-DE')} XP
                  </p>
                </div>
              </div>
            </div>

            <div className="hidden md:block w-px h-20 bg-white/5 mx-8" />
            <div className="md:hidden h-px bg-white/5" />

            {/* Right: Tokens */}
            <div className="text-center md:text-right">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Dein Guthaben</p>
              <div className="flex items-baseline gap-2 justify-center md:justify-end">
                <span className="token-display" style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}>{userBalance}</span>
                <span className="text-gray-500 text-base sm:text-lg">Tokens</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {Math.ceil((levelInfo.xpNeeded - levelInfo.currentXp) / 10)} Tokens bis Level {levelInfo.level + 1}
              </p>
            </div>
          </div>
        </div>

        {/* ── TOKEN ACTIONS: Gift + Redeem ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

          {/* Gift card */}
          <div className="game-card p-5 sm:p-6 animate-fade-in-up stagger-2 relative overflow-hidden">
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-purple-500/5 rounded-full blur-[40px]" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-base">🎁</div>
                <h2 className="text-lg font-bold text-white">Token verschenken</h2>
              </div>

              <div className="mb-4">
                <label className="text-xs text-gray-500 uppercase tracking-widest mb-1.5 block">Empfänger</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="game-select w-full"
                >
                  <option value="">User auswählen…</option>
                  {users.filter(u => u.id !== userId).map(user => (
                    <option key={user.id} value={user.id}>{user.username}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="text-xs text-gray-500 uppercase tracking-widest mb-1.5 block">Anzahl</label>
                <div className="flex gap-2 mb-2">
                  {givePresets.map(p => (
                    <button
                      key={p}
                      onClick={() => setGiveAmount(p)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${
                        giveAmount === p
                          ? 'bg-purple-500/25 border-purple-500/50 text-purple-300'
                          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={giveAmount}
                  onChange={e => setGiveAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="game-input w-full text-center"
                  min={1}
                  placeholder="Eigener Betrag"
                />
              </div>

              <button
                onClick={giveToken}
                disabled={!selectedUser || userBalance < giveAmount}
                className={`w-full btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed ${showGiveEffect ? 'animate-scale-in' : ''}`}
              >
                🎁 {giveAmount} Token{giveAmount !== 1 ? 's' : ''} verschenken
              </button>
              {!selectedUser && <p className="text-xs text-gray-600 text-center mt-2">Wähle zuerst einen Empfänger</p>}
              {selectedUser && userBalance < giveAmount && <p className="text-xs text-red-500/70 text-center mt-2">Nicht genug Tokens</p>}
            </div>
          </div>

          {/* Redeem card */}
          <div className="game-card p-5 sm:p-6 animate-fade-in-up stagger-3 relative overflow-hidden">
            <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-amber-500/5 rounded-full blur-[40px]" />
            <div className="relative">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-base">✨</div>
                  <h2 className="text-lg font-bold text-white">XP einlösen</h2>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium">
                  1 Token = 10 XP
                </span>
              </div>

              <div className="mb-4">
                <label className="text-xs text-gray-500 uppercase tracking-widest mb-1.5 block">Anzahl Tokens</label>
                <div className="flex gap-2 mb-2">
                  {[10, 50, 100].map(p => (
                    <button
                      key={p}
                      onClick={() => setRedeemAmount(Math.min(p, userBalance))}
                      disabled={userBalance < p}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                        redeemAmount === p
                          ? 'bg-amber-500/25 border-amber-500/50 text-amber-300'
                          : 'bg-white/[0.03] border-white/10 text-gray-400 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setRedeemAmount(userBalance)}
                    disabled={userBalance < 1}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                      redeemAmount === userBalance && userBalance > 0
                        ? 'bg-amber-500/25 border-amber-500/50 text-amber-300'
                        : 'bg-white/[0.03] border-white/10 text-gray-400 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    MAX
                  </button>
                </div>
                <input
                  type="number"
                  value={redeemAmount}
                  onChange={e => setRedeemAmount(Math.max(1, Math.min(userBalance, parseInt(e.target.value) || 1)))}
                  className="game-input w-full text-center"
                  min={1}
                  max={userBalance}
                />
              </div>

              {/* Live XP Preview */}
              <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Vorschau nach Einlösen</span>
                  {levelsGained > 0 && (
                    <span className="text-amber-400 font-bold">+{levelsGained} Level{levelsGained > 1 ? 's' : ''}! 🎉</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${getLevelColor(levelInfo.level)} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-[10px] font-black text-black/80">{levelInfo.level}</span>
                  </div>
                  <div className="flex-1 relative">
                    <div className="xp-bar-bg">
                      <div
                        className={`xp-bar-fill bg-gradient-to-r ${getLevelColor(levelInfo.level)} opacity-30`}
                        style={{ width: `${Math.min(100, levelInfo.progress * 100)}%` }}
                      />
                      <div
                        className={`absolute inset-0 xp-bar-fill bg-gradient-to-r ${getLevelColor(previewLevel.level)}`}
                        style={{ width: `${Math.min(100, previewLevel.progress * 100)}%`, top: 0 }}
                      />
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${getLevelColor(previewLevel.level)} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-[10px] font-black text-black/80">{previewLevel.level}</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>{userXp.toLocaleString('de-DE')} XP</span>
                  <span className="text-amber-400/80">+{(redeemAmount * 10).toLocaleString('de-DE')} XP</span>
                  <span>{previewXp.toLocaleString('de-DE')} XP</span>
                </div>
              </div>

              <button
                onClick={redeemToken}
                disabled={userBalance < 1 || redeemAmount < 1}
                className={`w-full btn-gold inline-flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed ${showRedeemEffect ? 'animate-scale-in' : ''}`}
              >
                ✨ {redeemAmount} Token{redeemAmount !== 1 ? 's' : ''} einlösen (+{(redeemAmount * 10).toLocaleString('de-DE')} XP)
              </button>
            </div>
          </div>
        </div>

        {/* ── LEADERBOARD + TRANSACTIONS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {/* Leaderboard */}
          <div className="game-card p-4 sm:p-6 animate-fade-in-up stagger-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <h2 className="text-xl font-bold text-white">Leaderboard</h2>
              </div>
              {/* Tab pills */}
              <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <button
                  onClick={() => setLeaderboardTab('level')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    leaderboardTab === 'level'
                      ? 'bg-purple-500/25 text-purple-300 border border-purple-500/30'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  🏅 Level
                </button>
                <button
                  onClick={() => setLeaderboardTab('tokens')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    leaderboardTab === 'tokens'
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/30'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  🪙 Tokens
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {leaderboardUsers.map((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const isCurrentUser = user.id === userId;
                const userLevelInfo = getLevelInfo(user.xp ?? 0);
                return (
                  <div
                    key={user.id}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                      isCurrentUser
                        ? 'bg-purple-500/10 border border-purple-500/20'
                        : 'bg-white/[0.02] hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="text-base w-7 text-center flex-shrink-0">
                      {index < 3 ? medals[index] : <span className="text-gray-600 text-xs font-mono">#{index + 1}</span>}
                    </span>
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${getLevelColor(userLevelInfo.level)} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-[10px] font-black text-black/80">{userLevelInfo.level}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm truncate ${isCurrentUser ? 'text-purple-300' : 'text-gray-300'}`}>
                        {user.username}
                        {isCurrentUser && <span className="text-xs text-purple-500 ml-1">(Du)</span>}
                      </p>
                      {leaderboardTab === 'level' && (
                        <p className="text-xs text-gray-600 truncate">{getLevelTitle(userLevelInfo.level)}</p>
                      )}
                    </div>
                    {leaderboardTab === 'level' ? (
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold text-sm ${index === 0 ? 'text-amber-400' : 'text-gray-400'}`}>Lvl {userLevelInfo.level}</p>
                        <p className="text-xs text-gray-600">{(user.xp ?? 0).toLocaleString('de-DE')} XP</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`font-bold ${index === 0 ? 'text-amber-400' : 'text-gray-400'}`}>{user.balance}</span>
                        <span className="text-xs text-gray-600">TKN</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {leaderboardUsers.length === 0 && (
                <p className="text-gray-600 text-center py-8">Noch keine Mitglieder</p>
              )}
            </div>
          </div>

          {/* Transaction History */}
          <div className="game-card p-4 sm:p-6 animate-fade-in-up stagger-3">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📜</span>
              <h2 className="text-xl font-bold text-white">Letzte Aktivitäten</h2>
            </div>
            <div className="space-y-2">
              {transactions.slice(0, 12).map((tx, index) => (
                <div
                  key={tx.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-all"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <span className="mt-0.5 text-base">
                    {tx.type === 'give' ? '🎁' : tx.type === 'redeem' ? '✨' : tx.type === 'reward_daily' || tx.type === 'reward_topgg_vote' || tx.type === 'reward_starter_pack' || tx.type === 'reward_voice_activity' ? '🎁' : tx.type === 'blackjack_win' || tx.type === 'blackjack_lose' ? '🃏' : tx.type === 'crash_win' || tx.type === 'crash_lose' ? '📈' : tx.type === 'jackpot_win' || tx.type === 'jackpot_lose' ? '🎰' : '🪙'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300">
                      {tx.type === 'give'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> → <span className="text-amber-400 font-medium">{tx.toUsername}</span></>
                        : tx.type === 'redeem'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> hat eingelöst</>
                        : tx.type === 'coinflip_win'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> gewann <span className="text-green-400 font-medium">{tx.amount}</span> 🪙</>
                        : tx.type === 'coinflip_lose'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> verlor <span className="text-red-400 font-medium">{tx.amount}</span> 🪙</>
                        : tx.type === 'reward_starter_pack'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> bekam <span className="text-green-400 font-medium">{tx.amount}</span> Starter Pack</>
                        : tx.type === 'reward_daily'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> claimte <span className="text-green-400 font-medium">{tx.amount}</span> Daily</>
                        : tx.type === 'reward_topgg_vote'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> bekam <span className="text-green-400 font-medium">{tx.amount}</span> Vote Reward</>
                        : tx.type === 'reward_voice_activity'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> bekam <span className="text-green-400 font-medium">{tx.amount}</span> Voice Reward</>
                        : tx.type === 'blackjack_win'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> gewann <span className="text-green-400 font-medium">{tx.amount}</span> bei BJ 🃏</>
                        : tx.type === 'blackjack_lose'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> verlor <span className="text-red-400 font-medium">{tx.amount}</span> bei BJ 🃏</>
                        : tx.type === 'crash_win'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> gewann <span className="text-green-400 font-medium">{tx.amount}</span> bei Crash 📈</>
                        : tx.type === 'crash_lose'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> verlor <span className="text-red-400 font-medium">{tx.amount}</span> bei Crash 📈</>
                        : tx.type === 'jackpot_win'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> gewann <span className="text-green-400 font-medium">{tx.amount}</span> Jackpot 🎰</>
                        : tx.type === 'jackpot_lose'
                        ? <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> verlor <span className="text-red-400 font-medium">{tx.amount}</span> Jackpot 🎰</>
                        : <><span className="text-purple-400 font-medium">{tx.fromUsername}</span> verlor <span className="text-red-400 font-medium">{tx.amount}</span></>
                      }
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {new Date(tx.createdAt).toLocaleString('de-DE', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    tx.type === 'give' || tx.type === 'coinflip_win' || tx.type === 'blackjack_win' || tx.type === 'crash_win' || tx.type === 'jackpot_win' || tx.type === 'reward_starter_pack' || tx.type === 'reward_daily' || tx.type === 'reward_topgg_vote' || tx.type === 'reward_voice_activity'
                      ? 'bg-green-500/10 text-green-400'
                      : tx.type === 'redeem' || tx.type === 'coinflip_lose' || tx.type === 'blackjack_lose' || tx.type === 'crash_lose' || tx.type === 'jackpot_lose'
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {tx.type === 'give' || tx.type === 'coinflip_win' || tx.type === 'blackjack_win' || tx.type === 'crash_win' || tx.type === 'jackpot_win' || tx.type === 'reward_starter_pack' || tx.type === 'reward_daily' || tx.type === 'reward_topgg_vote' || tx.type === 'reward_voice_activity' ? `+${tx.amount || 1}` : `-${tx.amount || 1}`}
                  </span>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="text-gray-600 text-center py-8">Noch keine Transaktionen</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
