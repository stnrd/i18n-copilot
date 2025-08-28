import { TranslationData } from './parser';

export interface TranslationDiff {
  added: string[];
  modified: string[];
  removed: string[];
  unchanged: string[];
}

export interface DiffOptions {
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
  deepComparison?: boolean;
  contextLines?: number;
}

export interface DiffResult {
  diff: TranslationDiff;
  summary: {
    totalKeys: number;
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
    unchangedCount: number;
  };
  details: {
    [key: string]: {
      oldValue?: string;
      newValue?: string;
      changeType: 'added' | 'modified' | 'removed' | 'unchanged';
    };
  };
}

export class TranslationDiffDetector {
  private options: DiffOptions;

  constructor(options: DiffOptions = {}) {
    this.options = {
      ignoreCase: false,
      ignoreWhitespace: true,
      deepComparison: true,
      contextLines: 3,
      ...options,
    };
  }

  /**
   * Compare two translation objects and detect differences
   */
  detectDiff(oldData: TranslationData, newData: TranslationData): DiffResult {
    const oldKeys = this.extractAllKeys(oldData);
    const newKeys = this.extractAllKeys(newData);

    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];
    const unchanged: string[] = [];
    const details: DiffResult['details'] = {};

    // Find added and modified keys
    for (const key of newKeys) {
      const oldValue = this.getNestedValue(oldData, key);
      const newValue = this.getNestedValue(newData, key);

      if (oldValue === undefined) {
        added.push(key);
        details[key] = {
          newValue: newValue || '',
          changeType: 'added',
        };
      } else if (this.valuesAreDifferent(oldValue, newValue || '')) {
        modified.push(key);
        details[key] = {
          oldValue,
          newValue: newValue || '',
          changeType: 'modified',
        };
      } else {
        unchanged.push(key);
        details[key] = {
          oldValue,
          newValue: newValue || '',
          changeType: 'unchanged',
        };
      }
    }

    // Find removed keys
    for (const key of oldKeys) {
      if (!newKeys.includes(key)) {
        removed.push(key);
        const oldValue = this.getNestedValue(oldData, key);
        details[key] = {
          oldValue: oldValue || '',
          changeType: 'removed',
        };
      }
    }

    const diff: TranslationDiff = {
      added,
      modified,
      removed,
      unchanged,
    };

