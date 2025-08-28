#!/usr/bin/env node

import { AutoTranslator } from '../auto-translator';
import { Config } from '../../types';
import path from 'path';
import fs from 'fs/promises';

/**
 * Simple test runner to demonstrate the AutoTranslator functionality
 */
async function runDemo() {
  console.log('🚀 Starting Translation Manager Demo\n');

  // Create test configuration
  const config: Config = {
    watchPath: './test-locales',
    baseLanguage: 'en',
    targetLanguages: ['fr', 'de'],
    filePattern: '.*\\.json$',
    provider: {
      type: 'openai',
      config: {
        apiKey: 'demo-key',
        model: 'gpt-3.5-turbo',
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
    await new Promise(resolve => setTimeout(resolve, 1000));

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

    // Simulate a file change by manually triggering translation
    console.log('\n🔄 Manually triggering translation...');
    const result = await manager.translateFile(
      path.join(config.watchPath, 'en.json')
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
      'common.buttons.save': 'Save',
      'common.buttons.cancel': 'Cancel',
      'common.buttons.submit': 'Submit',
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
        'common.buttons.save': '', // Empty - needs translation
        'common.buttons.cancel': '', // Empty - needs translation
        'common.buttons.submit': '', // Empty - needs translation
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

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

export { runDemo };
