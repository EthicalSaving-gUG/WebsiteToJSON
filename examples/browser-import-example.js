/**
 * Example: Using BrowserPasswordImporter with KeePass integration
 * 
 * This example shows how to:
 * 1. Import passwords from Chrome, Firefox, or Edge
 * 2. Export them in KeePass format
 * 3. Use them with the KeePassXC provider for secure management
 */

import { BrowserPasswordImporter } from './credentials/BrowserPasswordImporter.js';
import { KeepassXCProvider } from './credentials/KeepassXCProvider.js';
import fs from 'fs';

async function main() {
  console.log('🔐 Browser Password Importer + KeePass Integration Demo\n');

  // ===== STEP 1: Import from browser =====
  console.log('📥 Step 1: Importing passwords from Chrome...');
  const chromeImporter = new BrowserPasswordImporter('chrome');
  const initialized = await chromeImporter.initialize();

  if (!initialized) {
    console.log('❌ Chrome import failed. Chrome may not be installed or profile not accessible.');
    console.log('   Trying Firefox instead...\n');
    
    const firefoxImporter = new BrowserPasswordImporter('firefox');
    const ffInitialized = await firefoxImporter.initialize();
    
    if (!ffInitialized) {
      console.log('❌ Firefox import also failed.');
      return;
    }
  }

  const status = await chromeImporter.getStatus();
  console.log(`✅ Imported ${status.credentialCount} credentials from ${status.browserType}\n`);

  // ===== STEP 2: List imported credentials =====
  console.log('📋 Imported Credentials:');
  const credentials = await chromeImporter.listCredentials();
  credentials.slice(0, 5).forEach(cred => {
    console.log(`   • ${cred.url} (user: ${cred.username})`);
  });
  if (credentials.length > 5) {
    console.log(`   ... and ${credentials.length - 5} more`);
  }
  console.log();

  // ===== STEP 3: Export to KeePass format =====
  console.log('💾 Step 2: Exporting to KeePass CSV format...');
  const csvExport = await chromeImporter.exportToKeePass('csv');
  const csvFile = './imported-credentials.csv';
  fs.writeFileSync(csvFile, csvExport);
  console.log(`✅ Exported to: ${csvFile}\n`);

  // ===== STEP 4: Show how to search for specific credentials =====
  console.log('🔍 Step 3: Searching for specific credentials...');
  const meta = await chromeImporter.getCredentialMeta('gmail.com');
  if (meta) {
    console.log(`✅ Found: ${meta.label}`);
    console.log(`   Username: ${meta.username}`);
    console.log(`   Provider: ${meta.providerType}\n`);
  } else {
    console.log('❌ Gmail.com credentials not found in imported data\n');
  }

  // ===== STEP 5: Integration with KeePassXC =====
  console.log('🔐 Step 4: Testing KeePassXC integration...');
  const keepassProvider = new KeepassXCProvider();
  const keepassReady = await keepassProvider.initialize();
  
  if (keepassReady) {
    console.log('✅ KeePassXC is available');
    console.log('   You can now use the browser-imported credentials with KeePassXC!');
  } else {
    console.log('⚠️  KeePassXC not currently available');
    console.log('   But you can export the CSV and import it manually into KeePass.\n');
    
    console.log('📖 Instructions for manual import:');
    console.log('   1. Open KeePass');
    console.log('   2. Go to Tools > Import');
    console.log(`   3. Select the CSV file: ${csvFile}`);
    console.log('   4. Map columns and complete the import\n');
  }

  // ===== STEP 6: Show export options =====
  console.log('💡 Available Export Formats:');
  console.log('   1. CSV (for manual KeePass import)');
  console.log('   2. KeePass XML (native format)\n');

  const xmlExport = await chromeImporter.exportToKeePass('keepass-xml');
  const xmlFile = './imported-credentials.xml';
  fs.writeFileSync(xmlFile, xmlExport);
  console.log(`✅ Also exported XML format to: ${xmlFile}\n`);

  console.log('✨ Import demo complete!');
  console.log('   Use the exported files to populate KeePass securely.');
}

// Run the demo
main().catch(console.error);