    return {
      diff,
      summary: {
        totalKeys: newKeys.length,
        addedCount: added.length,
        modifiedCount: modified.length,
        removedCount: removed.length,
        unchangedCount: unchanged.length,
      },
      details,
    };
  }

  /**
   * Detect only new keys (for translation workflow)
   */
  detectNewKeys(oldData: TranslationData, newData: TranslationData): string[] {
    const oldKeys = this.extractAllKeys(oldData);
    const newKeys = this.extractAllKeys(newData);

    return newKeys.filter(key => !oldKeys.includes(key));
  }

  /**
   * Detect modified keys
   */
  detectModifiedKeys(
    oldData: TranslationData,
    newData: TranslationData
  ): string[] {
    const oldKeys = this.extractAllKeys(oldData);
    const newKeys = this.extractAllKeys(newData);

    return newKeys.filter(key => {
      if (!oldKeys.includes(key)) return false;

      const oldValue = this.getNestedValue(oldData, key);
      const newValue = this.getNestedValue(newData, key);

      return this.valuesAreDifferent(oldValue || '', newValue || '');
    });
  }

  /**
   * Extract all keys from translation data using dot notation
   */
  private extractAllKeys(data: TranslationData, prefix = ''): string[] {
    const keys: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'string') {
        keys.push(fullKey);
      } else if (typeof value === 'object' && value !== null) {
        keys.push(...this.extractAllKeys(value, fullKey));
      }
    }

    return keys;
  }

  /**
   * Get nested value by dot notation key
   */
  private getNestedValue(
    data: TranslationData,
    key: string
  ): string | undefined {
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
   * Compare two values considering options
   */
  private valuesAreDifferent(oldValue: string, newValue: string): boolean {
    if (oldValue === newValue) return false;

    let old = oldValue;
    let new_ = newValue;

    if (this.options.ignoreCase) {
      old = old.toLowerCase();
      new_ = new_.toLowerCase();
    }

    if (this.options.ignoreWhitespace) {
      old = old.trim();
      new_ = new_.trim();
    }

    return old !== new_;
  }

  /**
   * Generate a human-readable diff report
   */
  generateDiffReport(diffResult: DiffResult): string {
    const { diff, summary } = diffResult;

    let report = `Translation Diff Report\n`;
    report += `========================\n\n`;

    report += `Summary:\n`;
    report += `- Total keys: ${summary.totalKeys}\n`;
    report += `- Added: ${summary.addedCount}\n`;
    report += `- Modified: ${summary.modifiedCount}\n`;
    report += `- Removed: ${summary.removedCount}\n`;
    report += `- Unchanged: ${summary.unchangedCount}\n\n`;

    if (diff.added.length > 0) {
      report += `Added Keys:\n`;
      diff.added.forEach(key => {
        report += `+ ${key}\n`;
      });
      report += `\n`;
    }

    if (diff.modified.length > 0) {
      report += `Modified Keys:\n`;
      diff.modified.forEach(key => {
        const detail = diffResult.details[key];
        report += `~ ${key}\n`;
        if (detail && detail.oldValue && detail.newValue) {
          report += `  Old: "${detail.oldValue}"\n`;
          report += `  New: "${detail.newValue}"\n`;
        }
      });
      report += `\n`;
    }

    if (diff.removed.length > 0) {
      report += `Removed Keys:\n`;
      diff.removed.forEach(key => {
        report += `- ${key}\n`;
      });
      report += `\n`;
    }

    return report;
  }

  /**
   * Check if there are any changes
   */
  hasChanges(diffResult: DiffResult): boolean {
    return (
      diffResult.summary.addedCount > 0 ||
      diffResult.summary.modifiedCount > 0 ||
      diffResult.summary.removedCount > 0
    );
  }

  /**
   * Get only the keys that need translation (new + modified)
   */
  getKeysNeedingTranslation(diffResult: DiffResult): string[] {
    return [...diffResult.diff.added, ...diffResult.diff.modified];
  }

  /**
   * Get keys that are missing or empty in target file compared to base file
   * This is specifically for translation workflow where we want to translate
   * missing or empty keys but not re-translate existing translations
   */
  getKeysNeedingIncrementalTranslation(
    baseData: TranslationData,
    targetData: TranslationData
  ): string[] {
    const baseKeys = this.extractAllKeys(baseData);
    const keysNeedingTranslation: string[] = [];

    for (const key of baseKeys) {
      const targetValue = this.getNestedValue(targetData, key);

      // Key is missing or is an empty/whitespace-only string
      if (targetValue === undefined || targetValue.trim() === '') {
        keysNeedingTranslation.push(key);
      }
    }

    return keysNeedingTranslation;
  }

  /**
   * Detect keys that have changed between two versions of base data
   * This is used to identify which keys need re-translation when base content changes
   */
  getChangedKeys(
    currentBaseData: TranslationData,
    previousBaseData: TranslationData
  ): string[] {
    const currentKeys = this.extractAllKeys(currentBaseData);
    const previousKeys = this.extractAllKeys(previousBaseData);
    const changedKeys: string[] = [];

    // Check for modified existing keys
    for (const key of currentKeys) {
      if (previousKeys.includes(key)) {
        const currentValue = this.getNestedValue(currentBaseData, key);
        const previousValue = this.getNestedValue(previousBaseData, key);

        if (this.valuesAreDifferent(currentValue || '', previousValue || '')) {
          changedKeys.push(key);
        }
      }
    }

    // Check for newly added keys
    for (const key of currentKeys) {
      if (!previousKeys.includes(key)) {
        changedKeys.push(key);
      }
    }

    return changedKeys;
  }

  /**
   * Filter diff by key patterns
   */
  filterDiffByPattern(
    diffResult: DiffResult,
    pattern: RegExp | string
  ): DiffResult {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    const filterKeys = (keys: string[]) => keys.filter(key => regex.test(key));

    const filteredDiff: TranslationDiff = {
      added: filterKeys(diffResult.diff.added),
      modified: filterKeys(diffResult.diff.modified),
      removed: filterKeys(diffResult.diff.removed),
      unchanged: filterKeys(diffResult.diff.unchanged),
    };

    // Recalculate summary
    const summary = {
      totalKeys:
        filteredDiff.added.length +
        filteredDiff.modified.length +
        filteredDiff.unchanged.length,
      addedCount: filteredDiff.added.length,
      modifiedCount: filteredDiff.modified.length,
      removedCount: filteredDiff.removed.length,
      unchangedCount: filteredDiff.unchanged.length,
    };

    // Filter details
    const details: DiffResult['details'] = {};
    for (const key of Object.keys(diffResult.details)) {
      if (regex.test(key)) {
        const detail = diffResult.details[key];
        if (detail) {
          details[key] = detail;
        }
      }
    }

    return {
      diff: filteredDiff,
      summary,
      details,
    };
  }
}

export default TranslationDiffDetector;
