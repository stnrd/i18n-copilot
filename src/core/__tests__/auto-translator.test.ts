import { AutoTranslator } from '../auto-translator';
import { Config } from '../../types';
import fs from 'fs/promises';
import { EventEmitter } from 'events';

// Mock fs module
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock TranslationOrchestrator
jest.mock('../translator');
const mockOrchestrator = {
  setProvider: jest.fn(),
  processFileChanges: jest.fn(),
  getStats: jest.fn(),
  on: jest.fn(),
};

// Mock TranslationWatcher
jest.mock('../watcher');
const mockWatcher = {
  start: jest.fn(),
  stop: jest.fn(),
  getStats: jest.fn(),
  listeners: new Map<string, Function[]>(),
  on: jest.fn((event: string, listener: Function) => {
    if (!mockWatcher.listeners.has(event)) {
      mockWatcher.listeners.set(event, []);
    }
    mockWatcher.listeners.get(event)!.push(listener);
  }),
  emit: jest.fn((event: string, ...args: any[]) => {
    const listeners = mockWatcher.listeners.get(event) || [];
    listeners.forEach((listener: Function) => listener(...args));
  }),
};

// Mock the imports
jest.mock('../translator', () => ({
  TranslationOrchestrator: jest.fn().mockImplementation(() => mockOrchestrator),
}));

jest.mock('../watcher', () => ({
  TranslationWatcher: jest.fn().mockImplementation(() => mockWatcher),
}));

