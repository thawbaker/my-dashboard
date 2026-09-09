export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: {} };

  if (body !== undefined) {
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const response = await fetch(path, opts);

  if (response.status === 401) {
    window.location.replace('/sign-in');
    throw new Error('Unauthorized');
  }

  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}
