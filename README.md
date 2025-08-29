# i18n-copilot

AI-powered translation file watcher and translator that automatically translates new keys from your base language to target languages using configurable LLM providers.

## 🏗️ Architecture

The project has been refactored to separate concerns and improve maintainability:

### Core Components

- **`AutoTranslator`** - Main business logic orchestrator that manages the entire translation workflow
- **`TranslationWatcher`** - File system watcher that detects changes in translation files
- **`TranslationOrchestrator`** - Handles the translation process and batching
- **`TranslationParser`** - Parses translation files and extracts keys
- **`TranslationDiffDetector`** - Detects differences between base and target language files

### Providers

- **`OpenAIProvider`** - Uses OpenAI's GPT models for translation
- **`AnthropicProvider`** - Uses Anthropic's Claude models for translation
- **`LocalProvider`** - Uses local models (e.g., Ollama) for translation

### CLI

- **`TranslationCLI`** - Command-line interface that uses the AutoTranslator
- Clean separation of concerns - CLI only handles user interaction and configuration

## 🚀 Features

- **Automatic Translation**: Watches for changes in base language files and automatically translates new keys
- **Multiple Providers**: Support for OpenAI, Anthropic, and local LLM providers
- **Smart Batching**: Efficiently processes translations in batches
- **File Preservation**: Maintains existing file structure and formatting
- **Real-time Watching**: Monitors file changes and triggers translations automatically
- **Manual Translation**: Command to manually translate specific files
- **Comprehensive Testing**: Full test coverage for all business logic

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run tests
pnpm test
```

## 🛠️ Build System

This project uses **esbuild** for fast builds and **SWC** for Jest testing:

### Build Commands

```bash
# Build the project (library + CLI)
pnpm run build

# Watch mode for development
pnpm run dev

# Clean build artifacts
pnpm run clean
```

### Testing

```bash
# Run tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run test runner (requires build first)
pnpm run test:runner
```

### CLI Usage

```bash
# Run CLI with help
pnpm run cli --help

# Start the translation watcher
pnpm start

# Or run directly
./dist/cli/cli.js --help
```

### Build Output

- **`dist/index.js`** - Main library (ES modules)
- **`dist/cli/index.js`** - CLI implementation (ES modules)  
- **`dist/cli/cli.js`** - CLI executable wrapper (ES modules with shebang)

## ⚙️ Configuration

Create a `i18n-copilot.config.json` file:

```json
{
  "watchPath": "./locales",
  "baseLanguage": "en",
  "targetLanguages": ["fr", "de", "es"],
  "filePattern": ".*\\.json$",
  "provider": {
    "type": "openai",
    "config": {
      "apiKey": "your-openai-api-key",
      "model": "gpt-3.5-turbo"
    }
  },
  "preserveFormatting": true,
  "contextInjection": true,
  "batchSize": 10,
  "retryAttempts": 3,
  "logLevel": "info"
}
```

## 🎯 Usage

### Watch Mode (Automatic Translation)

```bash
# Start watching for changes
i18n-copilot watch

# With custom config
i18n-copilot watch -c ./my-config.json

# With CLI options
i18n-copilot watch -p ./locales -b en -t fr,de,es --provider openai
```

### Manual Translation

```bash
# Translate a specific file
i18n-copilot translate ./locales/en.json

# With custom config
i18n-copilot translate ./locales/en.json -c ./my-config.json
```

### Other Commands

```bash
# Validate configuration
i18n-copilot validate -c ./i18n-copilot.config.json

# Show status
i18n-copilot status

# Stop watcher
i18n-copilot stop

# Initialize new project
i18n-copilot init -p ./my-project --base en --targets fr,de,es
```

## 🔧 Development

### Project Structure

```
src/
├── core/                    # Core business logic
│   ├── auto-translator.ts    # Main orchestrator
│   ├── watcher.ts               # File watching
│   ├── translator.ts            # Translation orchestration
│   ├── parser.ts                # File parsing
│   ├── diff-detector.ts         # Difference detection
│   └── __tests__/               # Core tests
├── providers/               # LLM providers
│   ├── base-provider.ts         # Base provider interface
│   ├── openai.ts                # OpenAI provider
│   ├── anthropic.ts             # Anthropic provider
│   ├── local.ts                 # Local provider
│   ├── mock-provider.ts         # Mock provider for testing
│   └── __tests__/               # Provider tests
├── utils/                    # Utilities
│   ├── config-validator.ts      # Configuration validation
│   └── logger.ts                # Logging utilities
├── cli/                      # Command-line interface
│   └── index.ts                 # CLI implementation
└── index.ts                  # Main exports
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/core/__tests__/auto-translator.test.ts
```

### Testing Architecture

- **MockProvider**: Simulates LLM responses for testing without API calls
- **Comprehensive Coverage**: Tests cover all business logic, error handling, and edge cases
- **Isolated Testing**: Each component can be tested independently
- **Mock Dependencies**: External dependencies are properly mocked

## 🔄 How It Works

1. **File Watching**: The `TranslationWatcher` monitors the configured directory for changes
2. **Change Detection**: When a base language file changes, it triggers the translation process
3. **Diff Analysis**: The `TranslationDiffDetector` identifies new or modified keys
4. **Translation**: The `TranslationOrchestrator` sends keys to the configured LLM provider
5. **File Updates**: Translated content is written back to target language files
6. **Event Emission**: Progress and completion events are emitted for monitoring

## 🧪 Testing

The project includes comprehensive tests for all business logic:

- **AutoTranslator Tests**: Core functionality, error handling, event emission
- **MockProvider Tests**: Provider behavior, error simulation, concurrent operations
- **Integration Tests**: End-to-end workflow testing
- **Edge Case Tests**: Error conditions, invalid inputs, boundary conditions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:

1. Check the existing issues
2. Create a new issue with detailed information
3. Include configuration and error logs
4. Provide reproduction steps
