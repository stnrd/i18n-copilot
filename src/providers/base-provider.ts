/* eslint no-unused-vars: 0 */

export interface TranslationProvider {
  name: string;
  translate(
    text: string,
    targetLanguage: string,
    context?: string
  ): Promise<string>;
  validateConfig(config: any): boolean;
  getSupportedLanguages(): string[];
}

export interface ProviderConfig {
  [key: string]: any;
}

export interface TranslationRequest {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
  context?: string;
  options?: Record<string, any>;
}

export interface TranslationResponse {
  translatedText: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export abstract class BaseTranslationProvider implements TranslationProvider {
  abstract name: string;
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract translate(
    text: string,
    targetLanguage: string,
    context?: string
  ): Promise<string>;

  abstract validateConfig(config: any): boolean;

  abstract getSupportedLanguages(): string[];

  /**
   * Validate language code format
   */
  protected isValidLanguageCode(code: string): boolean {
    // ISO 639-1 (2 letters) or ISO 639-2 (3 letters) with optional region
    const languageCodePattern = /^[a-z]{2,3}(-[A-Z]{2})?$/;
    return languageCodePattern.test(code);
  }

  /**
   * Build translation prompt with context
   */
  protected buildPrompt(
    text: string,
    targetLanguage: string,
    context?: string
  ): string {
    let prompt = `Translate the following text to ${targetLanguage}:\n\n`;

    if (context) {
      prompt += `Context: ${context}\n\n`;
    }

    prompt += `Text: "${text}"\n\n`;
    prompt += `Translation:`;

    return prompt;
  }

  /**
   * Clean and validate input text
   */
  protected sanitizeInput(text: string): string {
    if (!text || typeof text !== 'string') {
      throw new Error('Input text must be a non-empty string');
    }

    return text.trim();
  }

  /**
   * Validate target language
   */
  protected validateTargetLanguage(language: string): void {
    if (!this.isValidLanguageCode(language)) {
      throw new Error(`Invalid target language code: ${language}`);
    }

    const supported = this.getSupportedLanguages();
    if (supported.length > 0 && !supported.includes(language)) {
      throw new Error(`Language ${language} is not supported by ${this.name}`);
    }
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return { ...this.config };
  }

  /**
   * Check if provider is ready
   */
  abstract isReady(): boolean;

  /**
   * Initialize the provider
   */
  abstract initialize(): Promise<void>;

  /**
   * Get provider capabilities
   */
  getCapabilities(): {
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
