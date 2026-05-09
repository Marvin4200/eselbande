#!/usr/bin/env node
/**
 * Fahrstuhl Bot Dashboard - Folder Organizer
 * Organisiert alle Dashboard-Dateien in Ordner
 */

const fs = require('fs');
const path = require('path');

const baseDir = __dirname;

console.log('\n📁 Erstelle Dashboard Ordnerstruktur...\n');

// Ordner erstellen
const dirs = [
    'dashboard',
    'dashboard/server',
    'dashboard/public',
    'dashboard/docs',
    'dashboard/config',
    'dashboard/scripts'
];

dirs.forEach(dir => {
    const fullPath = path.join(baseDir, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`✓ ${dir}/`);
    } else {
        console.log(`✓ ${dir}/ (existiert)`);
    }
});

console.log('\n📋 Neue Struktur:\n');
console.log('fahrstuhl/');
console.log('├── dashboard/');
console.log('│   ├── server/          (dev-dashboard.js)');
console.log('│   ├── public/          (index.html, CSS, JS)');
console.log('│   ├── docs/            (Alle .md Dokumentationen)');
console.log('│   ├── config/          (.env template)');
console.log('│   └── scripts/         (setup.bat, start.bat)');
console.log('├── commands/');
console.log('├── services/');
console.log('├── utils/');
console.log('└── index.js\n');

console.log('🎯 Verschiebe jetzt folgende Dateien:\n');
console.log('1. dev-dashboard.js → dashboard/server/');
console.log('2. dev-dashboard-public-index.html → dashboard/public/index.html');
console.log('3. setup-dashboard.bat → dashboard/scripts/setup.bat');
console.log('4. start-dashboard.bat → dashboard/scripts/start.bat');
console.log('5. DASHBOARD-*.md → dashboard/docs/');
console.log('6. DISCORD-OAUTH-SETUP.md → dashboard/docs/');
console.log('7. DEV-DASHBOARD-README.md → dashboard/docs/');
console.log('8. .env-dashboard-example → dashboard/config/');
console.log('9. GITIGNORE-DASHBOARD.txt → dashboard/config/');
console.log('10. README-DASHBOARD.txt → dashboard/');

console.log('\n✅ Ordnerstruktur bereit zum Einsatz!\n');
