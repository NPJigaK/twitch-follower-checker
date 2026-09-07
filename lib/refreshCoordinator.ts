export type RefreshSuccess<T> = Readonly<{
  ok: true;
  value: T;
}>;

export type RefreshFailure<E> = Readonly<{
  ok: false;
  error: E;
}>;

export type RefreshResult<T, E> = RefreshSuccess<T> | RefreshFailure<E>;

export type RefreshStatus = "idle" | "loading" | "success" | "error";

export type RefreshState<T, E> = Readonly<{
  status: RefreshStatus;
  generation: number;
  value: T | null;
  error: E | null;
  stale: boolean;
}>;

export type RefreshExecution<T, E> = (
  signal: AbortSignal,
  generation: number
) => Promise<RefreshResult<T, E>>;

type Listener<T, E> = (state: RefreshState<T, E>) => void;

type ActiveRefresh = {
  generation: number;
  controller: AbortController;
  promise: Promise<boolean>;
};

/**
 * Coordinates asynchronous refreshes independently from React.
 *
 * A coordinator may be deactivated and activated again because React Strict
 * Mode intentionally replays effects in development. Every state transition is
 * guarded by both an activation epoch and a monotonically increasing request
 * generation, so a cancelled request cannot publish a late result or clear a
 * newer request's lock.
 */
export class RefreshCoordinator<T, E> {
  private readonly execute: RefreshExecution<T, E>;
  private readonly mapUnexpectedError: (cause: unknown) => E;
  private readonly listeners = new Set<Listener<T, E>>();
  private active = false;
  private generation = 0;
  private activeRefresh: ActiveRefresh | null = null;
  private state: RefreshState<T, E>;

  constructor(
    execute: RefreshExecution<T, E>,
    mapUnexpectedError: (cause: unknown) => E,
    initialValue: T | null = null
  ) {
    this.execute = execute;
    this.mapUnexpectedError = mapUnexpectedError;
    this.state = {
      status: "idle",
      generation: this.generation,
      value: initialValue,
      error: null,
      stale: false,
    };
  }

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
    this.generation += 1;

    const activeRefresh = this.activeRefresh;
    this.activeRefresh = null;
    activeRefresh?.controller.abort();
  }

  subscribe(listener: Listener<T, E>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): RefreshState<T, E> {
    return this.state;
  }

  getCommitCandidate(): Readonly<{ generation: number; value: T }> | null {
    if (
      !this.active ||
      this.activeRefresh !== null ||
      this.state.status !== "success" ||
      this.state.error !== null ||
      this.state.stale ||
      this.state.value === null ||
      this.state.generation !== this.generation
    ) {
      return null;
    }

    return {
      generation: this.state.generation,
      value: this.state.value,
    };
  }

  replaceCommittedValue(generation: number, value: T): boolean {
    const candidate = this.getCommitCandidate();
    if (candidate === null || candidate.generation !== generation) {
      return false;
    }

    this.publish({
      ...this.state,
      value,
    });
    return true;
  }

  invalidate(error: E): void {
    if (!this.active) {
      return;
    }

    this.publish({
      ...this.state,
      status: "error",
      error,
      stale: this.state.value !== null,
    });
  }

  refresh(): Promise<boolean> {
    if (!this.active) {
      return Promise.resolve(false);
    }

    if (this.activeRefresh !== null) {
      return this.activeRefresh.promise;
    }

    const generation = ++this.generation;
    const controller = new AbortController();
    let settlePublicPromise: (succeeded: boolean) => void = () => undefined;
    const publicPromise = new Promise<boolean>((resolve) => {
      settlePublicPromise = resolve;
    });
    const activeRefresh = {
      generation,
      controller,
      promise: publicPromise,
    };

    this.activeRefresh = activeRefresh;
    this.publish({
      status: "loading",
      generation,
      value: this.state.value,
      error: null,
      stale: this.state.value !== null,
    });

    // The public promise exists before loading listeners are notified. A
    // synchronous listener that calls refresh() therefore receives the exact
    // in-flight promise instead of a temporary already-resolved placeholder.
    void this.run(activeRefresh).then(settlePublicPromise, () => {
      settlePublicPromise(false);
    });
    return publicPromise;
  }

  private isCurrent(activeRefresh: ActiveRefresh): boolean {
    return (
      this.active &&
      this.activeRefresh === activeRefresh &&
      this.generation === activeRefresh.generation &&
      !activeRefresh.controller.signal.aborted
    );
  }

  private async run(activeRefresh: ActiveRefresh): Promise<boolean> {
    try {
      const result = await this.execute(
        activeRefresh.controller.signal,
        activeRefresh.generation
      );

      if (!this.isCurrent(activeRefresh)) {
        return false;
      }

      if (result.ok) {
        this.publish({
          status: "success",
          generation: activeRefresh.generation,
          value: result.value,
          error: null,
          stale: false,
        });
        return true;
      }

      this.publish({
        status: "error",
        generation: activeRefresh.generation,
        value: this.state.value,
        error: result.error,
        stale: this.state.value !== null,
      });
      return false;
    } catch (cause) {
      if (this.isCurrent(activeRefresh)) {
        this.publish({
          status: "error",
          generation: activeRefresh.generation,
          value: this.state.value,
          error: this.mapUnexpectedError(cause),
          stale: this.state.value !== null,
        });
      }
      return false;
    } finally {
      if (this.activeRefresh === activeRefresh) {
        this.activeRefresh = null;
      }
    }
  }

  private publish(nextState: RefreshState<T, E>): void {
    if (!this.active) {
      return;
    }

    this.state = nextState;
    this.listeners.forEach((listener) => listener(nextState));
  }
}
