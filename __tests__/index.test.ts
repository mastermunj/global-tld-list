import { describe, expect, test, vi } from 'vitest';

import { TLDs } from '../src/index';

describe('TLDs', () => {
  vi.mock('../data/serialized.json', () => ({
    default: [
      ['aaa', 1],
      ['aarp', 1],
      ['abb', 1],
      ['abbott', 1],
    ],
  }));

  test(`isValid`, async () => {
    expect(await TLDs.isValid('aaa')).toBe(true);
  });
});
