import { EventEmitter } from 'events';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context: Record<string, any> | undefined;
  error: Error | undefined;
  source: string | undefined;
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'json' | 'text' | 'simple';
  timestamp?: boolean;
  colors?: boolean;
  output?: 'console' | 'file' | 'both';
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
  includeContext?: boolean;
  includeStack?: boolean;
}

export interface LogFormatter {
  format(entry: LogEntry): string;
}

export class ConsoleFormatter implements LogFormatter {
  private colors: boolean;
  private timestamp: boolean;

  constructor(options: { colors?: boolean; timestamp?: boolean } = {}) {
    this.colors = options.colors ?? true;
    this.timestamp = options.timestamp ?? true;
  }

  format(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.timestamp) {
      parts.push(this.formatTimestamp(entry.timestamp));
    }

    parts.push(this.formatLevel(entry.level));

    if (entry.source) {
      parts.push(`[${entry.source}]`);
    }

    parts.push(entry.message);

    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(this.formatContext(entry.context));
    }

    if (entry.error) {
      parts.push(this.formatError(entry.error));
    }

    return parts.join(' ');
  }

  private formatTimestamp(date: Date): string {
    return date.toISOString();
  }

  private formatLevel(level: LogLevel): string {
    if (!this.colors) {
      return `[${level.toUpperCase()}]`;
    }

    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
    };

    const reset = '\x1b[0m';
    return `${colors[level]}[${level.toUpperCase()}]${reset}`;
  }

  private formatContext(context: Record<string, any>): string {
    return `\n  Context: ${JSON.stringify(context, null, 2)}`;
  }

  private formatError(error: Error): string {
    if (!this.colors) {
      return `\n  Error: ${error.message}`;
    }

    const red = '\x1b[31m';
    const reset = '\x1b[0m';
    return `\n  ${red}Error: ${error.message}${reset}`;
  }
}

export class JsonFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const logObject = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      message: entry.message,
      source: entry.source,
      context: entry.context,
      error: entry.error
        ? {
            message: entry.error.message,
            stack: entry.error.stack,
            name: entry.error.name,
          }
        : undefined,
    };

    return JSON.stringify(logObject);
  }
}

export class SimpleFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return `${entry.level.toUpperCase()}: ${entry.message}`;
  }
}

export class Logger extends EventEmitter {
  private level: LogLevel;
  private formatter: LogFormatter;
  private output: 'console' | 'file' | 'both';
  private filePath?: string;
  private maxFileSize: number;
  private maxFiles: number;
  private includeContext: boolean;

  private static readonly LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(options: LoggerOptions = {}) {
    super();

    this.level = (options.level as LogLevel) || 'info';
    this.output = options.output || 'console';
    this.filePath = options.filePath || '';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.includeContext = options.includeContext ?? true;

    // Set up formatter
    const format: 'json' | 'text' | 'simple' = options.format || 'text';
    const colors = options.colors ?? true;
    const timestamp = options.timestamp ?? true;

    switch (format) {
      case 'json':
        this.formatter = new JsonFormatter();
        break;
      case 'simple':
        this.formatter = new SimpleFormatter();
        break;
      default:
        this.formatter = new ConsoleFormatter({ colors, timestamp });
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, any>, source?: string): void {
    this.log('debug', message, context, source);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, any>, source?: string): void {
    this.log('info', message, context, source);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, any>, source?: string): void {
    this.log('warn', message, context, source);
  }

  /**
   * Log an error message
   */
  error(
    message: string,
    error?: Error,
    context?: Record<string, any>,
    source?: string
  ): void {
    this.log('error', message, context, source, error);
  }

  /**
   * Log a message with the specified level
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    source?: string,
    error?: Error
  ): void {
    // Check if we should log this level
    if (Logger.LOG_LEVELS[level] < Logger.LOG_LEVELS[this.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: this.includeContext ? context : undefined,
      error,
      source,
    };

    // Emit log event
    this.emit('log', entry);

    // Format and output the log entry
    const formattedMessage = this.formatter.format(entry);

    // Console output
    if (this.output === 'console' || this.output === 'both') {
      this.writeToConsole(level, formattedMessage);
    }

    // File output
    if (this.output === 'file' || this.output === 'both') {
      this.writeToFile(formattedMessage);
    }
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        break;
    }
  }

  /**
   * Write log entry to file
   */
  private async writeToFile(message: string): Promise<void> {
    if (!this.filePath) {
      return;
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Append to file
      await fs.appendFile(this.filePath, message + '\n', 'utf-8');

      // Check file size and rotate if needed
      await this.rotateLogFile();
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to log file:', error);
      console.log(message);
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private async rotateLogFile(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const stats = await fs.stat(this.filePath);

      if (stats.size > this.maxFileSize) {
        // Rotate existing log files
        for (let i = this.maxFiles - 1; i > 0; i--) {
          const oldFile = `${this.filePath}.${i}`;
          const newFile = `${this.filePath}.${i + 1}`;

          try {
            await fs.rename(oldFile, newFile);
          } catch {
            // Ignore errors for non-existent files
          }
        }

        // Move current log file
        const rotatedFile = `${this.filePath}.1`;
        await fs.rename(this.filePath, rotatedFile);

        // Create new empty log file
        await fs.writeFile(this.filePath, '', 'utf-8');
      }
    } catch (error) {
      // Ignore rotation errors
      console.error('Log rotation failed:', error);
    }
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
    this.info(`Log level changed to ${level}`);
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if a level should be logged
   */
  shouldLog(level: LogLevel): boolean {
    return Logger.LOG_LEVELS[level] >= Logger.LOG_LEVELS[this.level];
  }

  /**
   * Create a child logger with additional context
   */
  child(source: string, defaultContext?: Record<string, any>): ChildLogger {
    return new ChildLogger(this, source, defaultContext);
  }

  /**
   * Flush any pending log entries
   */
  async flush(): Promise<void> {
    // Emit flush event
    this.emit('flush');

    // Wait a bit for any async operations
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Close the logger and cleanup resources
   */
  async close(): Promise<void> {
    await this.flush();
    this.emit('close');
  }
}

export class ChildLogger {
  private parent: Logger;
  private source: string;
  private defaultContext: Record<string, any>;

  constructor(
    parent: Logger,
    source: string,
    defaultContext: Record<string, any> = {}
  ) {
    this.parent = parent;
    this.source = source;
    this.defaultContext = defaultContext;
  }

  debug(message: string, context?: Record<string, any>): void {
    this.parent.debug(
      message,
      { ...this.defaultContext, ...context },
      this.source
    );
  }

  info(message: string, context?: Record<string, any>): void {
    this.parent.info(
      message,
      { ...this.defaultContext, ...context },
      this.source
    );
  }

  warn(message: string, context?: Record<string, any>): void {
    this.parent.warn(
      message,
      { ...this.defaultContext, ...context },
      this.source
    );
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.parent.error(
      message,
      error,
      { ...this.defaultContext, ...context },
      this.source
    );
  }
}

// Default logger instance
export const defaultLogger = new Logger({
  level: 'info',
  format: 'text',
  colors: true,
  timestamp: true,
});

export default Logger;
