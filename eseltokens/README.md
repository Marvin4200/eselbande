# EselTokens

Eine moderne Website für die Eselbande Community mit einem einfachen Token-System.

## Features

- Discord OAuth2 Login
- Rollenbasierte Zugriffssteuerung
- Einfaches Token-System (geben und einlösen)
- Admin-Dashboard
- Responsive Design mit TailwindCSS

## Setup

1. Klone das Repository und installiere Abhängigkeiten:
   ```bash
   npm install
   ```

2. Erstelle eine `.env.local` Datei mit deinen Discord-Einstellungen:
   ```
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_CLIENT_SECRET=your_discord_client_secret
   NEXTAUTH_SECRET=your_nextauth_secret
   NEXTAUTH_URL=http://localhost:3000
   DISCORD_GUILD_ID=your_guild_id
   DISCORD_MEMBER_ROLE_ID=your_member_role_id
   DISCORD_ADMIN_ROLE_ID=your_admin_role_id
   INITIAL_ADMIN_DISCORD_ID=your_discord_id_for_initial_admin
   ```

   > Die Datenbank wird basierend auf der Konfiguration (MongoDB oder SQLite) initialisiert.

3. Starte den Development Server:
   ```bash
   npm run dev
   ```

6. Öffne [http://localhost:3000](http://localhost:3000).

## Discord Setup

1. Erstelle eine Discord App auf https://discord.com/developers/applications
2. Füge OAuth2 Redirect URI: `http://localhost:3000/api/auth/callback/discord`
3. Scopes: `identify`, `guilds`, `guilds.members.read`

## Deployment

Verwende Vercel oder einen anderen Hosting-Service. Stelle sicher, dass die Environment Variables gesetzt sind.

## Technologien

- Next.js 14
- NextAuth.js
- Datenbank (SQLite oder MongoDB)
- TailwindCSS
- TypeScript
