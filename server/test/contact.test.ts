import { describe, expect, it } from 'vitest';
import { contact } from '../api/contact';
import { features } from '../api/features';

const request = { request: new Request('http://localhost/api/contact') };

describe('GET /api/contact', () => {
  it("gives the site's contact address, and 404 where it has none", async () => {
    const found = await contact({ contactEmail: 'admin@example.com' })(request);
    expect(await found.json()).toEqual({ email: 'admin@example.com' });
    expect((await contact({})(request)).status).toBe(404);
  });

  it('is listed as a feature only where there is an address', async () => {
    const names = async (config: Parameters<typeof features>[0]) =>
      ((await (await features(config)(request)).json()) as { features: string[] }).features;
    expect(await names({ contactEmail: 'admin@example.com' })).toContain('contact');
    expect(await names({})).not.toContain('contact');
  });
});
