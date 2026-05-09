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
}

export default function Moderator() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status === 'unauthenticated') {
      setTimeout(() => { router.push('/'); }, 0);
    }
    if (status === 'authenticated' && userRole !== 'moderator' && userRole !== 'admin') {
      setTimeout(() => { router.push('/dashboard'); }, 0);
    }
  }, [status, userRole]);

  useEffect(() => {
    if (userRole === 'moderator' || userRole === 'admin') {
      fetchUsers();
    }
  }, [userRole]);

  const fetchUsers = async () => {
    const res = await fetch(apiPath('/api/moderator/users'));
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  };

  const updateRole = async (userId: number, role: string) => {
    await fetch(apiPath('/api/moderator/update-role'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    fetchUsers();
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || (userRole !== 'moderator' && userRole !== 'admin')) return null;

  const pendingUsers = users.filter(u => u.role === 'pending');
  const memberUsers = users.filter(u => u.role === 'member');

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
        <div className="absolute w-[500px] h-[500px] rounded-full bg-blue-600/8 blur-[150px] -top-40 -right-40" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-[120px] -bottom-32 -left-32" />
      </div>

      {/* Top Navigation */}
      <nav className="relative z-10 border-b border-blue-500/10 bg-black/20 backdrop-blur-xl">
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
            <span className="text-3xl">🛡️</span>
            <h1 className="text-3xl font-bold text-white">Moderator Panel</h1>
          </div>
          <p className="text-gray-500">Verwalte Beitrittsanfragen — schalte neue Mitglieder frei</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 animate-fade-in-up stagger-2">
          <div className="game-card p-5 text-center">
            <p className="text-3xl font-bold text-amber-400">{pendingUsers.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Ausstehend</p>
          </div>
          <div className="game-card p-5 text-center">
            <p className="text-3xl font-bold text-green-400">{memberUsers.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Aktive Member</p>
          </div>
        </div>

        {/* Pending Users */}
        <div className="game-card p-6 mb-8 animate-fade-in-up stagger-3">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xl">⏳</span>
            <h2 className="text-xl font-bold text-white">Wartende Anfragen</h2>
            {pendingUsers.length > 0 && (
              <span className="ml-2 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                {pendingUsers.length}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {pendingUsers.map((user, index) => (
              <div
                key={user.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-amber-500/[0.03] hover:bg-amber-500/[0.06] border border-amber-500/10 transition-all"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/10 flex items-center justify-center text-lg font-bold text-amber-300">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{user.username}</div>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${roleColors.pending}`}>
                      pending
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateRole(user.id, 'member')}
                    className="btn-primary text-sm inline-flex items-center gap-1.5"
                  >
                    ✅ Freischalten
                  </button>
                </div>
              </div>
            ))}

            {pendingUsers.length === 0 && (
              <div className="text-center py-12">
                <span className="text-4xl mb-3 block">🎉</span>
                <p className="text-gray-500">Keine ausstehenden Anfragen</p>
              </div>
            )}
          </div>
        </div>

        {/* Active Members */}
        <div className="game-card p-6 animate-fade-in-up stagger-4">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xl">👥</span>
            <h2 className="text-xl font-bold text-white">Aktive Mitglieder</h2>
          </div>

          <div className="space-y-2">
            {memberUsers.map((user, index) => (
              <div
                key={user.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.03] transition-all"
                style={{ animationDelay: `${index * 0.03}s` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/10 flex items-center justify-center text-lg font-bold text-green-300">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{user.username}</div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${roleColors.member}`}>
                        member
                      </span>
                      <span className="text-xs text-gray-500">{user.balance} Tokens</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => updateRole(user.id, 'pending')}
                  className="btn-danger text-sm"
                >
                  Zurücksetzen
                </button>
              </div>
            ))}

            {memberUsers.length === 0 && (
              <p className="text-gray-600 text-center py-8">Noch keine Mitglieder</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
