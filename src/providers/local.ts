import { BaseTranslationProvider, ProviderConfig } from './base-provider.js';

export interface LocalProviderConfig extends ProviderConfig {
  endpoint?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface LocalTranslationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export class LocalProvider extends BaseTranslationProvider {
  name = 'Local';
  private endpoint: string;
  private isInitialized = false;

  constructor(config: LocalProviderConfig) {
    super(config);
    this.endpoint = config.endpoint || 'http://localhost:11434/api/generate';
  }

  /**
   * Validate local provider configuration
   */
  validateConfig(config: any): boolean {
    if (config.endpoint && typeof config.endpoint !== 'string') {
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

    if (config.maxTokens && (config.maxTokens < 1 || config.maxTokens > 8192)) {
      return false;
    }

    if (config.timeout && (config.timeout < 1000 || config.timeout > 60000)) {
      return false;
    }

    return true;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    // Local providers can support any language depending on the model
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
   * Initialize local provider
   */
  async initialize(): Promise<void> {
    try {
      // Test connection to local endpoint
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config['headers'],
        },
        body: JSON.stringify({
          model: this.config['model'] || 'llama2',
          prompt: 'test',
          stream: false,
        }),
        signal: AbortSignal.timeout(this.config['timeout'] || 10000),
      });

      if (!response.ok) {
        throw new Error(`Local endpoint returned status ${response.status}`);
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize local provider: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Check if provider is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Translate text using local model
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

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config['headers'],
        },
        body: JSON.stringify({
          model: this.config['model'] || 'llama2',
          prompt: prompt,
          stream: false,
          temperature: this.config['temperature'] || 0.3,
          top_p: 1,
          top_k: 40,
          max_tokens: this.config['maxTokens'] || 1000,
        }),
        signal: AbortSignal.timeout(this.config['timeout'] || 30000),
      });

      if (!response.ok) {
        throw new Error(`Local endpoint returned status ${response.status}`);
      }

      const data = await response.json();
      // @ts-ignore
      const rawTranslatedText = data.response || data.text || data.content;

      if (!rawTranslatedText) {
        throw new Error('No translation received from local provider');
      }

