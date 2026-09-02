type QueuedRender<T> = {
  id: number;
  priority: number;
  signal: AbortSignal;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  abort: () => void;
};

/** One scheduler per PDF document. It bounds page.render() concurrency and
 * removes superseded width/page jobs before they allocate a Canvas. */
export class PdfRenderScheduler {
  private active = 0;
  private nextId = 1;
  private readonly queue: QueuedRender<unknown>[] = [];

  constructor(private readonly concurrency: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
      throw new TypeError("PDF render concurrency must be a positive integer.");
    }
  }

  schedule<T>(
    run: () => Promise<T>,
    signal: AbortSignal,
    priority = 0,
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(createAbortError());
    return new Promise<T>((resolve, reject) => {
      const job: QueuedRender<T> = {
        id: this.nextId,
        priority,
        signal,
        run,
        resolve,
        reject,
        abort: () => {
          const index = this.queue.indexOf(job as QueuedRender<unknown>);
          if (index < 0) return;
          this.queue.splice(index, 1);
          reject(createAbortError());
        },
      };
      this.nextId += 1;
      signal.addEventListener("abort", job.abort, { once: true });
      this.queue.push(job as QueuedRender<unknown>);
      this.queue.sort((left, right) => right.priority - left.priority || left.id - right.id);
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      job.signal.removeEventListener("abort", job.abort);
      if (job.signal.aborted) {
        job.reject(createAbortError());
        continue;
      }
      this.active += 1;
      void job.run().then(job.resolve, job.reject).finally(() => {
        this.active -= 1;
        this.drain();
      });
    }
  }
}

function createAbortError() {
  return new DOMException("PDF render was superseded.", "AbortError");
}
