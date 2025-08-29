import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';

export interface TranslationData {
  [key: string]: string | TranslationData;
}

export interface ParsedFile {
  data: TranslationData;
  format: 'json' | 'yaml' | 'js' | 'ts';
  originalContent: string;
  path: string;
}

export interface ParserOptions {
  preserveComments?: boolean;
  preserveFormatting?: boolean;
  allowFunctions?: boolean;
  strictMode?: boolean;
}

export class TranslationParser {
  private options: ParserOptions;

  constructor(options: ParserOptions = {}) {
    this.options = {
      preserveComments: true,
      preserveFormatting: true,
      allowFunctions: false,
      strictMode: false,
      ...options,
    };
  }

  /**
   * Parse a translation file from disk
   */
  async parseFile(filePath: string): Promise<ParsedFile> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const format = this.detectFormat(filePath);

      const data = await this.parseContent(content, format);

      return {
        data,
        format,
        originalContent: content,
        path: filePath,
      };
    } catch (error) {
      throw new Error(`Failed to parse file ${filePath}: ${error}`);
    }
  }

  /**
   * Parse content string based on format
   */
  async parseContent(
    content: string,
    format: string
  ): Promise<TranslationData> {
    switch (format) {
      case 'json':
        return this.parseJSON(content);
      case 'yaml':
        return this.parseYAML(content);
      case 'js':
      case 'ts':
        return this.parseJavaScript(content);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Detect file format from extension
   */
  detectFormat(filePath: string): 'json' | 'yaml' | 'js' | 'ts' {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.json':
        return 'json';
      case '.yaml':
      case '.yml':
        return 'yaml';
      case '.js':
        return 'js';
      case '.ts':
        return 'ts';
      default:
        throw new Error(`Unsupported file extension: ${ext}`);
    }
  }

  /**
   * Parse JSON content
   */
  private parseJSON(content: string): TranslationData {
    try {
      // Remove BOM if present
      const cleanContent = content.replace(/^\uFEFF/, '');

      if (this.options.strictMode) {
        return JSON.parse(cleanContent);
      }

      // Try to parse with error recovery
      try {
        return JSON.parse(cleanContent);
      } catch {
        // Try to fix common JSON issues
        const fixedContent = this.fixCommonJSONIssues(cleanContent);
        return JSON.parse(fixedContent);
      }
    } catch (error) {
      throw new Error(`Invalid JSON: ${error}`);
    }
  }

  /**
   * Parse YAML content
   */
  private parseYAML(content: string): TranslationData {
    try {
      const result = yaml.parse(content);

      if (typeof result !== 'object' || result === null) {
        throw new Error('YAML must contain an object');
      }

      return result;
    } catch (error) {
      throw new Error(`Invalid YAML: ${error}`);
    }
  }

  /**
   * Parse JavaScript/TypeScript content
   */
  private parseJavaScript(content: string): TranslationData {
    try {
      // Remove export statements and module wrapper
      const cleanContent = this.cleanJavaScriptContent(content);

      // Use Function constructor for safer evaluation
      const evaluateFunction = new Function(
        'module',
        'exports',
        'require',
        cleanContent + '\nreturn module.exports || exports;'
      );

      const result = evaluateFunction({}, {}, () => {
        throw new Error('require() is not allowed in translation files');
      });

      if (typeof result !== 'object' || result === null) {
        throw new Error('JavaScript file must export an object');
      }

      return result;
    } catch (error) {
      throw new Error(`Invalid JavaScript/TypeScript: ${error}`);
    }
  }

  /**
   * Clean JavaScript content for safe evaluation
   */
  private cleanJavaScriptContent(content: string): string {
    let cleaned = content;

    // Remove export statements
    cleaned = cleaned.replace(/export\s+(default\s+)?/g, '');
    cleaned = cleaned.replace(/module\.exports\s*=\s*/, '');
    cleaned = cleaned.replace(/export\s*\{[^}]*\}/g, '');

    // Remove import statements
    cleaned = cleaned.replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, '');
    cleaned = cleaned.replace(
      /import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\s*/g,
      ''
    );

    // Remove TypeScript type annotations
    cleaned = cleaned.replace(/:\s*[a-zA-Z<>[\]{}|&,()\s]+(?=\s*[,}])/g, '');

    return cleaned;
  }

  /**
   * Fix common JSON parsing issues
   */
  private fixCommonJSONIssues(content: string): string {
    let fixed = content;

    // Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');

    // Remove comments (basic)
    fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');
    fixed = fixed.replace(/\/\/.*$/gm, '');

    // Fix unquoted keys
    fixed = fixed.replace(
      /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
      '$1"$2":'
    );

    return fixed;
  }

  /**
   * Extract all translation keys from parsed data
   */
  extractKeys(data: TranslationData, prefix = ''): string[] {
    const keys: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'string') {
        keys.push(fullKey);
      } else if (typeof value === 'object' && value !== null) {
        keys.push(...this.extractKeys(value, fullKey));
      }
    }

    return keys;
  }

  /**
   * Get nested value by dot notation key
   */
  getNestedValue(data: TranslationData, key: string): string | undefined {
    const keys = key.split('.');
    let current: any = data;

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return undefined;
      }
    }

    return typeof current === 'string' ? current : undefined;
  }

  /**
   * Set nested value by dot notation key
   */
  setNestedValue(data: TranslationData, key: string, value: string): void {
    const keys = key.split('.');
    let current: any = data;

    // Navigate to the parent of the target key
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (k && (!(k in current) || typeof current[k] !== 'object')) {
        current[k] = {};
      }
      if (k) {
        current = current[k];
      }
    }

    // Set the final value
    const finalKey = keys[keys.length - 1];
    if (finalKey) {
      current[finalKey] = value;
    }
  }

  /**
   * Merge two translation objects
   */
  mergeTranslations(
    base: TranslationData,
    updates: TranslationData,
    strategy: 'replace' | 'merge' | 'preserve' = 'merge'
  ): TranslationData {
    const result = { ...base };

    for (const [key, value] of Object.entries(updates)) {
      if (strategy === 'replace') {
        result[key] = value;
      } else if (strategy === 'merge') {
        if (typeof value === 'object' && typeof result[key] === 'object') {
          result[key] = this.mergeTranslations(
            result[key] as TranslationData,
            value as TranslationData,
            strategy
          );
        } else {
          result[key] = value;
        }
      } else if (strategy === 'preserve') {
        if (!(key in result)) {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Validate translation data structure
   */
  validateStructure(data: TranslationData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    const validateNode = (node: any, path: string): void => {
      if (typeof node === 'string') {
        // String values are valid
        return;
      }

      if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
          const fullPath = path ? `${path}.${key}` : key;

          if (typeof value === 'string') {
            // String values are valid
          } else if (typeof value === 'object' && value !== null) {
            validateNode(value, fullPath);
          } else {
            errors.push(`Invalid value type at ${fullPath}: ${typeof value}`);
          }
        }
      } else {
        errors.push(`Invalid node type at ${path}: ${typeof node}`);
      }
    };

    validateNode(data, '');

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert translation data to string format
   */
  stringify(
    data: TranslationData,
    format: 'json' | 'yaml' | 'js',
    options?: { indent?: number; preserveFormatting?: boolean }
  ): string {
    const indent = options?.indent ?? 2;

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, indent);
      case 'yaml':
        return yaml.stringify(data, { indent });
      case 'js':
        return `module.exports = ${JSON.stringify(data, null, indent)};`;
      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }
}

export default TranslationParser;
