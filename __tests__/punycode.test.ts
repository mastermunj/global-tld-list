import { domainToUnicode } from 'node:url';
import { describe, expect, test } from 'vitest';

import { decodePunycode } from '../src/punycode';
import { listTlds } from '../src/index';

describe('decodePunycode', () => {
  test.each([
    ['mnchen-3ya', 'münchen'],
    ['p1ai', 'рф'],
    ['h2brj9c', 'भारत'],
    ['fiqs8s', '中国'],
  ])('%s -> %s', (input, expected) => {
    expect(decodePunycode(input)).toBe(expected);
  });

  test('decodes what RFC 3492 allows even when IDNA would not, such as a control character', () => {
    expect(decodePunycode('a')).toBe('\u0080');
  });

  test('agrees with Node for every IDN TLD in the root zone', () => {
    const idns = listTlds({ idn: true });
    expect(idns.length).toBeGreaterThan(100);
    const mismatches = idns.filter((info) => decodePunycode(info.ascii.slice(4)) !== domainToUnicode(info.ascii));
    expect(mismatches).toStrictEqual([]);
  });

  test.each([
    ['b', 'ends mid-number'],
    ['zz', 'ends mid-number'],
    ['bb00h', 'code point beyond U+10FFFF'],
    ['99999999999', 'integer overflow'],
    ['abc-', 'decodes to plain ASCII'],
    ['-', 'empty'],
  ])('%j does not decode (%s)', (input) => {
    expect(decodePunycode(input)).toBeUndefined();
  });
});
