import path from 'path';

export interface ValidationError {
  path: string;
  message: string;
  value?: any;
  expected?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  pattern?: RegExp;
  enum?: any[];
  // eslint-disable-next-line
  custom?: (value: any, path: string) => ValidationError | null;
}

export interface ValidationSchema {
  [key: string]: ValidationRule | ValidationSchema;
}

export class ConfigValidator {
  private schema: ValidationSchema;
  private logger?: any;

  constructor(logger?: any) {
    this.schema = this.buildDefaultSchema();
    this.logger = logger;
  }

  /**
   * Validate configuration object
   */
  async validateConfig(config: any): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    try {
      // Basic structure validation
      if (!config || typeof config !== 'object') {
        errors.push({
          path: 'root',
          message: 'Configuration must be an object',
          value: config,
          expected: 'object',
        });
        return { isValid: false, errors, warnings };
      }

      // Validate against schema
      const schemaErrors = this.validateAgainstSchema(config, this.schema, '');
      errors.push(...schemaErrors);

      // Additional business logic validation
      const businessErrors = await this.validateBusinessRules(config);
      errors.push(...businessErrors);

      // Generate warnings for potential issues
      const businessWarnings = this.generateWarnings(config);
      warnings.push(...businessWarnings);
    } catch (error) {
      errors.push({
        path: 'root',
        message: `Validation failed with error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        value: config,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate configuration against schema
   */
  private validateAgainstSchema(
    data: any,
    schema: ValidationSchema,
    path: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const [key, rule] of Object.entries(schema)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Handle dot notation in schema keys (e.g., "provider.type")
      let value: any;
      if (key.includes('.')) {
        const keyParts = key.split('.');
        value = keyParts.reduce((obj, part) => obj?.[part], data);
      } else {
        value = data[key];
      }

      if (this.isValidationRule(rule)) {
        const error = this.validateField(value, rule, currentPath);
        if (error) {
          errors.push(error);
        }
      } else if (this.isValidationSchema(rule)) {
        if (value && typeof value === 'object') {
          const nestedErrors = this.validateAgainstSchema(
            value,
            rule,
            currentPath
          );
          errors.push(...nestedErrors);
        } else if ((rule as any).required !== false) {
          errors.push({
            path: currentPath,
            message: 'Required field is missing',
            expected: 'object',
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validate individual field against rule
   */
  private validateField(
    value: any,
    rule: ValidationRule,
    path: string
  ): ValidationError | null {
    // Check if required
    if (rule.required && (value === undefined || value === null)) {
      return {
        path,
        message: 'Required field is missing',
        expected: 'required value',
      };
    }

    // Skip validation if value is not provided and not required
    if (value === undefined || value === null) {
      return null;
    }

    // Type validation
    if (rule.type && !this.validateType(value, rule.type)) {
      return {
        path,
        message: `Expected type ${rule.type}, got ${typeof value}`,
        value,
        expected: rule.type,
      };
    }

    // String validations
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        return {
          path,
          message: `String must be at least ${rule.minLength} characters long`,
          value,
          expected: `min length ${rule.minLength}`,
        };
      }

      if (rule.maxLength && value.length > rule.maxLength) {
        return {
          path,
          message: `String must be at most ${rule.maxLength} characters long`,
          value,
          expected: `max length ${rule.maxLength}`,
        };
      }

      if (rule.pattern && !rule.pattern.test(value)) {
        return {
          path,
          message: `String does not match required pattern`,
          value,
          expected: `pattern ${rule.pattern}`,
        };
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (rule.minValue !== undefined && value < rule.minValue) {
        return {
          path,
          message: `Value must be at least ${rule.minValue}`,
          value,
          expected: `min value ${rule.minValue}`,
        };
      }

      if (rule.maxValue !== undefined && value > rule.maxValue) {
        return {
          path,
          message: `Value must be at most ${rule.maxValue}`,
          value,
          expected: `max value ${rule.maxValue}`,
        };
      }
    }

    // Array validations
    if (Array.isArray(value)) {
      if (rule.minLength && value.length < rule.minLength) {
        return {
          path,
          message: `Array must have at least ${rule.minLength} items`,
          value,
          expected: `min length ${rule.minLength}`,
        };
      }

      if (rule.maxLength && value.length > rule.maxLength) {
        return {
          path,
          message: `Array must have at most ${rule.maxLength} items`,
          value,
          expected: `max length ${rule.maxLength}`,
        };
      }
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      return {
        path,
        message: `Value must be one of: ${rule.enum.join(', ')}`,
        value,
        expected: `enum values: ${rule.enum.join(', ')}`,
      };
    }

    // Custom validation
    if (rule.custom) {
      const customError = rule.custom(value, path);
      if (customError) {
        return customError;
      }
    }

    return null;
  }

  /**
   * Validate business logic rules
   */
  private async validateBusinessRules(config: any): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Check if watch path exists and is accessible
    if (config.watchPath) {
      try {
        // Try to access fs module - if not available, skip file system validation
        let fs: any;
        try {
          fs = await import('fs');
        } catch {
          // fs module not available, skip file system validation
          this.logger?.warn(
            'File system module not available, skipping path validation'
          );
          return errors;
        }

        // Check if the required functions exist
        if (
          typeof fs.existsSync !== 'function' ||
          typeof fs.statSync !== 'function'
        ) {
          this.logger?.warn(
            'File system functions not available, skipping path validation'
          );
          return errors;
        }

        if (!fs.existsSync(path.resolve(process.cwd(), config.watchPath))) {
          errors.push({
            path: 'watchPath',
            message: 'Watch path does not exist',
            value: config.watchPath,
          });
        } else {
          const stats = fs.statSync(config.watchPath);
          if (!stats.isDirectory()) {
            errors.push({
              path: 'watchPath',
              message: 'Watch path must be a directory',
              value: config.watchPath,
            });
          }
        }
      } catch (error) {
        errors.push({
          path: 'watchPath',
          message: `Cannot access watch path: ${
            error instanceof Error ? error.message : String(error)
          }`,
          value: config.watchPath,
        });
      }
    }

    // Validate language codes
    if (config.baseLanguage && !this.isValidLanguageCode(config.baseLanguage)) {
      errors.push({
        path: 'baseLanguage',
        message: 'Invalid language code format',
        value: config.baseLanguage,
        expected: 'ISO 639-1 or 639-2 language code',
      });
    }

    if (Array.isArray(config.targetLanguages)) {
      config.targetLanguages.forEach((lang: string, index: number) => {
        if (!this.isValidLanguageCode(lang)) {
          errors.push({
            path: `targetLanguages[${index}]`,
            message: 'Invalid language code format',
            value: lang,
            expected: 'ISO 639-1 or 639-2 language code',
          });
        }
      });
    }

    // Validate provider configuration
    if (config.provider) {
      if (!config.provider.type) {
        errors.push({
          path: 'provider.type',
          message: 'Provider type is required',
          expected: 'provider type',
        });
      }

      if (!config.provider.config) {
        errors.push({
          path: 'provider.config',
          message: 'Provider configuration is required',
          expected: 'provider config object',
        });
      }
    }

    // Validate numeric ranges
    if (config.batchSize && (config.batchSize < 1 || config.batchSize > 100)) {
      errors.push({
        path: 'batchSize',
        message: 'Batch size must be between 1 and 100',
        value: config.batchSize,
        expected: '1-100',
      });
    }

    if (
      config.retryAttempts &&
      (config.retryAttempts < 0 || config.retryAttempts > 10)
    ) {
      errors.push({
        path: 'retryAttempts',
        message: 'Retry attempts must be between 0 and 10',
        value: config.retryAttempts,
        expected: '0-10',
      });
    }

    return errors;
  }

  /**
   * Generate warnings for potential issues
   */
  private generateWarnings(config: any): string[] {
    const warnings: string[] = [];

    // Warn about large batch sizes
    if (config.batchSize && config.batchSize > 50) {
      warnings.push(
        'Large batch size may cause rate limiting issues with some LLM providers.'
      );
    }

    // Warn about aggressive retry settings
    if (config.retryAttempts && config.retryAttempts > 5) {
      warnings.push(
        'High retry attempts may cause excessive API usage and costs.'
      );
    }

    // Warn about missing log level
    if (!config.logLevel) {
      warnings.push(
        'No log level specified. Consider setting logLevel for better debugging.'
      );
    }

    return warnings;
  }

  /**
   * Build default validation schema
   */
  private buildDefaultSchema(): ValidationSchema {
    return {
      watchPath: {
        required: true,
        type: 'string',
        minLength: 1,
      },
      baseLanguage: {
        required: true,
        type: 'string',
        minLength: 2,
        maxLength: 5,
      },
      targetLanguages: {
        required: true,
        type: 'array',
        minLength: 1,
        maxLength: 50,
      },
      filePattern: {
        type: 'string',
        minLength: 1,
      },
      // provider object is validated through provider.type and provider.config
      'provider.type': {
        required: true,
        type: 'string',
        enum: ['openai', 'anthropic', 'local', 'custom'],
      },
      'provider.config': {
        required: true,
        type: 'object',
      },
      preserveFormatting: {
        type: 'boolean',
      },
      contextInjection: {
        type: 'boolean',
      },
      batchSize: {
        type: 'number',
        minValue: 1,
        maxValue: 100,
      },
      retryAttempts: {
        type: 'number',
        minValue: 0,
        maxValue: 10,
      },
      createBackups: {
        type: 'boolean',
      },
      logLevel: {
        type: 'string',
        enum: ['debug', 'info', 'warn', 'error'],
      },
    };
  }

  /**
   * Check if value is a validation rule
   */
  private isValidationRule(value: any): value is ValidationRule {
    return (
      value &&
      typeof value === 'object' &&
      ('required' in value ||
        'type' in value ||
        'minLength' in value ||
        'maxLength' in value ||
        'minValue' in value ||
        'maxValue' in value ||
        'pattern' in value ||
        'enum' in value ||
        'custom' in value)
    );
  }

  /**
   * Check if value is a validation schema
   */
  private isValidationSchema(value: any): value is ValidationSchema {
    return value && typeof value === 'object' && !this.isValidationRule(value);
  }

  /**
   * Validate type
   */
  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
      default:
        return false;
    }
  }

  /**
   * Validate language code format
   */
  private isValidLanguageCode(code: string): boolean {
    // ISO 639-1 (2 letters) or ISO 639-2 (3 letters) with optional region
    const languageCodePattern = /^[a-z]{2,3}(-[A-Z]{2})?$/;
    return languageCodePattern.test(code);
  }

  /**
   * Generate human-readable validation report
   */
  generateValidationReport(result: ValidationResult): string {
    let report = 'Configuration Validation Report\n';
    report += '==================================\n\n';

    if (result.isValid) {
      report += '✅ Configuration is valid!\n\n';
    } else {
      report += '❌ Configuration has errors:\n\n';

      result.errors.forEach((error, index) => {
        report += `${index + 1}. ${error.path}: ${error.message}\n`;
        if (error.value !== undefined) {
          report += `   Value: ${JSON.stringify(error.value)}\n`;
        }
        if (error.expected) {
          report += `   Expected: ${error.expected}\n`;
        }
        report += '\n';
      });
    }

    if (result.warnings.length > 0) {
      report += '⚠️  Warnings:\n\n';
      result.warnings.forEach((warning, index) => {
        report += `${index + 1}. ${warning}\n`;
      });
      report += '\n';
    }

    return report;
  }
}

export default ConfigValidator;
