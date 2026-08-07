// AUTO-GENERATED. DO NOT EDIT.
// Run 'bunx nitro-client' to regenerate.

type FetchFn = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;

export interface NitroAPIOptions {
  baseUrl: string;
  fetch?: FetchFn;
}

export class Stream<E, R = void> {
  readonly done: Promise<R>;
  readonly id: Promise<string>;
  private readonly _resolveId: (value: string) => void;
  private readonly _rejectId: (err: Error) => void;
  private readonly _resolve: (value: R) => void;
  private readonly _reject: (err: Error) => void;
  private readonly _controller = new AbortController();
  private readonly _buffer: E[] = [];
  private readonly _waiters: Array<() => void> = [];
  private _returnValue: R | undefined;

  constructor(baseUrl: string, path: string, method: string, body: unknown, customFetch: FetchFn) {
    const { promise, resolve, reject } = Promise.withResolvers<R>();
    this.done = promise;
    this._resolve = resolve;
    this._reject = reject;
    const { promise: idPromise, resolve: resolveId, reject: rejectId } = Promise.withResolvers<string>();
    this.id = idPromise;
    this._resolveId = resolveId;
    this._rejectId = rejectId;
    void this._start(baseUrl, path, method, body, customFetch);
  }

  private async _start(baseUrl: string, path: string, method: string, body: unknown, customFetch: FetchFn): Promise<void> {
    const headers: Record<string, string> = { Accept: "text/event-stream" };
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      res = await customFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
        signal: this._controller.signal,
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === "AbortError") { this._resolve(undefined as R); this._rejectId(err); return; }
      this._reject(err);
      this._rejectId(err);
      return;
    }
    if (!res.ok || !res.body) {
      const error = new Error(`API error ${res.status}: ${await res.text().catch(() => "")}`);
      this._reject(error);
      this._rejectId(error);
      return;
    }
    // If server returned JSON (not SSE), treat as immediate return value
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const text = await res.text();
      try { this._returnValue = JSON.parse(text) as R; } catch { this._returnValue = text as R; }
      this._resolve(this._returnValue as R);
      for (const w of this._waiters.splice(0)) w();
      this.id.catch(() => {});
      return;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    let currentEvent = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event:")) { currentEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith("data:")) { if (line === "") currentEvent = ""; continue; }
          const raw = line.slice(5).trim();
          if (!raw) continue;
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          if (currentEvent === "__error" || (data && typeof data === "object" && "__error" in data)) {
            const msg = currentEvent === "__error"
              ? (data as { message: string }).message
              : (data as { __error: string }).__error;
            const error = new Error(msg);
            this._reject(error);
            this._rejectId(error);
            currentEvent = "";
            return;
          }
          if (currentEvent === "__job") {
            this._resolveId((data as { id: string }).id);
            currentEvent = "";
            continue;
          }
          if (currentEvent === "__return") {
            this._returnValue = data as R;
            currentEvent = "";
            continue;
          }
          this._buffer.push(data as E);
          for (const w of this._waiters.splice(0)) w();
          currentEvent = "";
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name !== "AbortError") { this._reject(err); this._rejectId(err); return; }
    } finally {
      reader.cancel();
    }
    this._resolve(this._returnValue !== undefined ? this._returnValue : undefined as R);
    for (const w of this._waiters.splice(0)) w();
    // Silence unhandled rejection if no job event was emitted
    this.id.catch(() => {});
  }

  abort(): void { this._controller.abort(); }

  [Symbol.asyncIterator](): AsyncGenerator<E> {
    const self = this;
    let index = 0;
    return (async function* () {
      while (true) {
        if (index < self._buffer.length) { yield self._buffer[index++]!; continue; }
        await new Promise<void>((resolve) => {
          self._waiters.push(resolve);
          void self.done.then(() => resolve(), () => resolve());
        });
        if (index >= self._buffer.length) return;
      }
    })();
  }
}

