// Main entry point for the translation watcher package
export {
  TranslationWatcher,
  type FileChangeEvent,
  type WatcherOptions,
} from './core/watcher.js';
export { type Config } from './types/index.js';

// Parser exports
export {
  TranslationParser,
  type TranslationData,
  type ParsedFile,
  type ParserOptions,
} from './core/parser.js';

// Diff detector exports
export {
  TranslationDiffDetector,
  type TranslationDiff,
  type DiffOptions,
  type DiffResult,
} from './core/diff-detector.js';

// Translator exports
export {
  TranslationOrchestrator,
  type TranslationRequest,
  type TranslationResponse,
  type TranslationBatch,
  type TranslatorOptions,
  type TranslationProvider,
} from './core/translator.js';

// Translation Manager exports
export {
  AutoTranslator,
  type AutoTranslatorOptions,
  type TranslationResult,
} from './core/auto-translator.js';

// Utility exports
export {
  ConfigValidator,
  type ValidationError,
  type ValidationResult,
  type ValidationRule,
  type ValidationSchema,
} from './utils/config-validator.js';

export {
  Logger,
  defaultLogger,
  type LogLevel,
  type LogEntry,
  type LoggerOptions,
  type LogFormatter,
} from './utils/logger.js';

// Provider exports
export {
  BaseTranslationProvider,
  type ProviderConfig,
} from './providers/base-provider.js';

export {
  OpenAIProvider,
  type OpenAIConfig,
  type OpenAITranslationOptions,
} from './providers/openai.js';

export {
  AnthropicProvider,
  type AnthropicConfig,
  type AnthropicTranslationOptions,
} from './providers/anthropic.js';

export {
  LocalProvider,
  type LocalProviderConfig,
  type LocalTranslationOptions,
} from './providers/local.js';

// CLI export
export { TranslationCLI } from './cli/index.js';

// Default export for convenience
export { default } from './core/watcher.js';
