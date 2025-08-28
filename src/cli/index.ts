#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import packageJson from '../../package.json';

// Import core components
import {
  AutoTranslator,
  ConfigValidator,
  Logger,
  defaultLogger,
} from '../index.js';

interface CLIConfig {
  watchPath: string;
  baseLanguage: string;
  targetLanguages: string[];
  filePattern: string;
  provider: {
    type: 'openai' | 'anthropic' | 'local';
    config: Record<string, any>;
  };
  preserveFormatting: boolean;
  contextInjection: boolean;
  batchSize: number;
  retryAttempts: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

class TranslationCLI {
  private program: Command;
  private logger: Logger;
  private configValidator: ConfigValidator;
  private autoTranslator: AutoTranslator | null = null;
  private config: CLIConfig | null = null;

  constructor() {
    this.program = new Command();
    this.logger = defaultLogger;
    this.configValidator = new ConfigValidator();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name('i18n-copilot')
      .description('AI-powered translation file watcher and translator')
      .version(packageJson.version);

    // Watch command
    this.program
      .command('watch')
      .description('Start watching translation files for changes')
      .option(
        '-c, --config <path>',
        'Path to configuration file',
        './translation-config.json'
      )
      .option('-p, --path <path>', 'Directory to watch for translation files')
      .option('-b, --base <language>', 'Base language code (e.g., en)')
      .option(
        '-t, --targets <languages>',
        'Target language codes (comma-separated, e.g., fr,de,es)'
      )
      .option(
        '-f, --pattern <pattern>',
        'File pattern to watch (e.g., ".*\\.json$")'
      )
      .option(
        '--provider <type>',
        'LLM provider type (openai, anthropic, local)'
      )
      .option('--api-key <key>', 'API key for the provider')
      .option('--model <model>', 'Model to use for translation')
      .option(
        '--log-level <level>',
        'Log level (debug, info, warn, error)',
        'info'
      )
      .action(async options => {
        await this.watchCommand(options);
      });

    // Validate command
    this.program
      .command('validate')
      .description('Validate configuration file')
      .requiredOption('-c, --config <path>', 'Path to configuration file')
      .action(async options => {
        await this.validateCommand(options);
      });

    // Init command
    this.program
      .command('init')
      .description('Initialize a new translation project')
      .option('-p, --path <path>', 'Project directory', './translation-project')
      .option('--base <language>', 'Base language code', 'en')
      .option(
        '--targets <languages>',
        'Target language codes (comma-separated)',
        'fr,de,es'
      )
      .option('--provider <type>', 'LLM provider type', 'openai')
      .action(async options => {
        await this.initCommand(options);
      });

    // Status command
    this.program
      .command('status')
      .description('Show current translation status')
      .action(async () => {
        await this.statusCommand();
      });

    // Stop command
    this.program
      .command('stop')
      .description('Stop the translation watcher')
      .action(async () => {
        await this.stopCommand();
      });

    // Translate command
    this.program
      .command('translate')
      .description('Manually translate a specific file')
      .argument('<file>', 'Path to the file to translate')
      .option(
        '-c, --config <path>',
        'Path to configuration file',
        './translation-config.json'
      )
      .action(async (file, options) => {
        await this.translateCommand(file, options);
      });
  }

  private async watchCommand(options: any): Promise<void> {
    try {
      this.logger.setLevel(options.logLevel);
      this.logger.info('Starting translation watcher...');

      // Load or create configuration
      this.config = await this.loadOrCreateConfig(options);

      // Validate configuration
      const validation = this.configValidator.validateConfig(this.config);
      if (!validation.isValid) {
        this.logger.error(
          'Configuration validation failed, path: ' +
            options.config +
            ' working directory: ' +
            process.cwd()
        );
        console.log(this.configValidator.generateValidationReport(validation));
        process.exit(1);
      }

      if (validation.warnings.length > 0) {
        this.logger.warn('Configuration warnings detected');
        validation.warnings.forEach(warning => this.logger.warn(warning));
      }

      // Initialize and start translation manager
      await this.initializeAutoTranslator();

      this.logger.info('Translation watcher started successfully');
      this.logger.info(`Watching: ${this.config.watchPath}`);
      this.logger.info(`Base language: ${this.config.baseLanguage}`);
      this.logger.info(
        `Target languages: ${this.config.targetLanguages.join(', ')}`
      );
      this.logger.info(`Provider: ${this.config.provider.type}`);

      // Keep the process running
      process.on('SIGINT', async () => {
        this.logger.info('Received SIGINT, shutting down...');
        await this.cleanup();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        this.logger.info('Received SIGTERM, shutting down...');
        await this.cleanup();
        process.exit(0);
      });
    } catch (error) {
      this.logger.error(
        'Failed to start translation watcher',
        error instanceof Error ? error : new Error(String(error))
      );
      process.exit(1);
    }
  }

