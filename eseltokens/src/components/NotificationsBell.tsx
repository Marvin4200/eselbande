'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiPath } from '@/lib/clientPaths';

type RewardStatus = {
  balance: number;
  starterPack: { claimable: boolean; amount: number };
  daily: { eligible: boolean; amount: number; nextClaimAt: number; remainingMs: number };
  vote: { eligible: boolean; amount: number; nextClaimAt: number; remainingMs: number; url: string };
};

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function NotificationsBell() {
  const { data: session, status, update } = useSession();
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState(false);
  const [rewardStatus, setRewardStatus] = useState<RewardStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const userRole = (session?.user as any)?.role;
  const canUse = status === 'authenticated' && userRole !== 'pending';

  const fetchStatus = async () => {
    if (!canUse) return;
    const r = await fetch(apiPath('/api/rewards/status'));
    if (!r.ok) return;
    const data = await r.json();
    setRewardStatus(data);
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const notifCount = useMemo(() => {
    if (!rewardStatus) return 0;
    return rewardStatus.starterPack?.claimable ? 1 : 0;
  }, [rewardStatus]);

  const claimStarter = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(apiPath('/api/tokens/starter-pack'), { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(data?.error || 'Claim fehlgeschlagen.');
        return;
      }
      setMsg(`+${data.amount} Tokens`);
      setFx(true);
      setTimeout(() => setFx(false), 900);
      await update();
      await fetchStatus();
      setModalOpen(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!canUse) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white flex items-center justify-center"
        aria-label="Notifications"
        title="Notifications"
      >
        {/* bell icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="block">
          <path
            d="M15 17H9m8-5V9a5 5 0 10-10 0v3c0 .8-.3 1.6-.9 2.2L5 15h14l-1.1-.8c-.6-.6-.9-1.4-.9-2.2z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {notifCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.55)]" />
        )}
        {fx && (
          <span className="pointer-events-none absolute inset-0 rounded-lg reward-burst" aria-hidden="true" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-20 w-80 rounded-2xl bg-[#141427]/95 backdrop-blur-xl border border-purple-500/15 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Notifications</p>
              <span className="text-xs text-gray-500">{notifCount} neu</span>
            </div>

            <div className="p-2">
              {rewardStatus?.starterPack?.claimable ? (
                <button
                  onClick={() => { setModalOpen(true); setMsg(null); }}
                  className="w-full text-left p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-base">🎁</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">Starter Pack bereit</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        +{rewardStatus.starterPack.amount} Tokens sind bereit zum Claim.
                      </p>
                      <p className="text-[11px] text-gray-600 mt-1">Tip: Click to claim.</p>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="p-4 text-sm text-gray-500">Keine neuen Benachrichtigungen.</div>
              )}
            </div>
          </div>
        </>
      )}

      {modalOpen && rewardStatus?.starterPack?.claimable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-[#141427] border border-purple-500/20 shadow-2xl overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-base">🎁</div>
                  <div>
                    <p className="text-white font-bold">Starter Pack</p>
                    <p className="text-xs text-gray-500">Einmalig claimbar</p>
                  </div>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="w-9 h-9 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/10">
                <p className="text-sm text-gray-300">
                  Dein Starter Pack ist bereit. Du bekommst <span className="text-amber-300 font-bold">+{rewardStatus.starterPack.amount}</span> Tokens.
                </p>
                {msg && <p className="text-xs text-gray-400 mt-2">{msg}</p>}
              </div>

              <button
                onClick={claimStarter}
                disabled={busy}
                className="mt-4 w-full btn-gold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? '...' : `Claim +${rewardStatus.starterPack.amount}`}
              </button>

              {!rewardStatus.vote?.url && (
                <p className="text-[11px] text-gray-600 mt-3">
                  Vote-Link fehlt. Setze `NEXT_PUBLIC_TOPGG_VOTE_URL`.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

