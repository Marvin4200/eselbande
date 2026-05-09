# Discord IDs finden - Schritt für Schritt

## 1. Server-ID (Guild ID) ermitteln
- Aktiviere Developer Mode in Discord: Einstellungen → Erweitert → Developer Mode ON
- Rechtsklick auf deinen Server-Namen → "Server-ID kopieren"

## 2. Rollen-IDs ermitteln
- Gehe zu Servereinstellungen → Rollen
- Rechtsklick auf die "Member"-Rolle → "Rollen-ID kopieren"
- Wiederhole das für die "Admin"-Rolle

## 3. Client Secret ermitteln
- Gehe zu https://discord.com/developers/applications/1495527918112080082/oauth2/general
- Klick auf "Reset Secret" (falls nötig)
- Kopiere den Client Secret

## 4. Redirect URI hinzufügen
- Im OAuth2 Bereich → "Redirects"
- Füge hinzu: http://localhost:3000/api/auth/callback/discord
- Scopes: identify, guilds, guilds.members.read

## 5. In .env.local eintragen
Beispiel:
```
DISCORD_CLIENT_ID=1495527918112080082
DISCORD_CLIENT_SECRET=dein_client_secret_hier
DISCORD_GUILD_ID=deine_server_id_hier
DISCORD_MEMBER_ROLE_ID=deine_member_rolle_id
DISCORD_ADMIN_ROLE_ID=deine_admin_rolle_id
INITIAL_ADMIN_DISCORD_ID=deine_discord_user_id
```
