// Mock translation server that intercepts fetch requests
// This approach avoids Node.js built-in module issues with esbuild

interface MockTranslationData {
  [key: string]: string;
}

// Mock translations for French and German
const mockTranslations: Record<string, MockTranslationData> = {
  fr: {
    'Welcome to our application': 'Bienvenue dans notre application',
    'Hello, how are you?': 'Bonjour, comment allez-vous ?',
    'Goodbye, see you later!': 'Au revoir, à bientôt !',
    Save: 'Sauvegarder',
    Cancel: 'Annuler',
    Submit: 'Soumettre',
  },
  de: {
    'Welcome to our application': 'Willkommen in unserer Anwendung',
    'Hello, how are you?': 'Hallo, wie geht es dir?',
    'Goodbye, see you later!': 'Auf Wiedersehen, bis später!',
    Save: 'Speichern',
    Cancel: 'Abbrechen',
    Submit: 'Absenden',
  },
};

class MockTranslationServer {
  private originalFetch: typeof fetch;
  private isActive = false;
  private static instance: MockTranslationServer | null = null;

  constructor() {
    this.originalFetch = globalThis.fetch;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MockTranslationServer {
    if (!MockTranslationServer.instance) {
      MockTranslationServer.instance = new MockTranslationServer();
    }
    return MockTranslationServer.instance;
  }

  /**
   * Start the mock server by intercepting fetch requests
   */
  start(): Promise<void> {
    return new Promise(resolve => {
      if (this.isActive) {
        resolve();
        return;
      }

      // Store original fetch
      this.originalFetch = globalThis.fetch;

      // Override fetch to intercept requests to our mock endpoint
      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit
      ) => {
        const url = typeof input === 'string' ? input : input.toString();

        // Only intercept requests to localhost:11434/api/generate
        if (url.includes('localhost:11434') && url.includes('/api/generate')) {
          return this.handleMockRequest(input, init);
        }

        // Pass through all other requests to original fetch
        return this.originalFetch(input, init);
      };

      this.isActive = true;
      console.log('🚀 Mock translation server started (fetch interceptor)');
      resolve();
    });
  }

  /**
   * Stop the mock server by restoring original fetch
   */
  stop(): Promise<void> {
    return new Promise(resolve => {
      if (!this.isActive) {
        resolve();
        return;
      }

      // Restore original fetch
      globalThis.fetch = this.originalFetch;
      this.isActive = false;
      console.log('🛑 Mock translation server stopped');
      resolve();
    });
  }

  /**
   * Check if server is active
   */
  get isServerRunning(): boolean {
    return this.isActive;
  }

  /**
   * Handle mock translation requests
   */
  private async handleMockRequest(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    try {
      // Parse request body
      let requestData: any = {};
      if (init?.body) {
        if (typeof init.body === 'string') {
          requestData = JSON.parse(init.body);
        } else if (init.body instanceof ReadableStream) {
          // Handle ReadableStream if needed
          const reader = init.body.getReader();
          const chunks: Uint8Array[] = [];
          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (value) chunks.push(value);
            done = readerDone;
          }
          const bodyText = new TextDecoder().decode(
            concatenateUint8Arrays(chunks)
          );
          requestData = JSON.parse(bodyText);
        }
      }

      // Generate mock translation
      const response = this.generateMockTranslation(requestData);

      // Return mock response
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    } catch (error) {
      console.error('❌ Failed to generate mock translation:', error);
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Generate mock translation based on request data
   */
  private generateMockTranslation(requestData: any): any {
    const { prompt, targetLanguage } = this.parsePrompt(requestData.prompt);

    // Get mock translation
    const mockTranslation = this.getMockTranslation(prompt, targetLanguage);

    return {
      model: requestData.model || 'mock-model',
      response: mockTranslation,
      done: true,
      context: [],
      total_duration: 1000000000,
      load_duration: 100000000,
      prompt_eval_count: 10,
      prompt_eval_duration: 100000000,
      eval_count: 10,
      eval_duration: 100000000,
    };
  }

  /**
   * Parse the prompt to extract the text to translate
   */
  private parsePrompt(prompt: string): {
    prompt: string;
    targetLanguage: string;
  } {
    // Extract text after "Text to translate: " and before "Translation:"
    const textMatch = prompt.match(
      /Text to translate: (.+?)(?:\n\nTranslation:|$)/s
    );
    const text = textMatch ? textMatch[1].trim() : 'Hello';

    // Extract target language from prompt
    const langMatch = prompt.match(/Translate the given text to (\w+)/);
    const targetLanguage = langMatch ? langMatch[1] : 'en';

    return { prompt: text, targetLanguage };
  }

  /**
   * Get mock translation for the given text and target language
   */
  private getMockTranslation(text: string, targetLanguage: string): string {
    const translations = mockTranslations[targetLanguage];
    if (!translations) {
      return `[MOCK_${targetLanguage.toUpperCase()}_${text}]`;
    }

    // Try to find exact match first
    if (translations[text]) {
      return translations[text];
    }

    // Try to find partial matches
    for (const [key, translation] of Object.entries(translations)) {
      if (text.includes(key) || key.includes(text)) {
        return translation;
      }
    }

    // Generate a mock translation if no match found
    return `[MOCK_${targetLanguage.toUpperCase()}_${text}]`;
  }
}

// Helper function to concatenate Uint8Arrays
function concatenateUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Export the server class
export { MockTranslationServer };

// If this file is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = MockTranslationServer.getInstance();

  server
    .start()
    .then(() => {
      console.log('✅ Mock server is ready for testing');
      console.log('📍 Endpoint: http://localhost:11434/api/generate');
      console.log('🌍 Supported languages: fr, de');
      console.log(
        '💡 This is a fetch interceptor - no actual server is running'
      );

      // Keep the server running
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down mock server...');
        await server.stop();
        process.exit(0);
      });
    })
    .catch(error => {
      console.error('❌ Failed to start mock server:', error);
      process.exit(1);
    });
}
