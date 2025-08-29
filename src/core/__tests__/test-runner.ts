#!/usr/bin/env node

import { AutoTranslator } from '../auto-translator.js';
import { Config } from '../../types/index.js';
import { MockTranslationServer } from './mock-server.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Simple test runner to demonstrate the AutoTranslator functionality
 */
async function runDemo() {
  console.log('🚀 Starting Translation Manager Demo\n');

  // Start mock server in background
  console.log('🔧 Starting mock translation server...');
  const mockServer = MockTranslationServer.getInstance();
  await mockServer.start();
  console.log('✅ Mock server started successfully\n');

  // Create test configuration
  const config: Config = {
    watchPath: './test-locales',
    baseLanguage: 'en',
    targetLanguages: ['fr', 'de'],
    filePattern: '.*\\.json$',
    provider: {
      type: 'local',
      config: {
        model: 'gpt-4o-mini',
      },
    },
    preserveFormatting: true,
    contextInjection: true,
    batchSize: 5,
    retryAttempts: 2,
    logLevel: 'info',
  };

  try {
    // Create test directory structure
    await createTestFiles(config);

    // Create translation manager with mock provider
    const manager = new AutoTranslator(config, {
      autoStart: false,
    });

    // Set up event listeners
    manager.on('started', () => {
      console.log('✅ Translation manager started');
    });

    manager.on('stopped', () => {
      console.log('🛑 Translation manager stopped');
    });

    manager.on('baseLanguageChanged', event => {
      console.log(`📝 Base language file changed: ${event.filePath}`);
    });

    manager.on('translationCompleted', data => {
      console.log(`✅ Translation completed: ${data.response.key}`);
    });

    manager.on('translationFailed', data => {
      console.log(
        `❌ Translation failed: ${data.response.key} - ${data.response.error}`
      );
    });

    // Start the manager
    console.log('🔄 Starting translation manager...');
    await manager.start();

    // Wait a moment for startup
    await sleep(1000);

    // Check status
    const status = manager.getStatus();
    console.log('\n📊 Current Status:');
    console.log(`- Running: ${status.isRunning}`);
    console.log(`- Processing: ${status.isProcessing}`);
    console.log(`- Base Language: ${status.config.baseLanguage}`);
    console.log(
      `- Target Languages: ${status.config.targetLanguages.join(', ')}`
    );
    console.log(`- Provider: ${status.config.provider}`);

    // Safely trigger manual translation (retry if watcher is processing)
    console.log('\n🔄 Manually triggering translation...');
    const result = await translateFileWithRetry(
      manager,
      path.join(config.watchPath, 'en.json'),
      20000
    );

    console.log('\n📋 Translation Result:');
    console.log(`- Success: ${result.success}`);
    console.log(`- Batches Processed: ${result.batchesProcessed}`);
    console.log(`- Total Translations: ${result.totalTranslations}`);
    console.log(`- Files Updated: ${result.updatedFiles.join(', ')}`);

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`- ${error}`));
    }

    // Show updated files
    console.log('\n📁 Updated Files:');
    for (const file of result.updatedFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lang = path.basename(file, path.extname(file));
        console.log(`\n${lang.toUpperCase()}:`);
        console.log(JSON.stringify(JSON.parse(content), null, 2));
      } catch (error) {
        console.log(`❌ Failed to read ${file}: ${error}`);
      }
    }

    // Stop the manager
    console.log('\n🛑 Stopping translation manager...');
    await manager.stop();

    console.log('\n🎉 Demo completed successfully!');
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  } finally {
    // Always stop the mock server
    console.log('\n🛑 Stopping mock server...');
    await mockServer.stop();
    console.log('✅ Mock server stopped');
  }
}

/**
 * Create test files for the demo
 */
async function createTestFiles(config: Config) {
  const testDir = config.watchPath;

  try {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });

    // Create base language file
    const baseLangPath = path.join(testDir, `${config.baseLanguage}.json`);
    const baseLangContent = {
      welcome: 'Welcome to our application',
      hello: 'Hello, how are you?',
      goodbye: 'Goodbye, see you later!',
      'Welcome to our application': 'Save',
      'Hello, how are you?': 'Cancel',
      'Goodbye, see you later!': 'Submit',
    };

    await fs.writeFile(baseLangPath, JSON.stringify(baseLangContent, null, 2));
    console.log(`📝 Created base language file: ${baseLangPath}`);

    // Create target language files with some existing translations
    for (const lang of config.targetLanguages) {
      const targetLangPath = path.join(testDir, `${lang}.json`);
      const targetLangContent = {
        welcome: '', // Empty - needs translation
        hello: '', // Empty - needs translation
        goodbye: '', // Empty - needs translation
        'Welcome to our application': '', // Empty - needs translation
        'Hello, how are you?': '', // Empty - needs translation
        'Goodbye, see you later!': '', // Empty - needs translation
      };

      await fs.writeFile(
        targetLangPath,
        JSON.stringify(targetLangContent, null, 2)
      );
      console.log(`📝 Created target language file: ${targetLangPath}`);
    }
  } catch (error) {
    console.error('❌ Failed to create test files:', error);
    throw error;
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntilIdle(manager: AutoTranslator, timeoutMs = 20000) {
  const start = Date.now();
  while (manager['isTranslating'] && manager['isTranslating']()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout waiting for translation to finish');
    }
    await sleep(200);
  }
}

async function translateFileWithRetry(
  autoTranslator: AutoTranslator,
  filePath: string,
  timeoutMs = 20000
) {
  try {
    return await autoTranslator.translateFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Translation already in progress')) {
      await waitUntilIdle(autoTranslator, timeoutMs);
      return await autoTranslator.translateFile(filePath);
    }
    throw error;
  }
}

// Run the demo if this file is executed directly (ESM-compatible check)
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export { runDemo };
