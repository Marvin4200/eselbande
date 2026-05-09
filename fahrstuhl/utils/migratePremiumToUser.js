#!/usr/bin/env node
/**
 * Migration Script: Convert Premium System from Guild-Based to User-Based
 * Run: node utils/migratePremiumToUser.js
 * 
 * This script:
 * 1. Backs up old premium.db
 * 2. Deletes old premium.db
 * 3. Initializes new user-based schema
 * 4. Sets up default premium features
 */

const fs = require('fs');
const path = require('path');
const PremiumDatabase = require('./premiumDatabase');

async function migrate() {
    console.log('\n🚀 Migrating Premium System: Guild → User\n');
    
    try {
        const dbPath = path.join(__dirname, '../data/premium.db');
        const backupPath = path.join(__dirname, '../data/premium.db.backup');
        
        // Step 1: Backup old database
        if (fs.existsSync(dbPath)) {
            console.log('1️⃣  Backing up old database...');
            fs.copyFileSync(dbPath, backupPath);
            console.log(`   ✓ Backup created: ${backupPath}`);
            
            // Step 2: Delete old database
            console.log('2️⃣  Removing old guild-based database...');
            fs.unlinkSync(dbPath);
            console.log('   ✓ Old database removed');
        } else {
            console.log('1️⃣  No existing database found, creating fresh...');
        }
        
        // Step 3: Initialize new user-based schema
        console.log('3️⃣  Initializing new user-based schema...');
        const db = new PremiumDatabase();
        await db.init();
        console.log('   ✓ Database initialized with user-based schema');
        
        // Step 4: Add default premium features
        console.log('4️⃣  Adding premium features...');
        
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
        
        const basicCommands = [
            { name: 'toteleitung', desc: 'Random deafen (2-5 sec)' },
            { name: 'preset', desc: 'Troll presets' }
        ];
        for (const cmd of basicCommands) {
            await db.addFeature(cmd.name, 'basic', cmd.desc);
        }
        console.log(`   ✓ Added ${basicCommands.length} basic premium commands`);
        
        const proCommands = [
            { name: 'prestop', desc: 'Stop all trolls' }
        ];
        for (const cmd of proCommands) {
            await db.addFeature(cmd.name, 'pro', cmd.desc);
        }
        console.log(`   ✓ Added ${proCommands.length} pro premium commands`);
        
        await db.close();
        
        console.log('\n✅ Premium system migrated successfully!\n');
        console.log('📊 New Schema:');
        console.log('   - Premiums: userId-based (not guildId)');
        console.log('   - Premium Usage: tracks userId commands');
        console.log('   - Features: same free/basic/pro tiers\n');
        console.log('🔧 Next steps:');
        console.log('   1. Update all command checks to use interaction.user.id');
        console.log('   2. Test premium endpoints with userId');
        console.log('   3. Run: npm start\n');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('\nTo rollback, run: mv data/premium.db.backup data/premium.db');
        process.exit(1);
    }
}

migrate();
