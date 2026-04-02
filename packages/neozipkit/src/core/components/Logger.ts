/**
 * Global Logger Utility for NeoZipKit
 * Provides centralized console control with configurable log levels
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
}

/**
 * Global Logger class for controlling console output throughout NeoZipKit
 */
export class Logger {
  private static config: LoggerConfig = {
    enabled: true,
    level: 'info'
  };

  private static originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.debug,
    info: console.info
  };

  /**
   * Configure the logger
   */
  static configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current logger configuration
   */
  static getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Enable logging
   */
  static enable(): void {
    this.config.enabled = true;
  }

  /**
   * Disable all logging
   */
  static disable(): void {
    this.config.enabled = false;
  }

  /**
   * Set log level
   */
  static setLevel(level: LogLevel): void {
    this.config.level = level;
  }


  /**
   * Check if a log level should be output
   */
  private static shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const requestedLevelIndex = levels.indexOf(level);
    
    return requestedLevelIndex >= currentLevelIndex;
  }

  /**
   * Log a message
   */
  static log(...args: any[]): void {
    if (this.shouldLog('info')) {
      this.originalConsole.log(...args);
    }
  }

  /**
   * Log an error message
   */
  static error(...args: any[]): void {
    if (this.shouldLog('error')) {
      this.originalConsole.error(...args);
    }
  }

  /**
   * Log a warning message
   */
  static warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      this.originalConsole.warn(...args);
    }
  }

  /**
   * Log a debug message
   */
  static debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      // Use console.log for debug messages to ensure they're visible
      this.originalConsole.log(...args);
    }
  }

  /**
   * Log an info message
   */
  static info(...args: any[]): void {
    if (this.shouldLog('info')) {
      this.originalConsole.info(...args);
    }
  }


  /**
   * Override console methods globally (use with caution)
   */
  static overrideConsole(): void {
    console.log = (...args: any[]) => this.log(...args);
    console.error = (...args: any[]) => this.error(...args);
    console.warn = (...args: any[]) => this.warn(...args);
    console.debug = (...args: any[]) => this.debug(...args);
    console.info = (...args: any[]) => this.info(...args);
  }

  /**
   * Restore original console methods
   */
  static restoreConsole(): void {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.debug = this.originalConsole.debug;
    console.info = this.originalConsole.info;
  }

}

/**
 * Environment-based configuration
 */
export function configureLoggerFromEnvironment(): void {
  const env = typeof process !== 'undefined' ? process.env : {};
  
  // Check for NEOZIP_DEBUG environment variable
  if (env.NEOZIP_DEBUG === 'false') {
    Logger.disable();
  } else if (env.NEOZIP_DEBUG === 'true') {
    Logger.enable();
    Logger.setLevel('debug');
  }

  // Check for NEOZIP_LOG_LEVEL
  if (env.NEOZIP_LOG_LEVEL) {
    const level = env.NEOZIP_LOG_LEVEL as LogLevel;
    if (['debug', 'info', 'warn', 'error', 'silent'].includes(level)) {
      Logger.setLevel(level);
    }
  }

  // Check for NODE_ENV
  if (env.NODE_ENV === 'production') {
    Logger.setLevel('error');
  }
}

// Auto-configure from environment on import
// Only run in Node.js environment
configureLoggerFromEnvironment();
