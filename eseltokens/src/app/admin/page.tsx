'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiPath } from '@/lib/clientPaths';

interface User {
  id: number;
  username: string;
  balance: number;
  role: string;
  xp: number;
}

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
    if (remaining < needed) return { level, currentXp: remaining, xpNeeded: needed };
    remaining -= needed;
    level++;
  }
}

function getLevelTitle(level: number) {
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

export default function Admin() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status === 'unauthenticated' || (status === 'authenticated' && userRole !== 'admin')) {
      setTimeout(() => { router.push('/'); }, 0);
    }
  }, [status, userRole]);

  useEffect(() => {
    if (userRole === 'admin') {
      fetchUsers();
    }
  }, [userRole]);

  const fetchUsers = async () => {
    const res = await fetch(apiPath('/api/admin/users'));
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  const updateBalance = async (userId: number, newBalance: number) => {
    await fetch(apiPath('/api/admin/update-balance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, balance: newBalance }),
    });
    fetchUsers();
    update();
  };

  const updateRole = async (userId: number, role: string) => {
    await fetch(apiPath('/api/admin/update-role'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    fetchUsers();
  };

  const updateXp = async (userId: number, xp: number) => {
    await fetch(apiPath('/api/admin/update-xp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, xp }),
    });
    fetchUsers();
    update();
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || userRole !== 'admin') return null;

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    moderator: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    member: 'bg-green-500/15 text-green-400 border-green-500/30',
    pending: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };

  return (
    <div className="min-h-screen relative">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[500px] h-[500px] rounded-full bg-purple-600/8 blur-[150px] -top-40 -left-40" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-red-500/5 blur-[120px] -bottom-32 -right-32" />
      </div>

      {/* Top Navigation */}
      <nav className="relative z-10 border-b border-purple-500/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/dashboard')}>
            <span className="text-2xl">🫏</span>
            <h1 className="text-xl font-bold">
              <span className="glow-text">Esel</span><span className="text-amber-400">Tokens</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
            >
              ← Dashboard
            </button>
          </div>
        </div>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">⚙️</span>
            <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          </div>
          <p className="text-gray-500">Verwalte Mitglieder, Rollen und Token-Guthaben</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-fade-in-up stagger-2">
          <div className="game-card p-5 text-center">
            <p className="text-3xl font-bold text-purple-400">{users.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Gesamt User</p>
          </div>
          <div className="game-card p-5 text-center">
            <p className="text-3xl font-bold text-green-400">{users.filter(u => u.role === 'member' || u.role === 'admin').length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Aktive Member</p>
          </div>
          <div className="game-card p-5 text-center">
            <p className="text-3xl font-bold text-amber-400">{users.reduce((sum, u) => sum + u.balance, 0)}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Tokens im Umlauf</p>
          </div>
        </div>

        {/* User Management */}
        <div className="game-card p-6 animate-fade-in-up stagger-3">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xl">👥</span>
            <h2 className="text-xl font-bold text-white">Mitglieder verwalten</h2>
          </div>

          <div className="space-y-3">
            {users.map((user, index) => (
              <div
                key={user.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.03] transition-all"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* User Info */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/10 flex items-center justify-center text-lg font-bold text-purple-300">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{user.username}</div>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${roleColors[user.role] || roleColors.pending}`}>
                      {user.role}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="overflow-x-auto">
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider">Rolle</label>
                    <select
                      value={user.role}
                      onChange={(e) => updateRole(user.id, e.target.value)}
                      className="game-select text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider">Tokens</label>
                    <input
                      type="number"
                      defaultValue={user.balance}
                      onBlur={(e) => updateBalance(user.id, parseInt(e.target.value) || 0)}
                      className="game-input w-20 text-sm text-center"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider">Level</label>
                    <span className="text-sm font-semibold text-purple-400">{getLevelInfo(user.xp || 0).level}</span>
                    <span className="text-xs text-gray-500">({getLevelTitle(getLevelInfo(user.xp || 0).level)})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 uppercase tracking-wider">XP</label>
                    <input
                      type="number"
                      key={user.xp}
                      defaultValue={user.xp || 0}
                      onBlur={(e) => updateXp(user.id, parseInt(e.target.value) || 0)}
                      className="game-input w-24 text-sm text-center"
                      min={0}
                    />
                    {(user.xp || 0) > 0 && (
                      <button
                        onClick={() => updateXp(user.id, 0)}
                        className="text-xs px-2 py-1 rounded-md bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-all"
                        title="XP auf 0 zurücksetzen"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                </div>
              </div>
            ))}

            {users.length === 0 && (
              <p className="text-gray-600 text-center py-12">Keine User vorhanden</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
