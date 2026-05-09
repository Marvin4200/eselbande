import DiscordProvider from 'next-auth/providers/discord';
import getDb from '@/lib/db';

const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'identify',
          // prompt: 'none' removed — caused "State cookie was missing" behind reverse proxy
        },
      },
    }),
  ],
  cookies: {
    pkceCodeVerifier: {
      name: 'next-auth.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
    state: {
      name: 'next-auth.state',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id || !profile?.username) {
        return false;
      }

      const db = getDb();
      const discordId = profile.id;
      const initialAdminId = process.env.INITIAL_ADMIN_DISCORD_ID;
      const desiredRole = discordId === initialAdminId ? 'admin' : 'pending';

      const existing = db.prepare('SELECT * FROM users WHERE discordId = ?').get(discordId);
      const starterAmount = Math.max(0, parseInt(process.env.STARTER_PACK_TOKENS || '500', 10) || 0);
      const isNewUser = !existing;

      if (existing) {
        const nextRole = desiredRole === 'admin' && existing.role !== 'admin' ? 'admin' : existing.role;
        db.prepare('UPDATE users SET username = ?, discriminator = ?, avatar = ?, role = ? WHERE discordId = ?')
          .run(profile.username, profile.discriminator || '', profile.avatar || '', nextRole, discordId);
      } else {
        db.prepare('INSERT INTO users (discordId, username, discriminator, avatar, role) VALUES (?, ?, ?, ?, ?)')
          .run(discordId, profile.username, profile.discriminator || '', profile.avatar || '', desiredRole);
      }

      // Starter pack: show as a claimable notification for first-time users.
      // Create an unclaimed reward_state row (no auto-credit).
      if (starterAmount > 0 && isNewUser) {
        const user = db.prepare('SELECT id FROM users WHERE discordId = ?').get(discordId);
        if (user?.id) {
          const create = db.transaction(() => {
            // Idempotent: NextAuth can call signIn twice; avoid UNIQUE constraint errors.
            db.prepare(
              "INSERT OR IGNORE INTO reward_state (userId, rewardKey, lastClaimAt, claimCount, meta, updatedAt) VALUES (?, ?, ?, 0, ?, datetime('now'))"
            ).run(user.id, 'starter_pack', Date.now(), JSON.stringify({ amount: starterAmount, claimed: false }));
          });
          create();
        }
      }

      return true;
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.discordId = profile.id;
      }
      return token;
    },
    async session({ session, token }) {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE discordId = ?').get(token.discordId);
      if (user) {
        session.user.id = user.id;
        session.user.discordId = user.discordId;
        session.user.role = user.role;
        session.user.balance = user.balance;
        session.user.xp = user.xp || 0;
        session.user.name = user.username;
      }
      delete session.user.email;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

export default authOptions;
