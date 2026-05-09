'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (session && userRole && userRole !== 'pending') {
      setTimeout(() => {
        router.push('/dashboard');
      }, 0);
    }
  }, [session, status, userRole]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Pending user — logged in but no access yet
  if (session && userRole === 'pending') {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[120px] -top-40 -right-40 animate-float" />
          <div className="absolute w-[400px] h-[400px] rounded-full bg-purple-600/8 blur-[100px] -bottom-32 -left-32 animate-float" style={{ animationDelay: '2s' }} />
        </div>

        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle, #8b5cf6 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />

        <div className="relative text-center max-w-lg animate-fade-in-up">
          <div className="game-card p-10">
            <div className="mb-6 animate-float">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
                <span className="text-4xl">⏳</span>
              </div>
            </div>

            <h1 className="text-3xl font-bold text-white mb-3">Zugang ausstehend</h1>

            <p className="text-gray-400 mb-2">
              Hey <span className="text-purple-400 font-semibold">{session.user?.name}</span>! Du bist eingeloggt, aber dein Zugang wurde noch nicht freigeschaltet.
            </p>

            <p className="text-gray-500 text-sm mb-8">
              Bitte frag einen Admin auf unserem Discord-Server, um freigeschaltet zu werden.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://discord.gg/eselbande"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-discord inline-flex items-center gap-2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
                </svg>
                Zum Discord
              </a>
              <button onClick={() => signOut()} className="btn-danger text-sm">
                Ausloggen
              </button>
            </div>
          </div>

          <div className="mt-10">
            <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <p className="text-xs text-gray-600 mt-4">Dein Account wird überprüft • Bitte hab etwas Geduld</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-6 overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[500px] h-[500px] rounded-full bg-purple-600/10 blur-[120px] -top-40 -left-40 animate-float" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-amber-500/8 blur-[100px] -bottom-32 -right-32 animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-blue-500/8 blur-[80px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-float" style={{ animationDelay: '3s' }} />
      </div>

      {/* Particle grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, #8b5cf6 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="relative text-center max-w-2xl animate-fade-in-up">
        {/* Logo / Icon */}
        <div className="mb-8 animate-float">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-purple-600/20 to-amber-500/20 border border-purple-500/20 animate-pulse-glow">
            <span className="text-5xl">🫏</span>
          </div>
        </div>

        <h1 className="text-5xl sm:text-7xl font-black mb-4 tracking-tight">
          <span className="glow-text">Esel</span><span className="token-display" style={{ fontSize: 'clamp(2rem, 8vw, 4.5rem)' }}>Tokens</span>
        </h1>

        <p className="text-base sm:text-xl text-gray-400 mb-4 animate-fade-in stagger-2">
          Das Token-System der <span className="text-purple-400 font-semibold">Eselbande</span> Community
        </p>

        <p className="text-xs sm:text-sm text-gray-500 mb-8 sm:mb-10 animate-fade-in stagger-3">
          Sammle Tokens • Tausche mit Mitgliedern • Steige im Ranking auf
        </p>

        <button
          onClick={() => signIn('discord')}
          className="btn-discord animate-scale-in stagger-4 inline-flex items-center gap-2 sm:gap-3 !py-3 !px-5 sm:!py-4 sm:!px-10 text-base sm:text-lg"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
          </svg>
          Login mit Discord
        </button>

        {/* Bottom decorative line */}
        <div className="mt-16 animate-fade-in stagger-5">
          <div className="h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
          <p className="text-xs text-gray-600 mt-4">Powered by Eselbande &bull; Sichere Discord-Authentifizierung</p>
        </div>
      </div>
    </div>
  );
}
