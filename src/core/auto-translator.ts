import { EventEmitter } from "events";
import path from "path";
import fs from "fs/promises";
import { TranslationOrchestrator } from "./translator";
import { TranslationWatcher } from "./watcher";
import { Config } from "../types";
import { defaultLogger, Logger } from "../utils/logger";

export interface AutoTranslatorOptions {
  logger?: Logger;
  autoStart?: boolean;
}

export interface TranslationResult {
  success: boolean;
  batchesProcessed: number;
  totalTranslations: number;
  errors: string[];
  updatedFiles: string[];
}

export class AutoTranslator extends EventEmitter {
  private orchestrator: TranslationOrchestrator;
  private watcher: TranslationWatcher;
  private config: Config;
  private logger: Logger;
  private isRunning = false;
  private isProcessing = false;

  constructor(config: Config, options: AutoTranslatorOptions = {}) {
    super();
    this.config = config;
    this.logger = options.logger || defaultLogger;

    this.orchestrator = new TranslationOrchestrator(config);
    this.watcher = new TranslationWatcher(config);

    this.setupEventListeners();

    if (options.autoStart) {
      this.start();
    }
  }

  /**
   * Start the translation manager
   */
  async start(): Promise<void> {
    if (this.isActive()) {
      throw new Error("Translation manager is already running");
    }

    try {
      // Set up the provider
      await this.setupProvider();

      // Start the watcher
      await this.watcher.start();

      this.isRunning = true;
      this.emit("started");
      this.logger.info("Translation manager started successfully");
    } catch (error) {
      this.logger.error("Failed to start translation manager", error as Error);
      throw error;
    }
  }

  /**
   * Stop the translation manager
   */
  async stop(): Promise<void> {
    if (!this.isActive()) {
      return;
    }

    try {
      await this.watcher.stop();
      this.isRunning = false;
      this.emit("stopped");
      this.logger.info("Translation manager stopped");
    } catch (error) {
      // Even if stopping fails, mark as not running to prevent inconsistent state
      this.isRunning = false;
      this.logger.error("Failed to stop translation manager", error as Error);
      throw error;
    }
  }

  /**
   * Check if the manager is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Check if translation is currently in progress
   */
  isTranslating(): boolean {
    return this.isProcessing;
  }