describe('AutoTranslator', () => {
  let autoTranslator: AutoTranslator;
  let mockConfig: Config;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      watchPath: './locales',
      baseLanguage: 'en',
      targetLanguages: ['fr', 'de'],
      filePattern: '.*\\.json$',
      provider: {
        type: 'openai' as const,
        config: {
          apiKey: 'test-key',
          model: 'gpt-3.5-turbo',
        },
      },
      preserveFormatting: true,
      contextInjection: true,
      batchSize: 10,
      retryAttempts: 3,

      logLevel: 'info' as const,
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Reset mock implementations
    mockOrchestrator.setProvider.mockResolvedValue(undefined);
    mockOrchestrator.processFileChanges.mockResolvedValue([]);
    mockOrchestrator.getStats.mockReturnValue({
      isProcessing: false,
      currentBatch: null,
      provider: 'mock',
    });
    mockWatcher.start.mockResolvedValue(undefined);
    mockWatcher.stop.mockResolvedValue(undefined);
    mockWatcher.getStats.mockReturnValue({
      isWatching: true,
      watchPath: './locales',
      targetLanguages: ['fr', 'de'],
    });
    mockWatcher.listeners.clear();
    mockWatcher.emit.mockClear();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      autoTranslator = new AutoTranslator(mockConfig);
      expect(autoTranslator).toBeInstanceOf(EventEmitter);
      expect(autoTranslator.isActive()).toBe(false);
      expect(autoTranslator.isTranslating()).toBe(false);
    });

    it('should create instance with custom logger', () => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
      expect(autoTranslator).toBeInstanceOf(EventEmitter);
    });

    it('should not auto-start when autoStart is false', () => {
      autoTranslator = new AutoTranslator(mockConfig, { autoStart: false });
      expect(autoTranslator.isActive()).toBe(false);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
    });

    it('should start successfully', async () => {
      await autoTranslator.start();

      expect(autoTranslator.isActive()).toBe(true);
      expect(mockOrchestrator.setProvider).toHaveBeenCalled();
      expect(mockWatcher.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Translation manager started successfully'
      );
    });

    it('should throw error if already running', async () => {
      await autoTranslator.start();

      await expect(autoTranslator.start()).rejects.toThrow(
        'Translation manager is already running'
      );
    });

    it('should handle provider setup failure', async () => {
      mockOrchestrator.setProvider.mockImplementation(() => {
        throw new Error('Provider setup failed');
      });

      await expect(autoTranslator.start()).rejects.toThrow(
        'Provider setup failed'
      );
      expect(autoTranslator.isActive()).toBe(false);
    });

    it('should handle watcher start failure', async () => {
      mockWatcher.start.mockRejectedValue(new Error('Watcher start failed'));

      await expect(autoTranslator.start()).rejects.toThrow(
        'Watcher start failed'
      );
      expect(autoTranslator.isActive()).toBe(false);
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
      await autoTranslator.start();
    });

    it('should stop successfully', async () => {
      await autoTranslator.stop();

      expect(autoTranslator.isActive()).toBe(false);
      expect(mockWatcher.stop).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Translation manager stopped'
      );
    });

    it('should not throw error if not running', async () => {
      await autoTranslator.stop();
      await expect(autoTranslator.stop()).resolves.toBeUndefined();
    });

    it('should handle stop failure', async () => {
      mockWatcher.stop.mockRejectedValue(new Error('Stop failed'));

      await expect(autoTranslator.stop()).rejects.toThrow('Stop failed');
      expect(autoTranslator.isActive()).toBe(false);
    });
  });

  describe('translateFile', () => {
    beforeEach(async () => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
      await autoTranslator.start();
    });

    it('should throw error if not running', async () => {
      await autoTranslator.stop();

      await expect(autoTranslator.translateFile('test.json')).rejects.toThrow(
        'Translation manager is not running'
      );
    });

    it('should throw error if already processing', async () => {
      // Set the internal processing flag to simulate processing
      (autoTranslator as any).isProcessing = true;

      await expect(autoTranslator.translateFile('en.json')).rejects.toThrow(
        'Translation already in progress'
      );
    });

    it('should return error result if file is not base language', async () => {
      const result = await autoTranslator.translateFile('fr.json');

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'File fr.json is not a base language file'
      );
    });

    it('should return error result if no target files found', async () => {
      // Mock fs.access to simulate no target files
      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const result = await autoTranslator.translateFile('en.json');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No target language files found');
    });

    it('should process translations successfully', async () => {
      // Mock target files exist
      mockedFs.access.mockResolvedValue(undefined);

      // Mock successful translation batches
      const mockBatches = [
        {
          responses: [
            {
              success: true,
              translatedText: '[FR] Hello',
              targetLanguage: 'fr',
              key: 'hello',
            },
            {
              success: true,
              translatedText: '[DE] Hello',
              targetLanguage: 'de',
              key: 'hello',
            },
          ],
        },
      ];

      mockOrchestrator.processFileChanges.mockResolvedValue(mockBatches);

      // Mock file reading and writing
      mockedFs.readFile.mockResolvedValue('{"hello": ""}');
      mockedFs.writeFile.mockResolvedValue(undefined);

      const result = await autoTranslator.translateFile('en.json');

      expect(result.success).toBe(true);
      expect(result.batchesProcessed).toBe(1);
      expect(result.totalTranslations).toBe(2);
      expect(result.updatedFiles).toHaveLength(2);
    });

    it('should handle translation processing failure', async () => {
      // Mock target files exist
      mockedFs.access.mockResolvedValue(undefined);

      // Mock translation failure
      mockOrchestrator.processFileChanges.mockRejectedValue(
        new Error('Translation failed')
      );

      const result = await autoTranslator.translateFile('en.json');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Translation failed');
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
      await autoTranslator.start();
    });

    it('should return correct status', () => {
      const status = autoTranslator.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.isProcessing).toBe(false);
      expect(status.config.baseLanguage).toBe('en');
      expect(status.config.targetLanguages).toEqual(['fr', 'de']);
      expect(status.config.provider).toBe('openai');
      expect(status.watcherStats).toBeDefined();
      expect(status.orchestratorStats).toBeDefined();
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
      await autoTranslator.start();
    });

    it('should emit started event', done => {
      autoTranslator.on('started', () => {
        done();
      });

      // Re-start to trigger event
      autoTranslator.stop().then(() => autoTranslator.start());
    });

    it('should emit stopped event', done => {
      autoTranslator.on('stopped', () => {
        done();
      });

      autoTranslator.stop();
    });

    it('should emit baseLanguageChanged event', done => {
      autoTranslator.on('baseLanguageChanged', event => {
        expect(event.filePath).toBe('en.json');
        expect(event.language).toBe('en');
        done();
      });

      // Simulate file change event
      const mockEvent = {
        type: 'change',
        filePath: 'en.json',
        language: 'en',
        timestamp: new Date(),
      };
      (autoTranslator as any).watcher.emit('fileChange', mockEvent);
    });

    it('should emit error event', done => {
      autoTranslator.on('error', error => {
        expect(error.message).toBe('Test error');
        done();
      });

      // Simulate error event
      (autoTranslator as any).watcher.emit('error', new Error('Test error'));
    });
  });

  describe('provider setup', () => {
    it('should set up OpenAI provider', async () => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
      await autoTranslator.start();

      expect(mockOrchestrator.setProvider).toHaveBeenCalled();
    });

    it('should set up Anthropic provider', async () => {
      const anthropicConfig = {
        ...mockConfig,
        provider: { type: 'anthropic' as const, config: { apiKey: 'test' } },
      };
      autoTranslator = new AutoTranslator(anthropicConfig, {
        logger: mockLogger,
      });
      await autoTranslator.start();

      expect(mockOrchestrator.setProvider).toHaveBeenCalled();
    });

    it('should set up Local provider', async () => {
      const localConfig = {
        ...mockConfig,
        provider: { type: 'local' as const, config: {} },
      };
      autoTranslator = new AutoTranslator(localConfig, { logger: mockLogger });
      await autoTranslator.start();

      expect(mockOrchestrator.setProvider).toHaveBeenCalled();
    });

    it('should throw error for unsupported provider', async () => {
      const invalidConfig = {
        ...mockConfig,
        provider: { type: 'invalid' as any, config: {} },
      };
      autoTranslator = new AutoTranslator(invalidConfig, {
        logger: mockLogger,
      });

      await expect(autoTranslator.start()).rejects.toThrow(
        'Unsupported provider type: invalid'
      );
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
      await autoTranslator.start();
    });

    it('should handle nested key updates correctly', async () => {
      // Mock target files exist
      mockedFs.access.mockResolvedValue(undefined);

      const mockBatches = [
        {
          responses: [
            {
              success: true,
              translatedText: '[FR] Welcome',
              targetLanguage: 'fr',
              key: 'common.welcome',
            },
            {
              success: true,
              translatedText: '[FR] Hello',
              targetLanguage: 'fr',
              key: 'common.hello',
            },
          ],
        },
      ];

      mockOrchestrator.processFileChanges.mockResolvedValue(mockBatches);

      // Mock existing file with nested structure
      mockedFs.readFile.mockResolvedValue(
        '{"common": {"welcome": "", "hello": ""}}'
      );
      mockedFs.writeFile.mockResolvedValue(undefined);

      await autoTranslator.translateFile('en.json');

      // Verify the nested structure is preserved and updated
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('fr.json'),
        expect.stringContaining('"common"')
      );
    });

    it("should return error result if target files don't exist", async () => {
      // Mock target files don't exist initially
      mockedFs.access.mockRejectedValue(new Error('File not found'));

      const result = await autoTranslator.translateFile('en.json');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No target language files found');
    });
  });

  describe('language detection', () => {
    beforeEach(async () => {
      autoTranslator = new AutoTranslator(mockConfig, { logger: mockLogger });
      await autoTranslator.start();
    });

    it('should detect language from filename', () => {
      const language = (autoTranslator as any).detectLanguageFromPath(
        'en.json'
      );
      expect(language).toBe('en');
    });

    it('should detect language from directory structure', () => {
      const language = (autoTranslator as any).detectLanguageFromPath(
        '/locales/fr/translations.json'
      );
      expect(language).toBe('fr');
    });

    it('should return null for invalid paths', () => {
      const language = (autoTranslator as any).detectLanguageFromPath(
        'invalid-file.txt'
      );
      expect(language).toBeNull();
    });
  });
});
