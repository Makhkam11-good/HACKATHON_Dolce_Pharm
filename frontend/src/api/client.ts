import { authToken } from '../offline/session';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Нет связи с сервером');
  }
}

interface Opts {
  method?: string;
  body?: unknown;
  form?: FormData;
  timeout?: number;
  headers?: Record<string, string>;
}

async function rawFetch(path: string, opts: Opts = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 20000);
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  const token = authToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method || (body ? 'POST' : 'GET'), headers, body, signal: ctrl.signal, cache: 'no-store' });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let code = 'error';
    let message = `Ошибка ${res.status}`;
    try {
      const j = await res.json();
      const d = j.detail;
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        code = d.code || code;
        message = d.message || message;
      } else if (typeof d === 'string') message = d;
    } catch {
      /* not json */
    }
    if (res.status === 401 && token) window.dispatchEvent(new CustomEvent('lms:unauthorized'));
    throw new ApiError(res.status, code, message);
  }
  return res;
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const res = await rawFetch(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiBlob(path: string, timeout = 10 * 60 * 1000): Promise<Blob> {
  const res = await rawFetch(path, { timeout });
  return res.blob();
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function download(path: string, filename: string) {
  saveBlob(await apiBlob(path), filename);
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
