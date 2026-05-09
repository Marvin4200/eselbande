#!/usr/bin/env node
/**
 * Premium System Setup
 * Run: node utils/setupPremiumDB.js
 */

const PremiumDatabase = require('./premiumDatabase');
const path = require('path');

async function setup() {
    console.log('\n🚀 Setting up Premium System...\n');
    
    try {
        const db = new PremiumDatabase();
        
        // Initialize tables
        console.log('1️⃣  Initializing database tables...');
        await db.init();
        
        // Add default free tier commands
        console.log('2️⃣  Adding free tier commands...');
        const freeCommands = [
            { name: 'fahrstuhl', desc: 'Basic elevator troll (30 sec)' },
            { name: 'geist', desc: 'Ghost visits (10-20 min)' },
            { name: 'stillepost', desc: 'Random mute (1-2 sec)' },
            { name: 'spiegel', desc: 'Mirror user' },
            { name: 'help', desc: 'Show help' }
        ];
        for (const cmd of freeCommands) {
            await db.addFeature(cmd.name, 'free', cmd.desc);
        }
        console.log(`   ✓ Added ${freeCommands.length} free commands`);
        
        // Add premium commands
        console.log('3️⃣  Adding basic premium commands...');
        const basicCommands = [
            { name: 'toteleitung', desc: 'Random deafen (2-5 sec)' },
            { name: 'preset', desc: 'Troll presets' }
        ];
        for (const cmd of basicCommands) {
            await db.addFeature(cmd.name, 'basic', cmd.desc);
        }
        console.log(`   ✓ Added ${basicCommands.length} basic premium commands`);
        
        // Add pro commands
        console.log('4️⃣  Adding pro premium commands...');
        const proCommands = [
            { name: 'prestop', desc: 'Stop all trolls' },
            { name: 'status', desc: 'Show status' }
        ];
        for (const cmd of proCommands) {
            await db.addFeature(cmd.name, 'pro', cmd.desc);
        }
        console.log(`   ✓ Added ${proCommands.length} pro premium commands`);
        
        await db.close();
        
        console.log('\n✅ Premium system initialized successfully!\n');
        console.log('📝 Next steps:');
        console.log('   1. Add PremiumManager to index.js');
        console.log('   2. Add premium routes to dashboard');
        console.log('   3. Add premium UI to dashboard.html');
        console.log('   4. Test with: npm start\n');
        
    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        process.exit(1);
    }
}

setup();
