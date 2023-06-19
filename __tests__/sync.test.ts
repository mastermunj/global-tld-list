import axios from 'axios';
import fs from 'fs';

import { Sync } from '../src/sync';

describe('Sync', () => {
  jest.mock('axios');
  jest.mock('fs', () => ({
    promises: {
      writeFile: jest.fn(),
    },
  }));

  const testText =
    '# Version 2020051600, Last Updated Sat May 16 07:07:01 2020 UTC\n\
AAA\n\
AARP\n\
XN--H2BRJ9C\n\
ABARTH';

  const testTLDs = ['aaa', 'aarp', 'भारत', 'abarth'];
  const testMap = new Map();
  for (const tld of testTLDs) {
    testMap.set(tld, 1);
  }

  test(`getData`, async () => {
    const expectedResult = { data: testText };
    const mock = jest.spyOn(axios, 'get');
    mock.mockResolvedValue(expectedResult);
    expect(await Sync.getData()).toBe(expectedResult);
  });

  test(`process`, async () => {
    expect(Sync.process(testText)).toStrictEqual(testMap);
  });

  test(`do`, async () => {
    const expectedResult = { data: testText };
    const mockAxios = jest.spyOn(axios, 'get');
    mockAxios.mockResolvedValue(expectedResult);

    const mockFs = jest.spyOn(fs.promises, 'writeFile');
    mockFs.mockImplementation();

    await Sync.do();
    expect(fs.promises.writeFile).toHaveBeenCalled();
  });
});