      // Clean the translation response to remove extra information
      const translatedText = this.cleanTranslationResponse(rawTranslatedText);
      return translatedText;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          throw new Error(
            'Local provider request timed out. Please check if the service is running.'
          );
        } else if (error.message.includes('fetch')) {
          throw new Error(
            'Failed to connect to local provider. Please check if the service is running.'
          );
        }
      }

      throw new Error(
        `Local translation failed: ${
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
    options: LocalTranslationOptions = {},
    context?: string
  ): Promise<string> {
    if (!this.isReady()) {
      await this.initialize();
    }

    const sanitizedText = this.sanitizeInput(text);
    this.validateTargetLanguage(targetLanguage);

    try {
      const prompt = this.buildPrompt(sanitizedText, targetLanguage, context);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config['headers'],
        },
        body: JSON.stringify({
          model: options.model || this.config['model'] || 'llama2',
          prompt: prompt,
          stream: false,
          temperature: options.temperature ?? this.config['temperature'] ?? 0.3,
          top_p: options.topP ?? 1,
          top_k: options.topK ?? 40,
          max_tokens: options.maxTokens ?? this.config['maxTokens'] ?? 1000,
        }),
        signal: AbortSignal.timeout(this.config['timeout'] || 30000),
      });

      if (!response.ok) {
        throw new Error(`Local endpoint returned status ${response.status}`);
      }

      const data = await response.json();
      // @ts-ignore
      const rawTranslatedText = data.response || data.text || data.content;

      if (!rawTranslatedText) {
        throw new Error('No translation received from local provider');
      }

      // Clean the translation response to remove extra information
      const translatedText = this.cleanTranslationResponse(rawTranslatedText);
      return translatedText;
    } catch (error) {
      throw new Error(
        `Local translation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Test local provider connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config['headers'],
        },
        body: JSON.stringify({
          model: this.config['model'] || 'llama2',
          prompt: 'Hello',
          stream: false,
          max_tokens: 10,
        }),
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available models from local provider
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      // Try to get models from Ollama
      const response = await fetch(
        `${this.endpoint.replace('/api/generate', '/api/tags')}`,
        {
          method: 'GET',
          headers: this.config['headers'],
          signal: AbortSignal.timeout(5000),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as { models?: { name: string }[] };
        return data.models?.map((model: any) => model.name) || [];
      }
    } catch {
      // Ignore errors, return default models
    }

    // Return common local models
    return [
      'llama2',
      'llama2:7b',
      'llama2:13b',
      'llama2:70b',
      'mistral',
      'mistral:7b',
      'mistral:13b',
      'codellama',
      'codellama:7b',
      'codellama:13b',
      'codellama:34b',
      'llama2-uncensored',
      'llama2-uncensored:7b',
      'llama2-uncensored:13b',
      'vicuna',
      'vicuna:7b',
      'vicuna:13b',
      'vicuna:33b',
      'wizard-vicuna-uncensored',
      'wizard-vicuna-uncensored:7b',
      'wizard-vicuna-uncensored:13b',
      'nous-hermes',
      'nous-hermes:7b',
      'nous-hermes:13b',
      'orca-mini',
      'orca-mini:3b',
      'orca-mini:7b',
      'orca-mini:13b',
      'neural-chat',
      'neural-chat:3b',
      'neural-chat:7b',
      'openchat',
      'openchat:3b',
      'openchat:7b',
      'dolphin-phi',
      'dolphin-phi:2.7b',
      'phi',
      'phi:2.7b',
      'phi:3.5b',
      'stable-code',
      'stable-code:3b',
      'qwen',
      'qwen:7b',
      'qwen:14b',
      'qwen:72b',
      'yi',
      'yi:6b',
      'yi:34b',
      'deepseek',
      'deepseek:6.7b',
      'deepseek:33b',
      'internlm',
      'internlm:7b',
      'internlm:20b',
      'baichuan',
      'baichuan:7b',
      'baichuan:13b',
      'chatglm',
      'chatglm:3b',
      'chatglm:6b',
      'falcon',
      'falcon:7b',
      'falcon:40b',
      'mpt',
      'mpt:7b',
      'mpt:30b',
      'redpajama',
      'redpajama:7b',
      'redpajama:13b',
      'opt',
      'opt:1.3b',
      'opt:6.7b',
      'opt:13b',
      'opt:30b',
      'opt:66b',
      'bloom',
      'bloom:560m',
      'bloom:1.1b',
      'bloom:3b',
      'bloom:7b1',
      'gpt4all',
      'gpt4all:7b',
      'gpt4all:13b',
      'gpt4all-j',
      'gpt4all-j:6b',
      'gpt4all-m',
      'gpt4all-m:3b',
      'gpt4all-p',
      'gpt4all-p:3b',
      'gpt4all-s',
      'gpt4all-s:3b',
      'gpt4all-w',
      'gpt4all-w:3b',
      'gpt4all-v',
      'gpt4all-v:3b',
      'gpt4all-x',
      'gpt4all-x:3b',
      'gpt4all-y',
      'gpt4all-y:3b',
      'gpt4all-z',
      'gpt4all-z:3b',
      'gpt4all-ggml',
      'gpt4all-ggml:7b',
      'gpt4all-ggml:13b',
      'gpt4all-gguf',
      'gpt4all-gguf:7b',
      'gpt4all-gguf:13b',
      'gpt4all-j-ggml',
      'gpt4all-j-ggml:6b',
      'gpt4all-m-ggml',
      'gpt4all-m-ggml:3b',
      'gpt4all-p-ggml',
      'gpt4all-p-ggml:3b',
      'gpt4all-s-ggml',
      'gpt4all-s-ggml:3b',
      'gpt4all-w-ggml',
      'gpt4all-w-ggml:3b',
      'gpt4all-v-ggml',
      'gpt4all-v-ggml:3b',
      'gpt4all-x-ggml',
      'gpt4all-x-ggml:3b',
      'gpt4all-y-ggml',
      'gpt4all-y-ggml:3b',
      'gpt4all-z-ggml',
      'gpt4all-z-ggml:3b',
      'gpt4all-ggml-gguf',
      'gpt4all-ggml-gguf:7b',
      'gpt4all-ggml-gguf:13b',
      'gpt4all-j-ggml-gguf',
      'gpt4all-j-ggml-gguf:6b',
      'gpt4all-m-ggml-gguf',
      'gpt4all-m-ggml-gguf:3b',
      'gpt4all-p-ggml-gguf',
      'gpt4all-p-ggml-gguf:3b',
      'gpt4all-s-ggml-gguf',
      'gpt4all-s-ggml-gguf:3b',
      'gpt4all-w-ggml-gguf',
      'gpt4all-w-ggml-gguf:3b',
      'gpt4all-v-ggml-gguf',
      'gpt4all-v-ggml-gguf:3b',
      'gpt4all-x-ggml-gguf',
      'gpt4all-x-ggml-gguf:3b',
      'gpt4all-y-ggml-gguf',
      'gpt4all-y-ggml-gguf:3b',
      'gpt4all-z-ggml-gguf',
      'gpt4all-z-ggml-gguf:3b',
    ];
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
      maxTextLength: 8192, // Local models typically have lower limits
      rateLimitPerMinute: 100, // Local models can handle higher rates
    };
  }

  /**
   * Build prompt optimized for local models with clear instructions for clean output
   */
  protected override buildPrompt(
    text: string,
    targetLanguage: string,
    context?: string
  ): string {
    let prompt = `You are a professional translator. Translate the given text to ${targetLanguage}.

IMPORTANT INSTRUCTIONS:
- Provide ONLY the translation, nothing else
- Do NOT include explanations, pronunciations, or extra context
- Do NOT use quotes around the translation
- Do NOT add any additional text or formatting
- Keep the translation clean and minimal

`;

    if (context) {
      prompt += `Context: ${context}\n\n`;
    }

    prompt += `Text to translate: ${text}\n\n`;
    prompt += `Translation:`;

    return prompt;
  }

  /**
   * Clean and extract translation from model response
   */
  private cleanTranslationResponse(response: string): string {
    if (!response) return '';

    // Remove quotes at the beginning and end
    response = response.trim().replace(/^["']|["']$/g, '');

    // Extract only the first line if there are multiple lines
    const firstLine = response.split('\n')[0].trim();

    // If the response is very long or contains multiple sentences, try to extract just the translation
    if (
      firstLine.length > 100 ||
      (firstLine.includes('.') && firstLine.split('.').length > 1)
    ) {
      // For languages with spaces, take just the first part
      const words = firstLine.split(' ');
      if (words.length > 5) {
        // If it looks like a sentence with explanation, take just the first few words
        return words.slice(0, 3).join(' ');
      }
    }

    return firstLine;
  }
}

export default LocalProvider;
