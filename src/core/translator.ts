import { EventEmitter } from "events";
import path from "path";
import fs from "fs/promises";
import { TranslationData, TranslationParser } from "./parser";
import { TranslationDiffDetector, DiffResult } from "./diff-detector";
import { Config } from "../types";

export interface TranslationRequest {
  key: string;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  context: string | undefined;
}

export interface TranslationResponse {
  key: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  success: boolean;
  error?: string;
  provider: string;
  timestamp: Date;
}

export interface TranslationBatch {
  requests: TranslationRequest[];
  responses: TranslationResponse[];
  startTime: Date;
  endTime?: Date;
  successCount: number;
  errorCount: number;
}

export interface TranslatorOptions {
  batchSize?: number;
  retryAttempts?: number;
  retryDelay?: number;
  rateLimitDelay?: number;
  preserveFormatting?: boolean;
  contextInjection?: boolean;
}

export abstract class TranslationProvider {
  abstract name: string;
  abstract translate(
    text: string,
    targetLanguage: string,
    context?: string
  ): Promise<string>;
  abstract validateConfig(config: any): boolean;
  abstract getSupportedLanguages(): string[];
}

export class TranslationOrchestrator extends EventEmitter {
  private parser: TranslationParser;
  private diffDetector: TranslationDiffDetector;
  private config: Config;
  private options: TranslatorOptions;
  private provider: TranslationProvider | null = null;
  private isProcessing = false;
  private currentBatch: TranslationBatch | null = null;

  constructor(config: Config, options: TranslatorOptions = {}) {
    super();
    this.config = config;
    this.options = {
      batchSize: 10,
      retryAttempts: 3,
      retryDelay: 1000,
      rateLimitDelay: 100,
      preserveFormatting: true,
      contextInjection: true,
      ...options,
    };

    this.parser = new TranslationParser({
      preserveFormatting: this.options.preserveFormatting || false,
    });

    this.diffDetector = new TranslationDiffDetector({
      ignoreWhitespace: true,
      deepComparison: true,
    });
  }

  /**
   * Set the translation provider
   */
  setProvider(provider: TranslationProvider): void {
    if (!provider.validateConfig(this.config.provider.config)) {
      throw new Error(`Invalid configuration for provider: ${provider.name}`);
    }
    this.provider = provider;
    this.emit("providerChanged", { provider: provider.name });
  }

  /**
   * Get current provider
   */
  getProvider(): TranslationProvider | null {
    return this.provider;
  }

