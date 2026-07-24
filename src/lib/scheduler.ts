class BackgroundScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private callbacks: Map<string, { fn: () => void; interval: number; lastRun: number }> = new Map();
  private isRunning = false;
  private visibilityChangeHandler = () => this.handleVisibilityChange();

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), 1000);
    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
  }

  register(id: string, fn: () => void, interval: number) {
    this.callbacks.set(id, { fn, interval, lastRun: 0 });
  }

  unregister(id: string) {
    this.callbacks.delete(id);
  }

  private tick() {
    const now = Date.now();
    for (const [id, { fn, interval, lastRun }] of this.callbacks) {
      if (now - lastRun >= interval) {
        try {
          fn();
          this.callbacks.set(id, { fn, interval, lastRun: now });
        } catch (e) {
          console.error(`Background task ${id} failed:`, e);
        }
      }
    }
  }

  private handleVisibilityChange() {
    if (document.hidden) {
      this.start();
    }
  }
}

export const backgroundScheduler = new BackgroundScheduler();