  /**
   * Manually trigger translation for a specific file
   */
  async translateFile(filePath: string): Promise<TranslationResult> {
    if (!this.isActive()) {
      throw new Error("Translation manager is not running");
    }

    if (this.isProcessing) {
      throw new Error("Translation already in progress");
    }

    this.isProcessing = true;
    const result: TranslationResult = {
      success: false,
      batchesProcessed: 0,
      totalTranslations: 0,
      errors: [],
      updatedFiles: [],
    };

    try {
      // Verify it's a base language file
      const language = this.detectLanguageFromPath(filePath);
      if (language !== this.config.baseLanguage) {
        throw new Error(`File ${filePath} is not a base language file`);
      }

      // Get target language files
      const targetFiles = await this.getTargetLanguageFiles();
      if (targetFiles.length === 0) {
        throw new Error("No target language files found");
      }

      this.logger.info(
        `Processing translations for ${targetFiles.length} target languages`
      );

      // Process translations
      const batches = await this.orchestrator.processFileChanges(
        filePath,
        targetFiles
      );

      if (batches.length > 0) {
        // Update target files with translations
        await this.updateTargetFiles(batches, targetFiles);

        result.success = true;
        result.batchesProcessed = batches.length;
        result.totalTranslations = batches.reduce(
          (sum, batch) => sum + batch.responses.length,
          0
        );
        result.updatedFiles = targetFiles;

        this.logger.info(
          `Translation completed(): ${batches.length} batches processed`
        );
      } else {
        result.success = true;
        this.logger.info("No translations needed - files are up to date");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
      this.logger.error("Translation failed", error as Error);
    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  /**
   * Get current status and statistics
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      config: {
        baseLanguage: this.config.baseLanguage,
        targetLanguages: this.config.targetLanguages,
        watchPath: this.config.watchPath,
        provider: this.config.provider.type,
      },
      watcherStats: this.watcher.getStats(),
      orchestratorStats: this.orchestrator.getStats(),
    };
  }

  /**
   * Set up the translation provider
   */
  private async setupProvider(): Promise<void> {
    try {
      let provider: any;

      switch (this.config.provider.type) {
        case "openai":
          const { OpenAIProvider } = await import("../providers/openai");
          provider = new OpenAIProvider(this.config.provider.config as any);
          break;
        case "anthropic":
          const { AnthropicProvider } = await import("../providers/anthropic");
          provider = new AnthropicProvider(this.config.provider.config as any);
          break;
        case "local":
          const { LocalProvider } = await import("../providers/local");
          provider = new LocalProvider(this.config.provider.config as any);
          break;
        default:
          throw new Error(
            `Unsupported provider type: ${this.config.provider.type}`
          );
      }

      this.orchestrator.setProvider(provider);
      this.logger.info(
        `Provider ${this.config.provider.type} initialized successfully`
      );
    } catch (error) {
      this.logger.error("Failed to initialize provider", error as Error);
      throw error;
    }
  }

  /**
   * Set up event listeners for the watcher
   */
  private setupEventListeners(): void {
    this.watcher.on("fileChange", async (event) => {
      if (
        event.type === "change" &&
        event.language === this.config.baseLanguage
      ) {
        this.logger.info(`Base language file changed: ${event.filePath}`);

        // Emit the event for external listeners
        this.emit("baseLanguageChanged", event);

        // Auto-translate if enabled
        if (this.isActive() && !this.isTranslating()) {
          try {
            await this.translateFile(event.filePath);
          } catch (error) {
            this.logger.error("Auto-translation failed", error as Error);
          }
        }
      }
    });

    this.watcher.on("error", (error) => {
      this.emit("error", error);
      this.logger.error("Watcher error", error);
    });

    this.orchestrator.on("translationCompleted", (data) => {
      this.emit("translationCompleted", data);
    });

    this.orchestrator.on("translationFailed", (data) => {
      this.emit("translationFailed", data);
    });
  }

  /**
   * Get target language files
   */
  private async getTargetLanguageFiles(): Promise<string[]> {
    const targetFiles: string[] = [];

    for (const lang of this.config.targetLanguages) {
      const filePath = path.join(this.config.watchPath, `${lang}.json`);
      try {
        await fs.access(filePath);
        targetFiles.push(filePath);
      } catch {
        this.logger.warn(`Target language file not found: ${filePath}`);
      }
    }

    return targetFiles;
  }

  /**
   * Update target language files with translations
   */
  private async updateTargetFiles(
    batches: any[],
    targetFiles: string[]
  ): Promise<void> {
    try {
      // Group responses by target language
      const translationsByLanguage = new Map<string, Map<string, string>>();

      // Initialize maps for each target language
      for (const targetFile of targetFiles) {
        const lang = path.basename(targetFile, path.extname(targetFile));
        translationsByLanguage.set(lang, new Map());
      }

      // Extract translations from all batches
      for (const batch of batches) {
        for (const response of batch.responses) {
          if (response.success && response.translatedText) {
            const lang = response.targetLanguage;
            if (translationsByLanguage.has(lang)) {
              translationsByLanguage
                .get(lang)!
                .set(response.key, response.translatedText);
            }
          }
        }
      }

      // Update each target language file
      for (const [lang, translations] of translationsByLanguage) {
        if (translations.size === 0) continue;

        const targetFilePath = path.join(this.config.watchPath, `${lang}.json`);

        try {
          // Read existing file to preserve structure
          let existingData = {};
          try {
            const existingContent = await fs.readFile(targetFilePath, "utf-8");
            existingData = JSON.parse(existingContent);
          } catch {
            // File doesn't exist or is invalid, start with empty object
            existingData = {};
          }

          // Update with new translations
          for (const [key, translatedText] of translations) {
            this.setNestedValue(existingData, key, translatedText);
          }

          // Write updated file
          await fs.writeFile(
            targetFilePath,
            JSON.stringify(existingData, null, 2)
          );
          this.logger.info(
            `Updated ${lang}.json with ${translations.size} translations`
          );
        } catch (error) {
          this.logger.error(`Failed to update ${lang}.json:`, error as Error);
        }
      }

      this.logger.info("All target language files updated successfully");
    } catch (error) {
      this.logger.error("Failed to update target files:", error as Error);
    }
  }

  /**
   * Set nested value in object by dot notation path
   */
  private setNestedValue(obj: any, path: string, value: string): void {
    const keys = path
      .split(".")
      .filter((key): key is string => key !== undefined && key !== "");
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
  }

  /**
   * Detect language from file path
   */
  private detectLanguageFromPath(filePath: string): string | null {
    const fileName = path.basename(filePath, path.extname(filePath));

    // Try to extract language from filename (e.g., en.json, fr.json)
    const languageMatch = fileName.match(/^([a-z]{2,3}(-[A-Z]{2})?)$/);
    if (languageMatch) {
      return languageMatch[1] || null;
    }

    // Try to extract from directory structure (e.g., /locales/en/file.json)
    const pathParts = filePath.split(path.sep);
    const localesIndex = pathParts.findIndex((part) =>
      ["locales", "i18n", "translations", "lang"].includes(part.toLowerCase())
    );

    if (localesIndex !== -1 && pathParts[localesIndex + 1]) {
      const potentialLang = pathParts[localesIndex + 1];
      if (potentialLang && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(potentialLang)) {
        return potentialLang;
      }
    }

    return null;
  }
}
