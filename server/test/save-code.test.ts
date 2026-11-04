import { describe, expect, it } from 'vitest';
import { saveCode } from '../api/save-code';

describe('POST /api/save-code', () => {
  it('sends the browser straight back to the game, without reading the code', async () => {
    const request = new Request('http://localhost/api/save-code', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=CrossWordle+recovery+code&password=ABCDE-FGHJK-MNPQR-STVWX',
    });
    const response = await saveCode()({ request });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(request.bodyUsed).toBe(false);
  });
});
