import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequestListener, MAX_BODY_BYTES, type Handler } from '../node-adapter';

// Echoes what the handler saw, so the tests can check the Request built from the Node request.
const echo: Handler = async ({ request }) =>
  new Response(
    JSON.stringify({
      method: request.method,
      path: new URL(request.url).pathname,
      contentType: request.headers.get('content-type'),
      body: await request.json(),
    }),
    { status: 201, headers: { 'content-type': 'application/json', 'x-test': 'yes' } },
  );

const failing: Handler = () => Promise.reject(new Error('boom'));

const status: Handler = ({ request }) =>
  Promise.resolve(
    new Response(JSON.stringify({ method: request.method, ok: true }), {
      headers: { 'content-type': 'application/json' },
    }),
  );

let server: Server;
let base: string;
const logged: { where: string; message: string; request?: string }[] = [];

beforeAll(async () => {
  server = createServer(
    createRequestListener(
      {
        '/api/echo': { POST: echo },
        '/api/fail': { POST: failing },
        '/api/status': { GET: status },
      },
      {
        error: (where, error, context) =>
          logged.push({
            where,
            message: (error as Error).message,
            request: `${context?.request?.method} ${context?.request?.url}`,
          }),
      },
    ),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string, body: string) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

describe('createRequestListener', () => {
  it('passes the method, path, headers and body to the handler and returns its response', async () => {
    const response = await post('/api/echo', '{"guess":"TART"}');
    expect(response.status).toBe(201);
    expect(response.headers.get('x-test')).toBe('yes');
    expect(await response.json()).toEqual({
      method: 'POST',
      path: '/api/echo',
      contentType: 'application/json',
      body: { guess: 'TART' },
    });
  });

  it('ignores the query string when routing', async () => {
    expect((await post('/api/echo?x=1', '{}')).status).toBe(201);
  });

  it('answers 404 for an unknown path', async () => {
    const response = await post('/api/missing', '{}');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not-found' });
  });

  it('does not route inherited object keys', async () => {
    expect((await post('/constructor', '{}')).status).toBe(404);
  });

  it('answers 405 with Allow for a method the path has no handler for', async () => {
    const getEcho = await fetch(`${base}/api/echo`);
    expect(getEcho.status).toBe(405);
    expect(getEcho.headers.get('allow')).toBe('POST');

    const postStatus = await post('/api/status', '{}');
    expect(postStatus.status).toBe(405);
    expect(postStatus.headers.get('allow')).toBe('GET, HEAD');

    expect((await fetch(`${base}/api/echo`, { method: 'PUT', body: '{}' })).status).toBe(405);
  });

  it('routes GET without a body, and answers HEAD from the GET handler without one', async () => {
    const get = await fetch(`${base}/api/status`);
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ method: 'GET', ok: true });

    const head = await fetch(`${base}/api/status`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toBe('application/json');
    expect(await head.text()).toBe('');
  });

  it('refuses a body over the size limit', async () => {
    const response = await post('/api/echo', JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES) }));
    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 500 without details when the handler throws', async () => {
    const response = await post('/api/fail', '{}');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'server-error' });
    expect(logged).toEqual([{ where: 'request', message: 'boom', request: 'POST /api/fail' }]);
  });
});
