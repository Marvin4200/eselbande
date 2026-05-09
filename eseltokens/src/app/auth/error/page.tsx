import Link from 'next/link';

export default async function AuthError({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const error = params?.error;

  return (
    <div className="min-h-screen relative flex items-center justify-center px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[500px] h-[500px] rounded-full bg-red-600/10 blur-[120px] -top-40 -left-40" />
      </div>

      <div className="relative text-center max-w-md animate-fade-in-up">
        <div className="game-card p-10 border-red-500/20">
          <div className="mb-6">
            <span className="text-5xl">🚫</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Zugriff verweigert</h1>
          <p className="text-gray-400 mb-4">
            Du hast keine Berechtigung für diese Seite. Bitte frag einen Admin.
          </p>
          {error && (
            <p className="text-xs text-red-400/70 mb-6 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
              Fehler: {error}
            </p>
          )}
          <Link href="/" className="btn-primary inline-block">
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
