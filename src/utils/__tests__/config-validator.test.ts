import { ConfigValidator } from '../config-validator';

// Mock fs module for file system operations
const mockedFs = {
  existsSync: jest.fn().mockReturnValue(true),
  statSync: jest.fn().mockReturnValue({ isDirectory: () => true }),
};

jest.mock('fs', () => mockedFs);

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
    jest.clearAllMocks();

    // Reset fs mocks to default values
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.statSync.mockReturnValue({ isDirectory: () => true });
  });

  describe('constructor', () => {
    it('should create validator with default schema', () => {
      expect(validator).toBeInstanceOf(ConfigValidator);
    });
  });

  describe('validateConfig', () => {
    it('should validate a complete valid configuration', () => {
      const validConfig = {
        watchPath: '/path/to/watch',
        baseLanguage: 'en',
        targetLanguages: ['es', 'fr'],
        provider: {
          type: 'openai',
          config: { apiKey: 'test-key' },
        },
        batchSize: 10,
        retryAttempts: 3,
        logLevel: 'info',
      };

      const result = validator.validateConfig(validConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      // Note: warnings are generated based on business logic, not schema validation
    });

    it('should reject null configuration', () => {
      const result = validator.validateConfig(null);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe('root');
      expect(result.errors[0]?.message).toBe('Configuration must be an object');
    });

    it('should reject undefined configuration', () => {
      const result = validator.validateConfig(undefined);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe('root');
      expect(result.errors[0]?.message).toBe('Configuration must be an object');
    });

    it('should reject non-object configuration', () => {
      const result = validator.validateConfig('not an object');

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.path).toBe('root');
      expect(result.errors[0]?.message).toBe('Configuration must be an object');
    });

    it('should handle validation errors gracefully', () => {
      const invalidConfig = {
        watchPath: '', // Empty string violates minLength
        baseLanguage: 'invalid', // Too long
        targetLanguages: [], // Empty array violates minLength
        provider: {
          type: 'invalid-provider', // Not in enum
          config: 'not an object', // Wrong type
        },
        batchSize: 150, // Exceeds maxValue
        retryAttempts: 15, // Exceeds maxValue
      };

      const result = validator.validateConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('schema validation', () => {
    it('should validate required fields', () => {
      const config = {
        // Missing required fields
        filePattern: '*.json',
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'watchPath' && e.message.includes('Required')
        )
      ).toBe(true);
      expect(
        result.errors.some(
          e => e.path === 'baseLanguage' && e.message.includes('Required')
        )
      ).toBe(true);
      expect(
        result.errors.some(
          e => e.path === 'targetLanguages' && e.message.includes('Required')
        )
      ).toBe(true);
      // Note: provider is now validated through provider.type and provider.config
    });

    it('should validate string type constraints', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        filePattern: '', // Empty string violates minLength: 1
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'filePattern' && e.message.includes('at least 1')
        )
      ).toBe(true);
    });

    it('should validate number type constraints', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        batchSize: 0, // Below minValue
        retryAttempts: 11, // Above maxValue
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'batchSize' && e.message.includes('at least 1')
        )
      ).toBe(true);
      expect(
        result.errors.some(
          e => e.path === 'retryAttempts' && e.message.includes('at most 10')
        )
      ).toBe(true);
    });

    it('should validate array type constraints', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: [], // Empty array violates minLength
        provider: { type: 'openai', config: {} },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'targetLanguages' && e.message.includes('at least 1')
        )
      ).toBe(true);
    });

    it('should validate enum values', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'invalid-provider', config: {} },
        logLevel: 'invalid-level',
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'provider.type' && e.message.includes('one of')
        )
      ).toBe(true);
      expect(
        result.errors.some(
          e => e.path === 'logLevel' && e.message.includes('one of')
        )
      ).toBe(true);
    });
  });

  describe('business logic validation', () => {
    it('should validate watch path existence', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const config = {
        watchPath: '/nonexistent/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'watchPath' && e.message.includes('does not exist')
        )
      ).toBe(true);
    });

    it('should validate watch path is a directory', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.statSync.mockReturnValue({ isDirectory: () => false });

      const config = {
        watchPath: '/path/to/file.txt',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e =>
            e.path === 'watchPath' && e.message.includes('must be a directory')
        )
      ).toBe(true);
    });

    it('should validate language code format', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'invalid-language-code',
        targetLanguages: ['es', 'invalid-lang'],
        provider: { type: 'openai', config: {} },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e =>
            e.path === 'baseLanguage' &&
            e.message.includes('Invalid language code')
        )
      ).toBe(true);
      expect(
        result.errors.some(
          e =>
            e.path === 'targetLanguages[1]' &&
            e.message.includes('Invalid language code')
        )
      ).toBe(true);
    });

    it('should accept valid language codes', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es', 'fr', 'de', 'pt-BR'],
        provider: { type: 'openai', config: {} },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
    });

    it('should validate provider configuration', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: {
          // Missing type and config
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'provider.type' && e.message.includes('required')
        )
      ).toBe(true);
      expect(
        result.errors.some(
          e => e.path === 'provider.config' && e.message.includes('required')
        )
      ).toBe(true);
    });

    it('should validate numeric ranges', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        batchSize: 0, // Below minimum
        retryAttempts: 15, // Above maximum
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'batchSize' && e.message.includes('at least 1')
        )
      ).toBe(true);
      expect(
        result.errors.some(
          e => e.path === 'retryAttempts' && e.message.includes('at most 10')
        )
      ).toBe(true);
    });
  });

  describe('warnings generation', () => {
    it('should warn about large batch sizes', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        batchSize: 75,
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('Large batch size'))).toBe(
        true
      );
    });

    it('should warn about aggressive retry settings', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        retryAttempts: 8,
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('High retry attempts'))).toBe(
        true
      );
    });

    it('should warn about missing log level', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        // No logLevel specified
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('log level'))).toBe(true);
    });
  });

  describe('validation report generation', () => {
    it('should generate report for valid configuration', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
      };

      const result = validator.validateConfig(config);
      const report = validator.generateValidationReport(result);

      expect(report).toContain('✅ Configuration is valid!');
      expect(report).toContain('Configuration Validation Report');
    });

    it('should generate report for invalid configuration', () => {
      const config = {
        // Missing required fields
        filePattern: '*.json',
      };

      const result = validator.validateConfig(config);
      const report = validator.generateValidationReport(result);

      expect(report).toContain('❌ Configuration has errors:');
      expect(report).toContain('watchPath: Required field is missing');
      expect(report).toContain('baseLanguage: Required field is missing');
    });

    it('should include warnings in report', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        // No logLevel specified
      };

      const result = validator.validateConfig(config);
      const report = validator.generateValidationReport(result);

      expect(report).toContain('⚠️  Warnings:');
      expect(report).toContain('No log level specified');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle fs module errors gracefully', () => {
      mockedFs.existsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e =>
            e.path === 'watchPath' &&
            e.message.includes('Cannot access watch path')
        )
      ).toBe(true);
    });

    it('should handle validation exceptions', () => {
      // Create a config that would cause validation to throw
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
      };

      // Mock a scenario where validation throws an error
      const originalValidateBusinessRules = (validator as any)
        .validateBusinessRules;
      (validator as any).validateBusinessRules = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('Unexpected validation error');
        });

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e =>
            e.path === 'root' &&
            e.message.includes('Validation failed with error')
        )
      ).toBe(true);

      // Restore original method
      (validator as any).validateBusinessRules = originalValidateBusinessRules;
    });

    it('should handle custom validation functions', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        customField: 'test',
      };

      // Add a custom validation rule to the schema
      const schema = (validator as any).schema;
      schema.customField = {
        custom: (value: any, path: string) => {
          if (value === 'test') {
            return {
              path,
              message: 'Custom validation failed',
              value,
              expected: "not 'test'",
            };
          }
          return null;
        },
      };

      const result = validator.validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e =>
            e.path === 'customField' &&
            e.message.includes('Custom validation failed')
        )
      ).toBe(true);
    });
  });

  describe('type validation', () => {
    it('should validate string types correctly', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        stringField: 'valid string',
      };

      // Add string validation rule
      const schema = (validator as any).schema;
      schema.stringField = { type: 'string', minLength: 5 };

      const result = validator.validateConfig(config);
      expect(result.isValid).toBe(true);
    });

    it('should validate number types correctly', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        numberField: 42,
      };

      // Add number validation rule
      const schema = (validator as any).schema;
      schema.numberField = { type: 'number', minValue: 0, maxValue: 100 };

      const result = validator.validateConfig(config);
      expect(result.isValid).toBe(true);
    });

    it('should validate boolean types correctly', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        booleanField: true,
      };

      // Add boolean validation rule
      const schema = (validator as any).schema;
      schema.booleanField = { type: 'boolean' };

      const result = validator.validateConfig(config);
      expect(result.isValid).toBe(true);
    });

    it('should validate array types correctly', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        arrayField: [1, 2, 3],
      };

      // Add array validation rule
      const schema = (validator as any).schema;
      schema.arrayField = { type: 'array', minLength: 2, maxLength: 5 };

      const result = validator.validateConfig(config);
      expect(result.isValid).toBe(true);
    });

    it('should validate object types correctly', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        objectField: { key: 'value' },
      };

      // Add object validation rule
      const schema = (validator as any).schema;
      schema.objectField = { type: 'object' };

      const result = validator.validateConfig(config);
      expect(result.isValid).toBe(true);
    });
  });

  describe('pattern validation', () => {
    it('should validate string patterns correctly', () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        patternField: 'test123',
      };

      // Add pattern validation rule
      const schema = (validator as any).schema;
      schema.patternField = { type: 'string', pattern: /^[a-z]+\d+$/ };

      const result = validator.validateConfig(config);
      expect(result.isValid).toBe(true);
    });

    it("should reject strings that don't match pattern", () => {
      const config = {
        watchPath: '/path',
        baseLanguage: 'en',
        targetLanguages: ['es'],
        provider: { type: 'openai', config: {} },
        patternField: '123test', // Doesn't match pattern
      };

      // Add pattern validation rule
      const schema = (validator as any).schema;
      schema.patternField = { type: 'string', pattern: /^[a-z]+\d+$/ };

      const result = validator.validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          e => e.path === 'patternField' && e.message.includes('pattern')
        )
      ).toBe(true);
    });
  });
});
