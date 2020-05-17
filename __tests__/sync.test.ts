import path from 'path';
import axios from 'axios';
import fs from 'fs';

import { Sync } from '../src/sync';

describe('Sync', () => {
  jest.mock('axios');
  jest.mock('fs');

  const testDataText =
    '# Version 2020051600, Last Updated Sat May 16 07:07:01 2020 UTC\n\
AAA\n\
AARP\n\
XN--H2BRJ9C\n\
ABARTH';

  const testDataTLDs = ['aaa', 'aarp', 'भारत', 'abarth'];

  test(`Test srcPath`, () => {
    const srcPath = path.dirname(__dirname) + '/src';
    expect(Sync.srcPath()).toBe(srcPath);
  });

  test(`Test getData`, async () => {
    const expectedResult = { data: testDataText };
    const mock = jest.spyOn(axios, 'get');
    mock.mockResolvedValue(expectedResult);
    expect(await Sync.getData()).toBe(expectedResult);
  });

  test(`Test process`, async () => {
    expect(Sync.process(testDataText)).toStrictEqual(testDataTLDs);
  });

  test(`Test difference`, async () => {
    const oldTLDs = [...testDataTLDs];
    const newTLDs = [...testDataTLDs];
    const removed = [newTLDs.pop()];
    const added = ['able'];
    newTLDs.push(...added);

    expect(Sync.difference(oldTLDs, newTLDs)).toStrictEqual({ added, removed });
  });

  test(`Test exportableTLDs`, async () => {
    const expectedResult = `export const TLDs = [\n\
  'aaa',\n\
  'aarp',\n\
  'भारत',\n\
  'abarth',\n\
];\n`;

    expect(Sync.exportableTLDs(testDataTLDs)).toStrictEqual(expectedResult);
  });

  // test(`Test changes`, async () => {
  //   const added = ['able'];
  //   const removed = ['abarth'];

  //   // eslint-disable-next-line prettier/prettier
  //   const expectedResult = `Added: ${added.join(', ')}\nRemoved: ${removed.join(', ')}\n`;

  //   expect(Sync.changes(added, removed)).toBe(expectedResult);
  // });

  test(`Test writeTLDs`, async () => {
    const mock = jest.spyOn(fs, 'writeFileSync');
    mock.mockImplementation(() => {
      // do nothing
    });

    Sync.writeTLDs(testDataTLDs);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  // test(`Test writeChanges`, async () => {
  //   const added = ['able'];
  //   const removed = ['abarth'];

  //   const mock = jest.spyOn(fs, 'writeFileSync');
  //   mock.mockImplementation(() => {
  //     // do nothing
  //   });

  //   Sync.writeChanges(added, removed);
  //   expect(fs.writeFileSync).toHaveBeenCalled();
  // });

  test(`Test do`, async () => {
    const expectedResult = { data: testDataText };
    const mockAxios = jest.spyOn(axios, 'get');
    mockAxios.mockResolvedValue(expectedResult);

    const mockFs = jest.spyOn(fs, 'writeFileSync');
    mockFs.mockImplementation(() => {
      // do nothing
    });

    Sync.do();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
