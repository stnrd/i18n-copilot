import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { Config } from '../types/index';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  language: string;
  timestamp: Date;
}

export interface WatcherOptions {
  debounceMs?: number;
  ignorePatterns?: string[];
  followSymlinks?: boolean;
  awaitWriteFinish?: boolean;
  debug?: boolean; // Add debug option
}

export class TranslationWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private config: Config;
  private options: WatcherOptions;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private isWatching = false;

  constructor(config: Config, options: WatcherOptions = {}) {
    super();
    this.config = config;
    this.options = {
      debounceMs: 300,
      ignorePatterns: ['**/node_modules/**', '**/.git/**', '**/*.backup'],
      followSymlinks: false,
      awaitWriteFinish: true,
      debug: false, // Default debug mode
      ...options,
    };

    // Log constructor details
    this.debugLog('TranslationWatcher constructor called', {
      watchPath: this.config.watchPath,
      baseLanguage: this.config.baseLanguage,
      targetLanguages: this.config.targetLanguages,
      filePattern: this.config.filePattern,
      options: this.options,
    });
  }

  /**
   * Debug logging method
   */
  private debugLog(message: string, data?: any): void {
    if (this.options.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[WATCHER DEBUG ${timestamp}] ${message}`, data ? data : '');
    }
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    this.debugLog('Starting watcher...');

    if (this.isWatching) {
      const error = 'Watcher is already running';
      this.debugLog('Start failed: ' + error);
      throw new Error(error);
    }

    try {
      this.debugLog('Validating watch path...');
      // Validate watch path exists
      await this.validateWatchPath();

      this.debugLog('Initializing chokidar watcher...');
      // Initialize chokidar watcher
      const watchOptions: any = {
        persistent: true,
        ignoreInitial: false,
      };

      if (this.options.ignorePatterns) {
        watchOptions.ignored = this.options.ignorePatterns;
        this.debugLog('Using ignore patterns:', this.options.ignorePatterns);
      }
      if (this.options.followSymlinks !== undefined) {
        watchOptions.followSymlinks = this.options.followSymlinks;
        this.debugLog('Follow symlinks:', this.options.followSymlinks);
      }
      if (this.options.awaitWriteFinish) {
        watchOptions.awaitWriteFinish = {
          stabilityThreshold: 100,
          pollInterval: 100,
        };
        this.debugLog(
          'Using awaitWriteFinish with stabilityThreshold: 100, pollInterval: 100'
        );
      }

      this.debugLog('Chokidar watch options:', watchOptions);
      this.watcher = chokidar.watch(this.config.watchPath, watchOptions);

      // Set up event listeners
      this.debugLog('Setting up event listeners...');
      this.setupEventListeners();

      this.isWatching = true;
      this.emit('started', { watchPath: this.config.watchPath });

      this.debugLog('Watcher started successfully');
      console.log(`Started watching: ${this.config.watchPath}`);
    } catch (error) {
      this.debugLog('Start failed with error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    this.debugLog('Stopping watcher...');

    if (!this.isWatching || !this.watcher) {
      this.debugLog('Watcher not running, nothing to stop');
      return;
    }

    try {
      // Clear all debounce timers
      this.debugLog('Clearing debounce timers...');
      this.clearAllDebounceTimers();

      // Close the watcher
      this.debugLog('Closing chokidar watcher...');
      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;

      this.emit('stopped');
      this.debugLog('Watcher stopped successfully');
      console.log('Stopped watching for file changes');
    } catch (error) {
      this.debugLog('Stop failed with error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check if watcher is currently running
   */
  isRunning(): boolean {
    const running = this.isWatching;
    this.debugLog(`isRunning() called, returning: ${running}`);
    return running;
  }

  /**
   * Get current watch statistics
   */
  getStats(): {
    isWatching: boolean;
    watchPath: string;
    targetLanguages: string[];
  } {
    const stats = {
      isWatching: this.isWatching,
      watchPath: this.config.watchPath,
      targetLanguages: this.config.targetLanguages,
    };
    this.debugLog('getStats() called, returning:', stats);
    return stats;
  }

  /**
   * Add additional ignore patterns
   */
  addIgnorePatterns(patterns: string[]): void {
    this.debugLog('Adding ignore patterns:', patterns);
    if (this.watcher) {
      this.watcher.add(patterns);
    }
    this.options.ignorePatterns = [
      ...(this.options.ignorePatterns || []),
      ...patterns,
    ];
    this.debugLog('Updated ignore patterns:', this.options.ignorePatterns);
  }

  /**
   * Remove ignore patterns
   */
  removeIgnorePatterns(patterns: string[]): void {
    this.debugLog('Removing ignore patterns:', patterns);
    this.options.ignorePatterns =
      this.options.ignorePatterns?.filter(
        pattern => !patterns.includes(pattern)
      ) || [];
    this.debugLog('Updated ignore patterns:', this.options.ignorePatterns);
  }

  private async validateWatchPath(): Promise<void> {
    this.debugLog(`Validating watch path: ${this.config.watchPath}`);

    try {
      const stats = await fs.stat(this.config.watchPath);
      this.debugLog('Watch path stats:', {
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid,
        atime: stats.atime,
        mtime: stats.mtime,
        ctime: stats.ctime,
      });

      if (!stats.isDirectory()) {
        const error = `Watch path must be a directory: ${this.config.watchPath}`;
        this.debugLog('Validation failed: ' + error);
        throw new Error(error);
      }

      this.debugLog('Watch path validation successful');
    } catch (error) {
      this.debugLog('Validation error:', error);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const errorMsg = `Watch path does not exist: ${this.config.watchPath}`;
        this.debugLog('Validation failed: ' + errorMsg);
        throw new Error(errorMsg);
      }
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.watcher) {
      this.debugLog('setupEventListeners: No watcher available');
      return;
    }

    this.debugLog('Setting up chokidar event listeners...');

    // File added
    this.watcher.on('add', (filePath: string) => {
      this.debugLog(`Chokidar 'add' event: ${filePath}`);
      this.handleFileChange('add', filePath);
    });

    // File changed
    this.watcher.on('change', (filePath: string) => {
      this.debugLog(`Chokidar 'change' event: ${filePath}`);
      this.handleFileChange('change', filePath);
    });

    // File removed
    this.watcher.on('unlink', (filePath: string) => {
      this.debugLog(`Chokidar 'unlink' event: ${filePath}`);
      this.handleFileChange('unlink', filePath);
    });

    // Watcher errors
    this.watcher.on('error', (error: unknown) => {
      this.debugLog('Chokidar error event:', error);
      if (error instanceof Error) {
        this.emit('error', error);
      } else {
        this.emit('error', new Error(String(error)));
      }
    });

    // Watcher ready
    this.watcher.on('ready', () => {
      this.debugLog("Chokidar 'ready' event fired");
      this.emit('ready');
      console.log('File watcher is ready');
    });

    // Additional chokidar events for debugging
    this.watcher.on('raw', (event: string, path: string, details: any) => {
      this.debugLog(`Chokidar 'raw' event: ${event} ${path}`, details);
    });

    this.watcher.on('all', (event: string, path: string) => {
      this.debugLog(`Chokidar 'all' event: ${event} ${path}`);
    });

    this.debugLog('Event listeners setup complete');
  }

  private handleFileChange(
    type: 'add' | 'change' | 'unlink',
    filePath: string
  ): void {
    this.debugLog(`handleFileChange called: ${type} ${filePath}`);

    // Check if file matches our translation file pattern
    const isTranslationFile = this.isTranslationFile(filePath);
    this.debugLog(`File ${filePath} isTranslationFile: ${isTranslationFile}`);

    if (!isTranslationFile) {
      this.debugLog(`Skipping ${filePath} - not a translation file`);
      return;
    }

    // Determine language from file path
    const language = this.detectLanguageFromPath(filePath);
    this.debugLog(`Detected language for ${filePath}: ${language}`);

    if (!language) {
      this.debugLog(`Skipping ${filePath} - could not detect language`);
      return;
    }

    // Only process base language files for translation
    if (language !== this.config.baseLanguage) {
      this.debugLog(
        `Skipping ${filePath} - language ${language} is not base language ${this.config.baseLanguage}`
      );
      return;
    }

    this.debugLog(`Processing file change: ${type} ${filePath} (${language})`);
    // Debounce the change event
    this.debounceFileChange(type, filePath, language);
  }

  private isTranslationFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath);

    this.debugLog(`Checking if file is translation file: ${fileName}`, {
      extension,
      filePattern: this.config.filePattern,
    });

    // Check if file matches the configured pattern
    if (this.config.filePattern) {
      const pattern = new RegExp(this.config.filePattern);
      const matchesPattern = pattern.test(fileName);
      this.debugLog(
        `File ${fileName} matches pattern ${this.config.filePattern}: ${matchesPattern}`
      );

      if (!matchesPattern) {
        return false;
      }
    }

    // Default check for common translation file extensions
    const validExtensions = ['.json', '.yaml', '.yml', '.js', '.ts'];
    const hasValidExtension = validExtensions.includes(extension);
    this.debugLog(
      `File ${fileName} has valid extension: ${hasValidExtension} (${extension})`
    );

    return hasValidExtension;
  }

  private detectLanguageFromPath(filePath: string): string | null {
    const fileName = path.basename(filePath, path.extname(filePath));
    this.debugLog(`Detecting language from path: ${filePath}`, { fileName });

    // Try to extract language from filename (e.g., en.json, fr.json)
    const languageMatch = fileName.match(/^([a-z]{2,3}(-[A-Z]{2})?)$/);
    if (languageMatch) {
      const language = languageMatch[1] || null;
      this.debugLog(`Language detected from filename: ${language}`);
      return language;
    }

    // Try to extract from directory structure (e.g., /locales/en/file.json)
    const pathParts = filePath.split(path.sep);
    this.debugLog(`Path parts:`, pathParts);

    const localesIndex = pathParts.findIndex(part =>
      ['locales', 'i18n', 'translations', 'lang'].includes(part.toLowerCase())
    );

    if (localesIndex !== -1 && pathParts[localesIndex + 1]) {
      const potentialLang = pathParts[localesIndex + 1];
      this.debugLog(`Potential language from directory: ${potentialLang}`);

      if (potentialLang && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(potentialLang)) {
        this.debugLog(`Language detected from directory: ${potentialLang}`);
        return potentialLang;
      }
    }

    this.debugLog(`No language detected for ${filePath}`);
    return null;
  }

  private debounceFileChange(
    type: 'add' | 'change' | 'unlink',
    filePath: string,
    language: string
  ): void {
    const key = `${type}:${filePath}`;
    this.debugLog(`Debouncing file change: ${key}`);

    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      this.debugLog(`Clearing existing timer for ${key}`);
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      this.debugLog(`Debounce timer expired for ${key}`);
      this.debounceTimers.delete(key);
      this.processFileChange(type, filePath, language);
    }, this.options.debounceMs);

    this.debounceTimers.set(key, timer);
    this.debugLog(
      `Set debounce timer for ${key}, expires in ${this.options.debounceMs}ms`
    );
  }

  private processFileChange(
    type: 'add' | 'change' | 'unlink',
    filePath: string,
    language: string
  ): void {
    this.debugLog(`Processing file change: ${type} ${filePath} (${language})`);

    const event: FileChangeEvent = {
      type,
      filePath,
      language,
      timestamp: new Date(),
    };

    // Emit the file change event
    this.debugLog(`Emitting 'fileChange' event:`, event);
    this.emit('fileChange', event);

    // Emit specific event types for convenience
    this.debugLog(`Emitting '${type}' event:`, event);
    this.emit(type, event);

    console.log(`File ${type}: ${filePath} (${language})`);
  }

  private clearAllDebounceTimers(): void {
    const timerCount = this.debounceTimers.size;
    this.debugLog(`Clearing ${timerCount} debounce timers`);

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.debugLog('All debounce timers cleared');
  }

  /**
   * Restart the watcher with new configuration
   */
  async restart(newConfig?: Partial<Config>): Promise<void> {
    this.debugLog('Restarting watcher...', { newConfig });

    if (newConfig) {
      this.debugLog('Updating config with new values:', newConfig);
      this.config = { ...this.config, ...newConfig };
    }

    await this.stop();
    await this.start();
    this.debugLog('Watcher restart complete');
  }

  /**
   * Get list of currently watched files
   */
  getWatchedFiles(): string[] {
    if (!this.watcher) {
      this.debugLog('getWatchedFiles: No watcher available');
      return [];
    }

    const watched = this.watcher.getWatched();
    const files = Object.values(watched).flat() as string[];
    this.debugLog('Currently watched files:', files);
    return files;
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.options.debug = enabled;
    this.debugLog(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current debug mode status
   */
  isDebugMode(): boolean {
    return this.options.debug || false;
  }

  /**
   * Get detailed watcher status for debugging
   */
  getDebugInfo(): any {
    return {
      isWatching: this.isWatching,
      config: this.config,
      options: this.options,
      debounceTimersCount: this.debounceTimers.size,
      debounceTimers: Array.from(this.debounceTimers.keys()),
      watchedFiles: this.getWatchedFiles(),
      debugMode: this.options.debug,
    };
  }
}

export default TranslationWatcher;
