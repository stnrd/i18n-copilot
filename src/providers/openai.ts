import { BaseTranslationProvider, ProviderConfig } from './base-provider.js';

export interface OpenAIConfig extends ProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  organization?: string;
  baseURL?: string;
}

export interface OpenAITranslationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export class OpenAIProvider extends BaseTranslationProvider {
  name = 'OpenAI';
  private client: any;
  private isInitialized = false;

  constructor(config: OpenAIConfig) {
    super(config);
  }

  /**
   * Validate OpenAI configuration
   */
  validateConfig(config: any): boolean {
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      return false;
    }

    if (config.model && typeof config.model !== 'string') {
      return false;
    }

    if (
      config.temperature !== undefined &&
      (config.temperature < 0 || config.temperature > 2)
    ) {
      return false;
    }

    if (config.maxTokens && (config.maxTokens < 1 || config.maxTokens > 4000)) {
      return false;
    }

    return true;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    // OpenAI supports a wide range of languages
    return [
      'en',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'ru',
      'ja',
      'ko',
      'zh',
      'ar',
      'hi',
      'th',
      'vi',
      'nl',
      'pl',
      'tr',
      'sv',
      'da',
      'no',
      'fi',
      'cs',
      'hu',
      'ro',
      'bg',
      'hr',
      'sk',
      'sl',
      'et',
      'lv',
      'lt',
      'mt',
      'el',
      'he',
      'id',
      'ms',
      'tl',
      'bn',
      'ur',
      'fa',
      'ne',
      'si',
      'my',
      'km',
      'lo',
      'mn',
      'ka',
      'am',
      'hy',
      'az',
      'be',
      'bs',
      'mk',
      'sr',
      'uk',
      'sq',
      'eu',
      'ca',
      'gl',
      'is',
      'ga',
      'cy',
      'br',
      'kw',
      'gv',
      'gd',
      'ht',
      'mi',
      'sm',
      'to',
      'fj',
      'haw',
      'qu',
      'ay',
      'gn',
      'wo',
      'zu',
      'xh',
      'af',
      'st',
      'tn',
      'ts',
      'ss',
      've',
      'nr',
      'sn',
      'rw',
      'ny',
      'mg',
      'sw',
      'so',
      'om',
      'ti',
      'aa',
      'ab',
      'ae',
      'av',
      'ba',
      'ce',
      'cv',
      'dv',
      'ee',
      'ff',
      'fo',
      'fy',
      'ha',
      'ho',
      'ii',
      'ik',
      'io',
      'jv',
      'ki',
      'kj',
      'kl',
      'kr',
      'ku',
      'lb',
      'lg',
      'li',
      'ln',
      'lu',
      'mh',
      'na',
      'ng',
      'oc',
      'oj',
      'pi',
      'ps',
      'rm',
      'rn',
      'sc',
      'sg',
      'sh',
      'su',
      'ta',
      'te',
      'tg',
      'tk',
      'tw',
      'ty',
      'ug',
      'wa',
      'yi',
      'yo',
      'za',
      'zh-CN',
      'zh-TW',
      'en-US',
      'en-GB',
      'es-ES',
      'es-MX',
      'fr-FR',
      'fr-CA',
      'de-DE',
      'de-AT',
      'de-CH',
      'it-IT',
      'pt-PT',
      'pt-BR',
      'ru-RU',
      'ja-JP',
      'ko-KR',
      'zh-HK',
    ];
  }

  /**
   * Initialize OpenAI client
   */
  async initialize(): Promise<void> {
    try {
      // Dynamic import to avoid bundling issues
      const { OpenAI } = await import('openai');

      this.client = new OpenAI({
        apiKey: this.config['apiKey'],
        organization: this.config['organization'],
        baseURL: this.config['baseURL'],
      });

      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize OpenAI client: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Check if provider is ready
   */
  isReady(): boolean {
    return this.isInitialized && !!this.client;
  }

  /**
   * Translate text using OpenAI
   */
  async translate(
    text: string,
    targetLanguage: string,
    context?: string
  ): Promise<string> {
    if (!this.isReady()) {
      await this.initialize();
    }

    // Validate inputs
    const sanitizedText = this.sanitizeInput(text);
    this.validateTargetLanguage(targetLanguage);

    try {
      const prompt = this.buildPrompt(sanitizedText, targetLanguage, context);

      const completion = await this.client.chat.completions.create({
        model: this.config['model'] || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a professional translator. Provide only the translated text without any explanations or additional text.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: this.config['temperature'] || 0.3,
        max_tokens: this.config['maxTokens'] || 1000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });

      const translatedText = completion.choices[0]?.message?.content;

      if (!translatedText) {
        throw new Error('No translation received from OpenAI');
      }

      return translatedText.trim();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('rate_limit')) {
          throw new Error(
            'OpenAI rate limit exceeded. Please wait before retrying.'
          );
        } else if (error.message.includes('quota_exceeded')) {
          throw new Error(
            'OpenAI quota exceeded. Please check your account limits.'
          );
        } else if (error.message.includes('invalid_api_key')) {
          throw new Error(
            'Invalid OpenAI API key. Please check your configuration.'
          );
        }
      }

      throw new Error(
        `OpenAI translation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Translate with custom options
   */
  async translateWithOptions(
    text: string,
    targetLanguage: string,
    options: OpenAITranslationOptions = {},
    context?: string
  ): Promise<string> {
    if (!this.isReady()) {
      await this.initialize();
    }

    const sanitizedText = this.sanitizeInput(text);
    this.validateTargetLanguage(targetLanguage);

    try {
      const prompt = this.buildPrompt(sanitizedText, targetLanguage, context);

      const completion = await this.client.chat.completions.create({
        model: options.model || this.config['model'] || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a professional translator. Provide only the translated text without any explanations or additional text.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: options.temperature ?? this.config['temperature'] ?? 0.3,
        max_tokens: options.maxTokens ?? this.config['maxTokens'] ?? 1000,
        top_p: options.topP ?? 1,
        frequency_penalty: options.frequencyPenalty ?? 0,
        presence_penalty: options.presencePenalty ?? 0,
      });

      const translatedText = completion.choices[0]?.message?.content;

      if (!translatedText) {
        throw new Error('No translation received from OpenAI');
      }

      return translatedText.trim();
    } catch (error) {
      throw new Error(
        `OpenAI translation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    if (!this.isReady()) {
      await this.initialize();
    }

    try {
      const models = await this.client.models.list();
      return models.data
        .filter((model: any) => model.id.includes('gpt'))
        .map((model: any) => model.id);
    } catch (error) {
      throw new Error(
        `Failed to fetch OpenAI models: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get usage statistics
   */
  async getUsage(): Promise<any> {
    if (!this.isReady()) {
      await this.initialize();
    }

    try {
      const usage = await this.client.usage.list();
      return usage;
    } catch (error) {
      throw new Error(
        `Failed to fetch OpenAI usage: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get provider capabilities
   */
  override getCapabilities(): {
    supportsContext: boolean;
    supportsBatchTranslation: boolean;
    maxTextLength: number;
    rateLimitPerMinute: number;
  } {
    return {
      supportsContext: true,
      supportsBatchTranslation: false,
      maxTextLength: 4000,
      rateLimitPerMinute: 60,
    };
  }
}

export default OpenAIProvider;
