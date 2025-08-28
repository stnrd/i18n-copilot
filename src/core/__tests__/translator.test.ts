import {
  TranslationOrchestrator,
  TranslationProvider,
  TranslationBatch,
} from '../translator.js';
import { Config } from '../../types/index.js';

// Mock provider implementation
class MockProvider implements TranslationProvider {
  name = 'mock';

  async translate(
    text: string,
    targetLanguage: string,
    // eslint-disable-next-line
    context?: string
  ): Promise<string> {
    if (text === 'error') {
      throw new Error('Translation failed');
    }
    return `translated_${text}_${targetLanguage}`;
  }

  // eslint-disable-next-line
  validateConfig(config: any): boolean {
    return true;
  }

  getSupportedLanguages(): string[] {
    return ['en', 'fr', 'de', 'es'];
  }
}

describe('TranslationOrchestrator', () => {
  let orchestrator: TranslationOrchestrator;
  let mockProvider: MockProvider;
  let mockConfig: Config;

  beforeEach(() => {
    mockProvider = new MockProvider();
    mockConfig = {
      watchPath: './locales',
      baseLanguage: 'en',
      targetLanguages: ['fr', 'de'],
      filePattern: '*.json',
      provider: {
        type: 'openai',
        config: { apiKey: 'test-key' },
      },
      preserveFormatting: true,
      contextInjection: true,
      batchSize: 5,
      retryAttempts: 3,
      logLevel: 'info',
    };

    orchestrator = new TranslationOrchestrator(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with default options', () => {
      const defaultOrchestrator = new TranslationOrchestrator(mockConfig);
      expect(defaultOrchestrator).toBeInstanceOf(TranslationOrchestrator);
    });

    it('should create orchestrator with custom options', () => {
      const customOrchestrator = new TranslationOrchestrator(mockConfig, {
        batchSize: 20,
        retryAttempts: 5,
        retryDelay: 2000,
        rateLimitDelay: 200,
        preserveFormatting: false,
        contextInjection: false,
      });
      expect(customOrchestrator).toBeInstanceOf(TranslationOrchestrator);
    });
  });

  describe('setProvider', () => {
    it('should set provider successfully', () => {
      orchestrator.setProvider(mockProvider);
      expect(orchestrator.getProvider()).toBe(mockProvider);
    });

    it('should emit providerChanged event', () => {
      const eventSpy = jest.fn();
      orchestrator.on('providerChanged', eventSpy);

      orchestrator.setProvider(mockProvider);

      expect(eventSpy).toHaveBeenCalledWith({ provider: 'mock' });
    });

    it('should throw error for invalid provider config', () => {
      const invalidProvider = {
        ...mockProvider,
        validateConfig: () => false,
      };

      expect(() => orchestrator.setProvider(invalidProvider as any)).toThrow(
        'Invalid configuration for provider: mock'
      );
    });
  });

  describe('getProvider', () => {
    it('should return null when no provider is set', () => {
      expect(orchestrator.getProvider()).toBeNull();
    });

    it('should return set provider', () => {
      orchestrator.setProvider(mockProvider);
      expect(orchestrator.getProvider()).toBe(mockProvider);
    });
  });

  describe('utility methods', () => {
    it('should get current batch status', () => {
      expect(orchestrator.getCurrentBatch()).toBeNull();
    });

    it('should check if translation is in progress', () => {
      expect(orchestrator.isTranslating()).toBe(false);
    });

    it('should stop translation process', () => {
      orchestrator['isProcessing'] = true;
      orchestrator['currentBatch'] = {} as TranslationBatch;

      const eventSpy = jest.fn();
      orchestrator.on('stopped', eventSpy);

      orchestrator.stop();

      expect(orchestrator['isProcessing']).toBe(false);
      expect(orchestrator['currentBatch']).toBeNull();
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should get translation statistics', () => {
      orchestrator.setProvider(mockProvider);

      const stats = orchestrator.getStats();

      expect(stats).toEqual({
        isProcessing: false,
        currentBatch: null,
        provider: 'mock',
      });
    });
  });
});