  /**
   * Process translation file changes
   */
  async processFileChanges(
    baseLanguageFile: string,
    targetLanguageFiles: string[]
  ): Promise<TranslationBatch[]> {
    if (!this.provider) {
      throw new Error("No translation provider configured");
    }

    if (this.isProcessing) {
      throw new Error("Translation already in progress");
    }

    this.isProcessing = true;
    const batches: TranslationBatch[] = [];

    try {
      // Parse base language file
      const baseFile = await this.parser.parseFile(baseLanguageFile);

      // Check for changed keys by comparing with previous backup
      const changedKeys = await this.detectChangedKeys(
        baseLanguageFile,
        baseFile.data
      );

      // Process each target language file
      for (const targetFile of targetLanguageFiles) {
        try {
          const targetFileData = await this.parser.parseFile(targetFile);
          const batch = await this.processLanguagePair(
            baseFile.data,
            targetFileData.data,
            this.config.baseLanguage,
            targetFile,
            changedKeys
          );

          if (batch && batch.requests.length > 0) {
            batches.push(batch);
          }
        } catch (error) {
          this.emit("error", {
            file: targetFile,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Update the backup after successful processing
      if (batches.length > 0) {
        await this.updateBaseFileBackup(baseLanguageFile, baseFile.data);
      }
    } finally {
      this.isProcessing = false;
    }

    return batches;
  }

  /**
   * Process a single language pair
   */
  private async processLanguagePair(
    baseData: TranslationData,
    targetData: TranslationData,
    sourceLanguage: string,
    targetFilePath: string,
    changedKeys?: string[]
  ): Promise<TranslationBatch | null> {
    let keysNeedingTranslation: string[];

    if (changedKeys && changedKeys.length > 0) {
      // If we have changed keys from base file, only translate those
      // but only if they're missing/empty in the target file
      keysNeedingTranslation = changedKeys;
    } else {
      // Normal incremental translation - missing or empty keys
      keysNeedingTranslation =
        this.diffDetector.getKeysNeedingIncrementalTranslation(
          baseData,
          targetData
        );
    }

    if (keysNeedingTranslation.length === 0) {
      return null;
    }

    // Create translation requests
    const requests: TranslationRequest[] = keysNeedingTranslation.map((key) => {
      const text = this.parser.getNestedValue(baseData, key) || "";
      const context = this.options.contextInjection
        ? this.extractContext(baseData, key)
        : undefined;

      return {
        key,
        text,
        sourceLanguage,
        targetLanguage: this.detectTargetLanguage(targetFilePath),
        context: context || undefined,
      };
    });

    // Process in batches
    const batches: TranslationBatch[] = [];
    for (let i = 0; i < requests.length; i += this.options.batchSize!) {
      const batchRequests = requests.slice(i, i + this.options.batchSize!);
      const batch = await this.processBatch(batchRequests);
      batches.push(batch);

      // Rate limiting between batches
      if (i + this.options.batchSize! < requests.length) {
        await this.delay(this.options.rateLimitDelay!);
      }
    }

    return batches[0] || null; // Return first batch for now
  }

  /**
   * Process a batch of translation requests
   */
  private async processBatch(
    requests: TranslationRequest[]
  ): Promise<TranslationBatch> {
    const batch: TranslationBatch = {
      requests,
      responses: [],
      startTime: new Date(),
      successCount: 0,
      errorCount: 0,
    };

    this.currentBatch = batch;
    this.emit("batchStarted", { batch });

    for (const request of requests) {
      try {
        const response = await this.translateWithRetry(request);
        batch.responses.push(response);

        if (response.success) {
          batch.successCount++;
        } else {
          batch.errorCount++;
        }

        this.emit("translationCompleted", { request, response });
      } catch (error) {
        const response: TranslationResponse = {
          key: request.key,
          originalText: request.text,
          translatedText: "",
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          provider: this.provider?.name || "unknown",
          timestamp: new Date(),
        };

        batch.responses.push(response);
        batch.errorCount++;
        this.emit("translationFailed", { request, response, error });
      }
    }

    batch.endTime = new Date();
    this.emit("batchCompleted", { batch });
    this.currentBatch = null;

    return batch;
  }

  /**
   * Translate with retry logic
   */
  private async translateWithRetry(
    request: TranslationRequest
  ): Promise<TranslationResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.retryAttempts!; attempt++) {
      try {
        const translatedText = await this.provider!.translate(
          request.text,
          request.targetLanguage,
          request.context
        );

        return {
          key: request.key,
          originalText: request.text,
          translatedText,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          success: true,
          provider: this.provider!.name,
          timestamp: new Date(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.options.retryAttempts!) {
          await this.delay(this.options.retryDelay! * attempt);
        }
      }
    }

    throw lastError || new Error("Translation failed after all retry attempts");
  }

  /**
   * Extract context for a translation key
   */
  private extractContext(data: TranslationData, key: string): string {
    const keys = key.split(".");
    const parentKey = keys.slice(0, -1).join(".");

    if (parentKey) {
      const parentValue = this.parser.getNestedValue(data, parentKey);
      if (parentValue) {
        return `Context: ${parentValue}`;
      }
    }

    // Look for sibling keys
    const siblings: string[] = [];
    const parent = keys.slice(0, -1);
    const currentLevel =
      parent.length > 0 ? this.getNestedObject(data, parent) : data;

    if (currentLevel && typeof currentLevel === "object") {
      for (const [siblingKey, siblingValue] of Object.entries(currentLevel)) {
        if (
          typeof siblingValue === "string" &&
          siblingKey !== keys[keys.length - 1]
        ) {
          siblings.push(`${siblingKey}: ${siblingValue}`);
        }
      }
    }

    if (siblings.length > 0) {
      return `Related: ${siblings.slice(0, 3).join(", ")}`;
    }

    return "";
  }

  /**
   * Get nested object by path
   */
  private getNestedObject(data: TranslationData, path: string[]): any {
    let current: any = data;

    for (const key of path) {
      if (current && typeof current === "object" && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }

    return current;
  }

  /**
   * Detect target language from file path
   */
  private detectTargetLanguage(filePath: string): string {
    // Extract filename from path (e.g., "/path/to/de.json" -> "de.json")
    const fileName = filePath.split("/").pop() || "";

    // Remove extension to get language code (e.g., "de.json" -> "de")
    const languageCode = fileName.replace(".json", "");

    // Validate that the detected language is in the configured target languages
    if (this.config.targetLanguages.includes(languageCode)) {
      return languageCode;
    }

    // Fallback to first configured target language if detection fails
    console.warn(
      `Could not detect target language from file path: ${filePath}. Using fallback: ${this.config.targetLanguages[0]}`
    );
    return this.config.targetLanguages[0] || "en";
  }

  /**
   * Get current batch status
   */
  getCurrentBatch(): TranslationBatch | null {
    return this.currentBatch;
  }

  /**
   * Check if translation is in progress
   */
  isTranslating(): boolean {
    return this.isProcessing;
  }

  /**
   * Stop current translation process
   */
  stop(): void {
    this.isProcessing = false;
    this.currentBatch = null;
    this.emit("stopped");
  }

  /**
   * Detect which keys have changed in the base language file
   */
  private async detectChangedKeys(
    baseLanguageFile: string,
    currentBaseData: TranslationData
  ): Promise<string[]> {
    try {
      const backupFile = this.getBackupFilePath(baseLanguageFile);
      const backupExists = await this.fileExists(backupFile);

      if (!backupExists) {
        // No backup exists, treat all keys as "new" for first run
        return this.diffDetector["extractAllKeys"](currentBaseData);
      }

      const backupContent = await this.readFile(backupFile);
      const previousBaseData = JSON.parse(backupContent);

      return this.diffDetector.getChangedKeys(
        currentBaseData,
        previousBaseData
      );
    } catch (error) {
      // If backup is corrupted or missing, treat all keys as new
      console.warn(
        "Could not read backup file, treating all keys as new:",
        error
      );
      return this.diffDetector["extractAllKeys"](currentBaseData);
    }
  }

  /**
   * Update the backup file with current base language data
   */
  private async updateBaseFileBackup(
    baseLanguageFile: string,
    baseData: TranslationData
  ): Promise<void> {
    try {
      const backupFile = this.getBackupFilePath(baseLanguageFile);
      const backupDir = path.dirname(backupFile);

      // Ensure backup directory exists
      await this.ensureDirectoryExists(backupDir);

      // Write backup file
      await this.writeFile(backupFile, JSON.stringify(baseData, null, 2));
    } catch (error) {
      console.warn("Could not create backup file:", error);
      // Don't throw - backup failure shouldn't stop translation
    }
  }

  /**
   * Get the backup file path for a base language file
   */
  private getBackupFilePath(baseLanguageFile: string): string {
    const fileName = path.basename(
      baseLanguageFile,
      path.extname(baseLanguageFile)
    );
    const dir = path.dirname(baseLanguageFile);
    return path.join(dir, ".backups", `${fileName}.backup.json`);
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file
   */
  private async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
  }

  /**
   * Write a file
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    return fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as any).code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get translation statistics
   */
  getStats(): {
    isProcessing: boolean;
    currentBatch: TranslationBatch | null;
    provider: string | null;
  } {
    return {
      isProcessing: this.isProcessing,
      currentBatch: this.currentBatch,
      provider: this.provider?.name || null,
    };
  }
}

export default TranslationOrchestrator;
