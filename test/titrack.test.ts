import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTitrackHtml } from '../src/shared/titrack';

const html = readFileSync(new URL('./fixtures/titrack-5140.html', import.meta.url), 'utf8');

describe('parseTitrackHtml', () => {
  it('returns the most recent hourly bucket', () => {
    const p = parseTitrackHtml(html)!;
    expect(p.bucket).toBe('2026-10-23T18:00:00+00:00');
    expect(p.fe).toBeCloseTo(0.0742857, 6);
    expect(p.p10).toBeCloseTo(0.0677966, 6);
    expect(p.p90).toBeCloseTo(0.0810811, 6);
    expect(p.devices).toBe(391);
  });

  it('accepts unescaped JSON too', () => {
    const p = parseTitrackHtml(
      '{"hour_bucket":"2026-10-20T01:00:00+00:00","price_fe_median":1.5,"price_fe_p10":1,"price_fe_p90":2,"submission_count":3,"unique_devices":2}',
    )!;
    expect(p.fe).toBe(1.5);
  });

  it('returns null without price data', () => {
    expect(parseTitrackHtml('<html>nada</html>')).toBeNull();
  });
});
