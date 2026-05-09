'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiPath } from '@/lib/clientPaths';
import NotificationsBell from '@/components/NotificationsBell';

type Status = {
  balance: number;
  starterPack: { claimable: boolean; amount: number };
  daily: { eligible: boolean; amount: number; nextClaimAt: number; remainingMs: number };
  vote: { eligible: boolean; amount: number; nextClaimAt: number; remainingMs: number; url: string };
};

function fmtMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function EarnPage() {
  const { data: session, status: authStatus, update } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  const [menuOpen, setMenuOpen] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [fx, setFx] = useState<'starter' | 'daily' | 'vote' | null>(null);

  useEffect(() => {
    if (authStatus !== 'loading') setInitialLoad(false);
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      setTimeout(() => router.push('/'), 0);
    }
    if (authStatus === 'authenticated' && userRole === 'pending') {
      setTimeout(() => router.push('/'), 0);
    }
  }, [authStatus, userRole]);

  const refresh = async () => {
    const r = await fetch(apiPath('/api/rewards/status'));
    if (!r.ok) return;
    const data = await r.json();
    setS(data);
  };

  useEffect(() => {
    if (session) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const balance = useMemo(() => (session?.user as any)?.balance ?? s?.balance ?? 0, [session, s]);

  const burst = (k: 'starter' | 'daily' | 'vote') => {
    setFx(k);
    setTimeout(() => setFx(null), 900);
  };

  const claim = async (which: 'starter' | 'daily' | 'vote') => {
    setMsg(null);
    const url =
      which === 'starter' ? '/api/tokens/starter-pack' :
      which === 'daily' ? '/api/tokens/daily' :
      '/api/tokens/vote';

    const r = await fetch(apiPath(url), { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (data?.voteUrl) {
        setMsg('Vote zuerst auf top.gg und dann Claim.');
      } else if (data?.remainingMs) {
        setMsg(`Cooldown: ${fmtMs(data.remainingMs)}`);
      } else {
        setMsg(data?.error || 'Aktion fehlgeschlagen.');
      }
      return;
    }
    setMsg(`+${data.amount} Tokens`);
    burst(which);
    await update();
    await refresh();
  };

  if (authStatus === 'loading' && initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!session && initialLoad) return null;

  return (
    <div className="h-screen overflow-hidden relative flex flex-col" style={{ height: '100dvh' }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[650px] h-[650px] rounded-full bg-amber-500/7 blur-[160px] -top-72 -left-44" />
        <div className="absolute w-[520px] h-[520px] rounded-full bg-purple-600/7 blur-[160px] -bottom-72 -right-44" />
      </div>

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
          </div>
        </div>
      </nav>

      {menuOpen && <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />}
      <div className={`flex-shrink-0 relative z-20 grid transition-[grid-template-rows] duration-300 ease-in-out ${menuOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="bg-black/95 backdrop-blur-xl border-b border-white/5 px-4 py-3">
            <div className="max-w-6xl mx-auto">
              <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">Navigation</p>
              <div className="grid grid-cols-6 gap-2">
                {[
                  { href: '/dashboard', icon: '🏠', label: 'Dashboard', current: false },
                  { href: '/earn', icon: '➕', label: '+ Tokens', current: true },
                  { href: '/crash', icon: '📈', label: 'Crash', current: false },
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

      <div className="relative z-10 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 min-h-0 overflow-auto">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">+ Tokens</p>
            <h1 className="text-2xl font-black text-white">Verdienen</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 uppercase tracking-widest">Guthaben</p>
            <p className="text-xl font-black text-amber-300">{balance} Tokens</p>
          </div>
        </div>

        {msg && (
          <div className="mb-4 text-sm text-gray-200 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            {msg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Starter Pack */}
          <div className="game-card p-5 sm:p-6 relative overflow-hidden">
            {fx === 'starter' && <div className="absolute inset-0 reward-burst pointer-events-none" />}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-base">🎁</div>
              <div className="min-w-0">
                <p className="text-white font-bold">Starter Pack</p>
                <p className="text-xs text-gray-500">Einmalig</p>
              </div>
            </div>
            <p className="text-sm text-gray-300">
              {s?.starterPack?.claimable ? 'Dein Starter Pack ist bereit.' : 'Bereits geclaimt oder nicht verfugbar.'}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-amber-300 font-black">+{s?.starterPack?.amount ?? 0}</span>
              {s?.starterPack?.claimable ? (
                <button onClick={() => claim('starter')} className="btn-gold px-4 py-2 rounded-xl font-bold">
                  Claim
                </button>
              ) : (
                <span className="text-xs text-gray-600">Claimed</span>
              )}
            </div>
          </div>

          {/* Daily */}
          <div className="game-card p-5 sm:p-6 relative overflow-hidden">
            {fx === 'daily' && <div className="absolute inset-0 reward-burst pointer-events-none" />}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-base">🌅</div>
              <div className="min-w-0">
                <p className="text-white font-bold">Daily Reward</p>
                <p className="text-xs text-gray-500">Alle 24h</p>
              </div>
            </div>
            <p className="text-sm text-gray-300">Hol dir jeden Tag gratis Tokens ab.</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-amber-300 font-black">+{s?.daily?.amount ?? 0}</span>
              {s?.daily?.eligible ? (
                <button onClick={() => claim('daily')} className="btn-gold px-4 py-2 rounded-xl font-bold">
                  Claim
                </button>
              ) : (
                <span className="text-xs text-gray-600">Come back in {fmtMs(s?.daily?.remainingMs ?? 0)}</span>
              )}
            </div>
          </div>

          {/* Vote */}
          <div className="game-card p-5 sm:p-6 relative overflow-hidden">
            {fx === 'vote' && <div className="absolute inset-0 reward-burst pointer-events-none" />}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-base">🗳️</div>
              <div className="min-w-0">
                <p className="text-white font-bold">Vote to Earn</p>
                <p className="text-xs text-gray-500">Alle 12h</p>
              </div>
            </div>
            <p className="text-sm text-gray-300">Vote auf top.gg fur den Fahrstuhl Bot und claim Tokens.</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href={s?.vote?.url || '#'}
                target="_blank"
                rel="noreferrer"
                className={`btn-chip text-center ${s?.vote?.url ? '' : 'opacity-40 pointer-events-none'}`}
              >
                Vote
              </a>
              <button
                onClick={() => claim('vote')}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!s?.vote?.eligible}
                title={!s?.vote?.eligible ? `Cooldown: ${fmtMs(s?.vote?.remainingMs ?? 0)}` : 'Claim vote reward'}
              >
                Claim
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
              <span>Reward</span>
              <span className="text-amber-300 font-bold">+{s?.vote?.amount ?? 0}</span>
            </div>
            {!s?.vote?.eligible && (
              <p className="text-[11px] text-gray-600 mt-2">Du kannst wieder voten in {fmtMs(s?.vote?.remainingMs ?? 0)}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

