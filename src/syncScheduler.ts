import type ConfluenceWeaverPlugin from './main';

export class SyncScheduler {
  private intervalId: number | null = null;

  constructor(private plugin: ConfluenceWeaverPlugin) {}

  start(): void {
    if (this.plugin.settings.syncOnStartup) {
      // Delay slightly so the Vault is fully ready
      window.setTimeout(() => this.plugin.syncPages(false), 3000);
    }
    this.scheduleInterval();
  }

  restart(): void {
    this.stop();
    this.scheduleInterval();
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private scheduleInterval(): void {
    const minutes = this.plugin.settings.syncInterval;
    if (minutes > 0) {
      this.intervalId = window.setInterval(
        () => this.plugin.syncPages(false),
        minutes * 60 * 1000
      );
    }
  }
}
