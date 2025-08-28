import { BaseTranslationProvider, ProviderConfig } from './base-provider.js';

export interface AnthropicConfig extends ProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  baseURL?: string;
}

export interface AnthropicTranslationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export class AnthropicProvider extends BaseTranslationProvider {
  name = 'Anthropic';
  private client: any;
  private isInitialized = false;

  constructor(config: AnthropicConfig) {
    super(config);
  }

  /**
   * Validate Anthropic configuration
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
      (config.temperature < 0 || config.temperature > 1)
    ) {
      return false;
    }

    if (config.maxTokens && (config.maxTokens < 1 || config.maxTokens > 4096)) {
      return false;
    }

    return true;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    // Anthropic Claude supports a wide range of languages
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
   * Initialize Anthropic client
   */
  async initialize(): Promise<void> {
    try {
      // Dynamic import to avoid bundling issues
      const { Anthropic } = await import('@anthropic-ai/sdk');

      this.client = new Anthropic({
        apiKey: this.config['apiKey'],
        baseURL: this.config['baseURL'],
      });

      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize Anthropic client: ${
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
   * Translate text using Anthropic Claude
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

      const message = await this.client.messages.create({
        model: this.config['model'] || 'claude-3-sonnet-20240229',
        max_tokens: this.config['maxTokens'] || 1000,
        temperature: this.config['temperature'] || 0.3,
        system:
          'You are a professional translator. Provide only the translated text without any explanations or additional text.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const translatedText = message.content[0]?.text;

      if (!translatedText) {
        throw new Error('No translation received from Anthropic');
      }

      return translatedText.trim();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('rate_limit')) {
          throw new Error(
            'Anthropic rate limit exceeded. Please wait before retrying.'
          );
        } else if (error.message.includes('quota_exceeded')) {
          throw new Error(
            'Anthropic quota exceeded. Please check your account limits.'
          );
        } else if (error.message.includes('invalid_api_key')) {
          throw new Error(
            'Invalid Anthropic API key. Please check your configuration.'
          );
        } else if (error.message.includes('content_policy')) {
          throw new Error(
            'Content policy violation. Please check your input text.'
          );
        }
      }

      throw new Error(
        `Anthropic translation failed: ${
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
    options: AnthropicTranslationOptions = {},
    context?: string
  ): Promise<string> {
    if (!this.isReady()) {
      await this.initialize();
    }

    const sanitizedText = this.sanitizeInput(text);
    this.validateTargetLanguage(targetLanguage);

    try {
      const prompt = this.buildPrompt(sanitizedText, targetLanguage, context);

      const message = await this.client.messages.create({
        model:
          options.model || this.config['model'] || 'claude-3-sonnet-20240229',
        max_tokens: options.maxTokens ?? this.config['maxTokens'] ?? 1000,
        temperature: options.temperature ?? this.config['temperature'] ?? 0.3,
        top_p: options.topP ?? 1,
        top_k: options.topK ?? 40,
        system:
          'You are a professional translator. Provide only the translated text without any explanations or additional text.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const translatedText = message.content[0]?.text;

      if (!translatedText) {
        throw new Error('No translation received from Anthropic');
      }

      return translatedText.trim();
    } catch (error) {
      throw new Error(
        `Anthropic translation failed: ${
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
        .filter((model: any) => model.id.includes('claude'))
        .map((model: any) => model.id);
    } catch (error) {
      throw new Error(
        `Failed to fetch Anthropic models: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(modelId: string): Promise<any> {
    if (!this.isReady()) {
      await this.initialize();
    }

    try {
      const model = await this.client.models.retrieve(modelId);
      return model;
    } catch (error) {
      throw new Error(
        `Failed to fetch model info: ${
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
      maxTextLength: 200000, // Claude has much higher context limits
      rateLimitPerMinute: 50,
    };
  }

  /**
   * Build enhanced prompt for Claude
   */
  protected override buildPrompt(
    text: string,
    targetLanguage: string,
    context?: string
  ): string {
    let prompt = `Please translate the following text to ${targetLanguage}.\n\n`;

    if (context) {
      prompt += `Context: ${context}\n\n`;
    }

    prompt += `Text to translate: "${text}"\n\n`;
    prompt += `Provide only the translated text in ${targetLanguage}, maintaining the original meaning and tone.`;

    return prompt;
  }
}

export default AnthropicProvider;