  private async validateCommand(options: any): Promise<void> {
    try {
      const configPath = path.resolve(options.config);
      this.logger.info(`Validating configuration: ${configPath}`);

      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      const validation = this.configValidator.validateConfig(config);
      console.log(this.configValidator.generateValidationReport(validation));

      if (validation.isValid) {
        this.logger.info('✅ Configuration is valid!');
        process.exit(0);
      } else {
        this.logger.error('❌ Configuration has errors');
        process.exit(1);
      }
    } catch (error) {
      this.logger.error(
        'Failed to validate configuration',
        error instanceof Error ? error : new Error(String(error))
      );
      process.exit(1);
    }
  }

  private async initCommand(options: any): Promise<void> {
    try {
      const projectPath = path.resolve(options.path);
      this.logger.info(`Initializing translation project: ${projectPath}`);

      // Create project directory
      await fs.mkdir(projectPath, { recursive: true });

      // Create configuration file
      const config: CLIConfig = {
        watchPath: './locales',
        baseLanguage: options.base,
        targetLanguages: options.targets
          .split(',')
          .map((lang: string) => lang.trim()),
        filePattern: '.*\\.json$',
        provider: {
          type: options.provider as 'openai' | 'anthropic' | 'local',
          config: {
            apiKey: 'YOUR_API_KEY_HERE',
            model:
              options.provider === 'openai'
                ? 'gpt-3.5-turbo'
                : options.provider === 'anthropic'
                  ? 'claude-3-sonnet-20240229'
                  : 'llama2:7b',
          },
        },
        preserveFormatting: true,
        contextInjection: true,
        batchSize: 10,
        retryAttempts: 3,
        logLevel: 'info',
      };

      const configPath = path.join(projectPath, 'translation-config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Create locales directory structure
      const localesPath = path.join(projectPath, 'locales');
      await fs.mkdir(localesPath, { recursive: true });

      // Create base language file
      const baseLangPath = path.join(localesPath, `${options.base}.json`);
      const baseLangContent = {
        welcome: 'Welcome',
        hello: 'Hello',
        goodbye: 'Goodbye',
      };
      await fs.writeFile(
        baseLangPath,
        JSON.stringify(baseLangContent, null, 2)
      );

      // Create target language files
      for (const lang of config.targetLanguages) {
        const targetLangPath = path.join(localesPath, `${lang}.json`);
        const targetLangContent = {
          welcome: '',
          hello: '',
          goodbye: '',
        };
        await fs.writeFile(
          targetLangPath,
          JSON.stringify(targetLangContent, null, 2)
        );
      }

      // Create README
      const readmePath = path.join(projectPath, 'README.md');
      const readmeContent = `# Translation Project

This project uses translation-watcher-ai to automatically translate files.

## Setup

1. Install dependencies: \`npm install\`
2. Configure your API key in \`translation-config.json\`
3. Run: \`translation-watcher watch\`

## File Structure

\`\`\`
locales/
├── ${options.base}.json     # Base language
├── ${config.targetLanguages.join('.json     # Target languages\n├── ')}.json
\`\`\`

## Commands

- \`translation-watcher watch\` - Start watching for changes
- \`translation-watcher validate -c translation-config.json\` - Validate configuration
`;

      await fs.writeFile(readmePath, readmeContent);

      this.logger.info('✅ Translation project initialized successfully!');
      this.logger.info(`Project created at: ${projectPath}`);
      this.logger.info(`Configuration file: ${configPath}`);
      this.logger.info(`Base language: ${options.base}`);
      this.logger.info(
        `Target languages: ${config.targetLanguages.join(', ')}`
      );
      this.logger.info(`Provider: ${options.provider}`);
      this.logger.info('');
      this.logger.info('Next steps:');
      this.logger.info(`1. cd ${projectPath}`);
      this.logger.info('2. Edit translation-config.json with your API key');
      this.logger.info('3. Run: translation-watcher watch');
    } catch (error) {
      this.logger.error(
        'Failed to initialize project',
        error instanceof Error ? error : new Error(String(error))
      );
      process.exit(1);
    }
  }

  private async statusCommand(): Promise<void> {
    if (!this.autoTranslator) {
      this.logger.info('No translation manager is currently running');
      return;
    }

    const status = this.autoTranslator.getStatus();

    console.log(chalk.blue('Translation Manager Status'));
    console.log(chalk.blue('========================='));
    console.log(
      `Status: ${
        status.isRunning ? chalk.green('Running') : chalk.red('Stopped')
      }`
    );
    console.log(`Watch Path: ${status.config.watchPath}`);
    console.log(`Base Language: ${status.config.baseLanguage}`);
    console.log(
      `Target Languages: ${status.config.targetLanguages.join(', ')}`
    );
    console.log(`Provider: ${status.config.provider}`);
    console.log(
      `Translating: ${
        status.isProcessing ? chalk.yellow('Yes') : chalk.green('No')
      }`
    );

    if (status.orchestratorStats.currentBatch) {
      const batch = status.orchestratorStats.currentBatch;
      console.log(`Current Batch: ${batch.requests.length} requests`);
      console.log(
        `Progress: ${batch.successCount + batch.errorCount}/${
          batch.requests.length
        }`
      );
      console.log(
        `Success: ${batch.successCount}, Errors: ${batch.errorCount}`
      );
    }
  }

  private async stopCommand(): Promise<void> {
    if (!this.autoTranslator) {
      this.logger.info('No translation manager is currently running');
      return;
    }

    this.logger.info('Stopping translation manager...');
    await this.cleanup();
    this.logger.info('Translation manager stopped');
    process.exit(0);
  }

  private async translateCommand(file: string, options: any): Promise<void> {
    try {
      this.logger.info(`Translating file: ${file}`);

      // Load configuration
      this.config = await this.loadOrCreateConfig(options);

      // Validate configuration
      const validation = this.configValidator.validateConfig(this.config);
      if (!validation.isValid) {
        this.logger.error('Configuration validation failed');
        console.log(this.configValidator.generateValidationReport(validation));
        process.exit(1);
      }

      // Initialize translation manager
      await this.initializeAutoTranslator();

      // Perform translation
      const result = await this.autoTranslator!.translateFile(file);

      if (result.success) {
        this.logger.info('✅ Translation completed successfully!');
        this.logger.info(`Batches processed: ${result.batchesProcessed}`);
        this.logger.info(`Total translations: ${result.totalTranslations}`);
        this.logger.info(`Files updated: ${result.updatedFiles.join(', ')}`);
      } else {
        this.logger.error('❌ Translation failed');
        result.errors.forEach((error: string) =>
          this.logger.error(`- ${error}`)
        );
        process.exit(1);
      }

      // Clean up
      await this.cleanup();
    } catch (error) {
      this.logger.error(
        'Translation command failed',
        error instanceof Error ? error : new Error(String(error))
      );
      process.exit(1);
    }
  }

  private async loadOrCreateConfig(options: any): Promise<CLIConfig> {
    try {
      // Try to load from config file
      if (options.config) {
        const configPath = path.resolve(options.config);
        const configContent = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(configContent);
      }
    } catch {
      // Config file not found or invalid, create from CLI options
      this.logger.info(
        'Config file not found, creating from CLI options, path: ' +
          options.config +
          ' working directory: ' +
          process.cwd()
      );
    }

    // Create config from CLI options
    const config: CLIConfig = {
      watchPath: options.path || './locales',
      baseLanguage: options.base || 'en',
      targetLanguages: options.targets
        ? options.targets.split(',').map((lang: string) => lang.trim())
        : ['fr', 'de'],
      filePattern: options.pattern || '.*\\.json$',
      provider: {
        type: options.provider || 'openai',
        config: {
          apiKey:
            options.apiKey ||
            process.env[
              `${(options.provider || 'openai').toUpperCase()}_API_KEY`
            ],
          model: options.model,
        },
      },
      preserveFormatting: true,
      contextInjection: true,
      batchSize: 10,
      retryAttempts: 3,
      logLevel: options.logLevel || 'info',
    };

    return config;
  }

  private async initializeAutoTranslator(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    // Create translation manager
    this.autoTranslator = new AutoTranslator(this.config, {
      logger: this.logger,
      autoStart: false,
    });

    // Set up event listeners
    this.autoTranslator.on('started', () => {
      this.logger.info('Translation manager started');
    });

    this.autoTranslator.on('stopped', () => {
      this.logger.info('Translation manager stopped');
    });

    this.autoTranslator.on('baseLanguageChanged', (event: any) => {
      this.logger.info(`Base language file changed: ${event.filePath}`);
    });

    this.autoTranslator.on('translationCompleted', (data: any) => {
      this.logger.info(`Translation completed: ${data.response.key}`);
    });

    this.autoTranslator.on('translationFailed', (data: any) => {
      this.logger.error(
        `Translation failed: ${data.response.key} - ${data.response.error}`
      );
    });

    this.autoTranslator.on('error', (error: any) => {
      this.logger.error('Translation manager error:', error);
    });

    // Start the manager
    await this.autoTranslator.start();
  }

  private async cleanup(): Promise<void> {
    if (this.autoTranslator) {
      await this.autoTranslator.stop();
      this.autoTranslator = null;
    }
  }

  public run(): void {
    this.program.parse();
  }
}

// Export the CLI class for programmatic use
export { TranslationCLI };

// Run the CLI
const cli = new TranslationCLI();
cli.run();