function _buildRoutes(
  doFetch: <T>(path: string, method: string, body?: unknown) => Promise<T>,
  doStream: <E, R = void>(path: string, method: string, body?: unknown) => Stream<E, R>,
) {
  return { health: { $get: (() => doFetch<{ ok: boolean; service: string }>(`/health`, "GET")) as unknown as (() => Promise<{ ok: boolean; service: string }>) & { $response: { ok: boolean; service: string } } }, mobile: { activities: (() => { const _fn = (id: string) => ({ $patch: ((body?: unknown) => doFetch<{ activity: { id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> } } | { error: string }>(`/mobile/activities/${id}`, "PATCH", body)) as unknown as ((body?: unknown) => Promise<{ activity: { id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> } } | { error: string }>) & { $response: { activity: { id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> } } | { error: string }; $request: { body: { name: string; weights: Array<{ categoryId: string; weightPercent: number }> } } }, archive: { $post: ((body?: unknown) => doFetch<{ ok: true } | { error: string }>(`/mobile/activities/${id}/archive`, "POST", body)) as unknown as ((body?: unknown) => Promise<{ ok: true } | { error: string }>) & { $response: { ok: true } | { error: string } } } }); return Object.assign(_fn, { $get: (() => doFetch<{ activities: Array<{ id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> }> }>(`/mobile/activities`, "GET")) as unknown as (() => Promise<{ activities: Array<{ id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> }> }>) & { $response: { activities: Array<{ id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> }> } }, $post: ((body?: unknown) => doFetch<{ activity: { id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> } } | { error: string }>(`/mobile/activities`, "POST", body)) as unknown as ((body?: unknown) => Promise<{ activity: { id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> } } | { error: string }>) & { $response: { activity: { id: string; name: string; archived: boolean; weights: Array<{ categoryId: string; weightPercent: number }> } } | { error: string }; $request: { body: { name: string; weights: Array<{ categoryId: string; weightPercent: number }> } } }, $param: undefined as unknown as ReturnType<typeof _fn> }); })(), auth: { native: { google: { $post: ((body?: unknown) => doFetch<{ ticket: string } | { error: string }>(`/mobile/auth/native/google`, "POST", body)) as unknown as ((body?: unknown) => Promise<{ ticket: string } | { error: string }>) & { $response: { ticket: string } | { error: string }; $request: { body: { idToken: string } } } } } }, categories: (() => { const _fn = (id: string) => ({ $patch: ((body?: unknown) => doFetch<{ category: { id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean } } | { error: string }>(`/mobile/categories/${id}`, "PATCH", body)) as unknown as ((body?: unknown) => Promise<{ category: { id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean } } | { error: string }>) & { $response: { category: { id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean } } | { error: string }; $request: { body: { name: string; color: string; targetHoursPerWeek: number } } }, archive: { $post: ((body?: unknown) => doFetch<{ ok: true } | { error: string }>(`/mobile/categories/${id}/archive`, "POST", body)) as unknown as ((body?: unknown) => Promise<{ ok: true } | { error: string }>) & { $response: { ok: true } | { error: string } } } }); return Object.assign(_fn, { $get: (() => doFetch<{ categories: Array<{ id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean }> }>(`/mobile/categories`, "GET")) as unknown as (() => Promise<{ categories: Array<{ id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean }> }>) & { $response: { categories: Array<{ id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean }> } }, $post: ((body?: unknown) => doFetch<{ category: { id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean } } | { error: string }>(`/mobile/categories`, "POST", body)) as unknown as ((body?: unknown) => Promise<{ category: { id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean } } | { error: string }>) & { $response: { category: { id: string; name: string; color: string; targetHoursPerWeek: number; isBuffer: boolean; archived: boolean } } | { error: string }; $request: { body: { name: string; color: string; targetHoursPerWeek: number } } }, $param: undefined as unknown as ReturnType<typeof _fn> }); })(), entries: (() => { const _fn = (id: string) => ({ $delete: ((body?: unknown) => doFetch<{ ok: true }>(`/mobile/entries/${id}`, "DELETE", body)) as unknown as ((body?: unknown) => Promise<{ ok: true }>) & { $response: { ok: true } }, $patch: ((body?: unknown) => doFetch<{ entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }>(`/mobile/entries/${id}`, "PATCH", body)) as unknown as ((body?: unknown) => Promise<{ entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }>) & { $response: { entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }; $request: { body: { activityId: string; startedAt: string; endedAt: string; note: undefined | null | string } } } }); return Object.assign(_fn, { $get: (() => doFetch<{ entries: Array<{ id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string }>; recentActivities: Array<{ id: string; name: string }>; frequentActivities: Array<{ id: string; name: string }> }>(`/mobile/entries`, "GET")) as unknown as (() => Promise<{ entries: Array<{ id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string }>; recentActivities: Array<{ id: string; name: string }>; frequentActivities: Array<{ id: string; name: string }> }>) & { $response: { entries: Array<{ id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string }>; recentActivities: Array<{ id: string; name: string }>; frequentActivities: Array<{ id: string; name: string }> }; $request: { query: { limit: undefined | number } } }, $post: ((body?: unknown) => doFetch<{ entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }>(`/mobile/entries`, "POST", body)) as unknown as ((body?: unknown) => Promise<{ entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }>) & { $response: { entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }; $request: { body: { activityId: string; startedAt: string; endedAt: string; note: undefined | null | string } } }, running: { $get: (() => doFetch<{ entry: null | { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } }>(`/mobile/entries/running`, "GET")) as unknown as (() => Promise<{ entry: null | { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } }>) & { $response: { entry: null | { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } } }, $param: undefined as unknown as ReturnType<typeof _fn> }); })(), stats: { $get: (() => doFetch<{ period: { start: string; end: string; kind: "custom" | "day" | "week" | "month" }; categories: Array<{ categoryId: string; name: string; color: string; targetHours: number; actualHours: number; diffHours: number; diffPercent: number; status: "over" | "under" | "on-target"; breakdown: Array<{ activityId: string; activityName: string; hours: number }> }>; trends: Array<{ categoryId: string; name: string; color: string; points: Array<{ periodStart: string; periodEnd: string; actualHours: number; targetHours: number }> }>; trendPeriodCount: number } | { error: string }>(`/mobile/stats`, "GET")) as unknown as (() => Promise<{ period: { start: string; end: string; kind: "custom" | "day" | "week" | "month" }; categories: Array<{ categoryId: string; name: string; color: string; targetHours: number; actualHours: number; diffHours: number; diffPercent: number; status: "over" | "under" | "on-target"; breakdown: Array<{ activityId: string; activityName: string; hours: number }> }>; trends: Array<{ categoryId: string; name: string; color: string; points: Array<{ periodStart: string; periodEnd: string; actualHours: number; targetHours: number }> }>; trendPeriodCount: number } | { error: string }>) & { $response: { period: { start: string; end: string; kind: "custom" | "day" | "week" | "month" }; categories: Array<{ categoryId: string; name: string; color: string; targetHours: number; actualHours: number; diffHours: number; diffPercent: number; status: "over" | "under" | "on-target"; breakdown: Array<{ activityId: string; activityName: string; hours: number }> }>; trends: Array<{ categoryId: string; name: string; color: string; points: Array<{ periodStart: string; periodEnd: string; actualHours: number; targetHours: number }> }>; trendPeriodCount: number } | { error: string }; $request: { query: { period: string; date: undefined | string } } } }, timer: { start: { $post: ((body?: unknown) => doFetch<{ entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }>(`/mobile/timer/start`, "POST", body)) as unknown as ((body?: unknown) => Promise<{ entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }>) & { $response: { entry: { id: string; activityId: string; activityName: string; startedAt: string; endedAt: null | string; note: null | string } } | { error: string }; $request: { body: { activityId: string } } } }, stop: { $post: ((body?: unknown) => doFetch<{ ok: true }>(`/mobile/timer/stop`, "POST", body)) as unknown as ((body?: unknown) => Promise<{ ok: true }>) & { $response: { ok: true } } } } } };
}

class _NitroAPIBase {
  readonly $baseUrl: string;
  private readonly customFetch: FetchFn;

  constructor(options: NitroAPIOptions) {
    this.$baseUrl = options.baseUrl;
    this.customFetch = options.fetch ?? fetch.bind(globalThis);
    Object.assign(this, _buildRoutes(this.doFetch.bind(this), this.doStream.bind(this)));
  }

  doStream<E, R = void>(path: string, method: string, body?: unknown): Stream<E, R> {
    return new Stream<E, R>(this.$baseUrl, path, method, body, this.customFetch);
  }

  private async doFetch<T>(path: string, method: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const res = await this.customFetch(`${this.$baseUrl}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text().catch(() => "")}`);
    const text = await res.text();
    if (!text) return undefined as T;
    const ct = res.headers.get("content-type") ?? "";
    return (ct.includes("application/json") ? JSON.parse(text) : text) as T;
  }
}

export const NitroAPI = _NitroAPIBase as unknown as new (options: NitroAPIOptions) => _NitroAPIBase & ReturnType<typeof _buildRoutes>;
export type NitroAPI = InstanceType<typeof NitroAPI>;
