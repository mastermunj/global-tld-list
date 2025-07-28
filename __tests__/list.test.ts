import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';

import { List } from '../src/list';

const testText = '# Version 2020051600, Last Updated Sat May 16 07:07:01 2020 UTC\nAAA\nAARP\nXN--H2BRJ9C\nABARTH';

const unmockedFetch = global.fetch;

beforeAll(() => {
  global.fetch = () =>
    Promise.resolve({
      text: () => Promise.resolve(testText),
    } as Response);
});

afterAll(() => {
  global.fetch = unmockedFetch;
});

describe('Sync', () => {
  vi.mock('node:fs/promises', () => ({
    promises: {
      writeFile: vi.fn(),
    },
  }));

  const testTLDs = ['aaa', 'aarp', 'भारत', 'abarth'];
  const testMap = new Map();
  for (const tld of testTLDs) {
    testMap.set(tld, 1);
  }

  test(`getData`, async () => {
    expect(await List.getData()).toBe(testText);
  });

  test(`process`, async () => {
    expect(List.process(testText)).toStrictEqual(testMap);
  });

  test(`do`, async () => {
    const mockFs = vi.spyOn(fs.promises, 'writeFile');
    mockFs.mockImplementation(() => Promise.resolve());

    await List.generate();
    expect(fs.promises.writeFile).toHaveBeenCalled();
  });
});
