#!/bin/bash
# Fahrstuhl Bot Dashboard - Debian Server Setup
# Für Production auf Linux Server

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🚀 Fahrstuhl Bot Dashboard - Linux Server Setup           ║"
echo "║     (Debian/Ubuntu)                                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ============ SCHRITT 1: Node.js & npm ============

echo "📋 Schritt 1: Node.js & npm prüfen..."
echo ""

if ! command -v node &> /dev/null
then
    echo "❌ Node.js nicht installiert!"
    echo ""
    echo "Installiere Node.js 18+"
    echo ""
    echo "Methode A (Empfohlen - NodeSource):"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    echo "Methode B (nvm - Node Version Manager):"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "  nvm install 18"
    echo ""
    exit 1
else
    NODE_VERSION=$(node -v)
    NPM_VERSION=$(npm -v)
    echo "✓ Node.js: $NODE_VERSION"
    echo "✓ npm: $NPM_VERSION"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# ============ SCHRITT 2: Ordnerstruktur ============

echo "📁 Schritt 2: Stelle sicher dass Ordnerstruktur stimmt..."
echo ""

if [ ! -d "dashboard/server" ]; then
    echo "❌ dashboard/server/ nicht gefunden!"
    echo ""
    echo "Deine Ordnerstruktur sollte so aussehen:"
    echo "  fahrstuhl/"
    echo "  └── dashboard/"
    echo "      ├── server/"
    echo "      │   └── dev-dashboard.js"
    echo "      ├── public/"
    echo "      │   └── index.html"
    echo "      └── config/"
    echo "          └── .env"
    echo ""
    exit 1
fi

echo "✓ Ordnerstruktur OK"
echo ""

# ============ SCHRITT 3: Dependencies ============

echo "📦 Schritt 3: npm Dependencies installieren..."
echo ""

cd dashboard/server

if [ ! -d "node_modules" ]; then
    echo "npm install wird ausgeführt..."
    npm install express express-session axios dotenv
    if [ $? -eq 0 ]; then
        echo "✓ Dependencies installiert"
    else
        echo "❌ npm install fehlgeschlagen!"
        exit 1
    fi
else
    echo "✓ node_modules existiert schon"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# ============ SCHRITT 4: .env prüfen ============

echo "🔐 Schritt 4: .env Konfiguration..."
echo ""

if [ ! -f "../config/.env-dashboard-example" ]; then
    echo "⚠️  .env-dashboard-example nicht gefunden!"
    echo "Erstelle von .env-dashboard-example"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "Erstelle .env aus Template..."
    cp ../config/.env-dashboard-example .env
    echo "✓ .env erstellt"
    echo ""
    echo "⚠️  WICHTIG: Fülle .env mit Discord Daten aus!"
    echo ""
    echo "Bearbeite .env:"
    echo "  nano .env"
    echo ""
    echo "Benötigte Variablen:"
    echo "  - DISCORD_CLIENT_ID"
    echo "  - DISCORD_CLIENT_SECRET"
    echo "  - DEV_USER_ID"
    echo "  - DISCORD_REDIRECT_URI"
    echo ""
else
    echo "✓ .env existiert schon"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# ============ SCHRITT 5: Test Start ============

echo "🧪 Schritt 5: Dashboard testen..."
echo ""

echo "Starte dev-dashboard.js..."
echo ""
echo "Drücke Ctrl+C zum Stoppen nach dem Test!"
echo ""
sleep 2

timeout 5 node dev-dashboard.js &

sleep 3

# Prüfe ob Port offen
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo ""
    echo "✓ Server läuft auf Port 3001!"
    echo ""
    echo "Öffne im Browser: http://localhost:3001"
    echo ""
else
    echo ""
    echo "⚠️  Server konnte nicht starten"
    echo "Prüfe .env Konfiguration!"
    echo ""
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# ============ SCHRITT 6: Production Setup ============

echo "🚀 Schritt 6: Production Setup (Optional)..."
echo ""

echo "Für öffentlichen Zugang brauchst du:"
echo ""
echo "1️⃣  Reverse Proxy (nginx/Apache)"
echo "2️⃣  SSL/TLS Zertifikat (Let's Encrypt)"
echo "3️⃣  Process Manager (PM2)"
echo "4️⃣  Firewall Rules"
echo ""

echo "Siehe: docs/PRODUCTION-SETUP.md"
echo ""

echo "════════════════════════════════════════════════════════════"
echo ""

echo "✅ Setup abgeschlossen!"
echo ""
echo "Nächste Schritte:"
echo ""
echo "1. Fülle .env mit Discord Daten:"
echo "   cd dashboard/server && nano .env"
echo ""
echo "2. Starte Dashboard:"
echo "   node dev-dashboard.js"
echo ""
echo "3. Öffne Browser:"
echo "   http://DEINE-IP:3001"
echo ""
echo "4. Für Production Setup siehe docs/"
echo ""
