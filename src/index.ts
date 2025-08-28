// Main entry point for the translation watcher package
export {
  TranslationWatcher,
  type FileChangeEvent,
  type WatcherOptions,
} from "./core/watcher";
export { type Config } from "./types";

// Parser exports
export {
  TranslationParser,
  type TranslationData,
  type ParsedFile,
  type ParserOptions,
} from "./core/parser";

// Diff detector exports
export {
  TranslationDiffDetector,
  type TranslationDiff,
  type DiffOptions,
  type DiffResult,
} from "./core/diff-detector";

// Translator exports
export {
  TranslationOrchestrator,
  type TranslationRequest,
  type TranslationResponse,
  type TranslationBatch,
  type TranslatorOptions,
  type TranslationProvider,
} from "./core/translator";

// Translation Manager exports
export {
  AutoTranslator,
  type AutoTranslatorOptions,
  type TranslationResult,
} from "./core/auto-translator";

// Utility exports
export {
  ConfigValidator,
  type ValidationError,
  type ValidationResult,
  type ValidationRule,
  type ValidationSchema,
} from "./utils/config-validator";

export {
  Logger,
  defaultLogger,
  type LogLevel,
  type LogEntry,
  type LoggerOptions,
  type LogFormatter,
} from "./utils/logger";

// Provider exports
export {
  BaseTranslationProvider,
  type ProviderConfig,
} from "./providers/base-provider";

export {
  OpenAIProvider,
  type OpenAIConfig,
  type OpenAITranslationOptions,
} from "./providers/openai";

export {
  AnthropicProvider,
  type AnthropicConfig,
  type AnthropicTranslationOptions,
} from "./providers/anthropic";

export {
  LocalProvider,
  type LocalProviderConfig,
  type LocalTranslationOptions,
} from "./providers/local";

// CLI export
export { TranslationCLI } from "./cli/index";

// Default export for convenience
export { default } from "./core/watcher";
