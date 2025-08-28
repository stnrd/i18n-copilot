export interface Config {
  // File watching
  watchPath: string;
  baseLanguage: string;
  targetLanguages: string[];
  filePattern: string;

  // LLM Configuration
  provider: {
    type: "openai" | "anthropic" | "local" | "custom";
    config: Record<string, any>;
  };

  // Translation settings
  preserveFormatting: boolean;
  contextInjection: boolean;
  batchSize: number;
  retryAttempts: number;

  // Output settings
  logLevel: "debug" | "info" | "warn" | "error";
}
