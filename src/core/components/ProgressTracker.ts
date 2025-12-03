/**
 * Progress tracker for streaming operations
 * Provides real-time progress updates and ETA calculations
 */
export class ProgressTracker {
  private startTime: number;
  private lastUpdateTime: number;
  private totalBytes: number;
  private processedBytes: number;
  private fileName: string;
  private lastReportedPercent: number = -1;

  constructor(fileName: string, totalBytes: number) {
    this.fileName = fileName;
    this.totalBytes = totalBytes;
    this.processedBytes = 0;
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
  }

  /**
   * Update progress with bytes processed
   * @param bytesProcessed - Number of bytes processed in this update
   */
  update(bytesProcessed: number): void {
    this.processedBytes += bytesProcessed;
    this.reportProgress();
  }

  /**
   * Set total bytes (useful when file size changes)
   */
  setTotalBytes(totalBytes: number): void {
    this.totalBytes = totalBytes;
  }

  /**
   * Report progress if enough time has passed or significant progress made
   */
  private reportProgress(): void {
    const now = Date.now();
    const percent = Math.floor((this.processedBytes / this.totalBytes) * 100);
    
    // Report if:
    // 1. 1% or more progress made, OR
    // 2. 500ms have passed since last report
    const shouldReport = 
      percent > this.lastReportedPercent || 
      (now - this.lastUpdateTime) > 500;

    if (shouldReport) {
      this.lastReportedPercent = percent;
      this.lastUpdateTime = now;
      this.printProgress();
    }
  }

  /**
   * Print progress information
   */
  private printProgress(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.processedBytes / elapsed;
    const eta = this.totalBytes > this.processedBytes 
      ? (this.totalBytes - this.processedBytes) / rate 
      : 0;
    const percent = Math.floor((this.processedBytes / this.totalBytes) * 100);

    const formatBytes = (bytes: number): string => {
      const units = ['B', 'KB', 'MB', 'GB'];
      let size = bytes;
      let unitIndex = 0;
      
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }
      
      return `${size.toFixed(1)}${units[unitIndex]}`;
    };

    const formatTime = (seconds: number): string => {
      if (seconds < 60) return `${seconds.toFixed(0)}s`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
      return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    };

    process.stdout.write(
      `\r${this.fileName}: ${percent}% (${formatBytes(this.processedBytes)}/${formatBytes(this.totalBytes)}) ` +
      `[${formatBytes(rate)}/s] ETA: ${formatTime(eta)}`
    );
  }

  /**
   * Complete progress tracking
   */
  complete(): void {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.processedBytes / elapsed;
    
    const formatBytes = (bytes: number): string => {
      const units = ['B', 'KB', 'MB', 'GB'];
      let size = bytes;
      let unitIndex = 0;
      
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }
      
      return `${size.toFixed(1)}${units[unitIndex]}`;
    };

    console.log(
      `\r${this.fileName}: 100% (${formatBytes(this.processedBytes)}) ` +
      `[${formatBytes(rate)}/s] completed in ${elapsed.toFixed(1)}s`
    );
  }

  /**
   * Get current progress percentage
   */
  getProgressPercent(): number {
    return Math.floor((this.processedBytes / this.totalBytes) * 100);
  }

  /**
   * Get processing rate in bytes per second
   */
  getProcessingRate(): number {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return this.processedBytes / elapsed;
  }
}
