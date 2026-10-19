import { describe, expect, expectTypeOf, test } from 'vitest';

import {
  getTld,
  getTldInfo,
  isCountryCode,
  isSpecialUse,
  isTld,
  isValidDomain,
  listTlds,
  normalizeTld,
  TLDs,
  type KnownTld,
  type RemovedTld,
  type Tld,
  type TldInfo,
} from '../src/index';

describe('normalizeTld / isTld', () => {
  test.each([
    ['com', 'com'],
    ['COM', 'com'],
    ['.com', 'com'],
    ['  .Com ', 'com'],
    ['भारत', 'भारत'],
    ['xn--h2brj9c', 'भारत'],
    ['XN--P1AI', 'рф'],
    ['РФ', 'рф'],
    ['VERMÖGENSBERATER', 'vermögensberater'],
    ['arpa', 'arpa'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeTld(input)).toBe(expected);
    expect(isTld(input)).toBe(true);
  });

  test.each(['', '.', 'localhost', 'local', 'example', 'co.uk', '..com', 'xn--', ' '])('rejects %j', (input) => {
    expect(normalizeTld(input)).toBeUndefined();
    expect(isTld(input)).toBe(false);
  });

  test('rejects non-strings from untyped callers', () => {
    expect(isTld(undefined as unknown as string)).toBe(false);
    expect(isTld(42 as unknown as string)).toBe(false);
  });
});

describe('getTld', () => {
  test.each([
    ['example.com', 'com'],
    ['www.Example.co.uk', 'uk'],
    ['example.com.', 'com'],
    ['shop.xn--p1ai', 'рф'],
    ['пример.рф', 'рф'],
    ['例え。テスト。コム', 'コム'],
    ['com', 'com'],
  ])('%s -> %s', (hostname, expected) => {
    expect(getTld(hostname)).toBe(expected);
  });

  test.each(['example.local', 'printer.lan', 'example.', '', 'a..'])('%j has no real TLD', (hostname) => {
    expect(getTld(hostname)).toBeUndefined();
  });

  test('rejects non-strings', () => {
    expect(getTld(null as unknown as string)).toBeUndefined();
  });
});

describe('getTldInfo', () => {
  test('generic', () => {
    expect(getTldInfo('com')).toStrictEqual({
      tld: 'com',
      ascii: 'com',
      type: 'generic',
      idn: false,
      brand: false,
      terminated: false,
    });
  });

  test('brand', () => {
    expect(getTldInfo('google')?.brand).toBe(true);
  });

  test('ASCII ccTLD uses its own label, except .uk', () => {
    expect(getTldInfo('in')).toMatchObject({ type: 'country-code', countryCode: 'IN' });
    expect(getTldInfo('uk')?.countryCode).toBe('GB');
    expect(getTldInfo('eu')?.countryCode).toBe('EU');
  });

  test('IDN ccTLD', () => {
    expect(getTldInfo('xn--h2brj9c')).toStrictEqual({
      tld: 'भारत',
      ascii: 'xn--h2brj9c',
      type: 'country-code',
      idn: true,
      brand: false,
      terminated: false,
      countryCode: 'IN',
    });
  });

  test('infrastructure', () => {
    expect(getTldInfo('arpa')?.type).toBe('infrastructure');
  });

  test('info objects are frozen', () => {
    expect(Object.isFrozen(getTldInfo('com'))).toBe(true);
  });

  test('unknown', () => {
    expect(getTldInfo('nope')).toBeUndefined();
  });
});

describe('isCountryCode', () => {
  test.each([
    ['uk', true],
    ['рф', true],
    ['com', false],
    ['arpa', false],
    ['zz', false],
  ])('%s -> %s', (input, expected) => {
    expect(isCountryCode(input)).toBe(expected);
  });
});

describe('listTlds', () => {
  const all = listTlds();

  test('covers the whole root zone, sorted by ASCII form, without duplicates', () => {
    expect(all.length).toBeGreaterThan(1000);
    const ascii = all.map((info) => info.ascii);
    expect(ascii).toStrictEqual([...ascii].sort());
    expect(new Set(ascii).size).toBe(ascii.length);
    expect(new Set(all.map((info) => info.tld)).size).toBe(all.length);
  });

  test('every country-code TLD has a country code', () => {
    expect(listTlds({ type: 'country-code' }).filter((info) => !info.countryCode)).toStrictEqual([]);
  });

  test('only country-code TLDs have a country code', () => {
    expect(all.filter((info) => info.countryCode && info.type !== 'country-code')).toStrictEqual([]);
  });

  test('brand TLDs are generic', () => {
    const brands = listTlds({ brand: true });
    expect(brands.length).toBeGreaterThan(100);
    expect(brands.every((info) => info.type === 'generic')).toBe(true);
  });

  test('filters combine', () => {
    const idnCc = listTlds({ type: 'country-code', idn: true });
    expect(idnCc.length).toBeGreaterThan(0);
    expect(idnCc.every((info) => info.idn && info.type === 'country-code')).toBe(true);
    expect(listTlds({ brand: false }).length + listTlds({ brand: true }).length).toBe(all.length);
    expect(listTlds({ type: 'infrastructure' }).map((info) => info.tld)).toStrictEqual(['arpa']);
  });

  test('returns a fresh array', () => {
    listTlds().pop();
    expect(listTlds()).toHaveLength(all.length);
  });

  // Which gTLDs are terminated changes as ICANN winds them down, so only invariants are pinned here.
  test('terminated TLDs are generic, and the filter splits the list', () => {
    const terminated = listTlds({ terminated: true });
    expect(terminated.every((info) => info.terminated && info.type === 'generic')).toBe(true);
    expect(terminated.length + listTlds({ terminated: false }).length).toBe(all.length);
  });
});

describe('isSpecialUse', () => {
  test.each([
    'localhost',
    'printer.local',
    'PRINTER.LOCAL.',
    'foo.test',
    'x.invalid',
    'example',
    'www.example.com',
    'example.org',
    'duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion',
    'router.home.arpa',
    'db.internal',
    'x.alt',
    '1.10.in-addr.arpa',
  ])('%s', (hostname) => {
    expect(isSpecialUse(hostname)).toBe(true);
  });

  test.each(['example.net.au', 'com', 'google.com', 'localhost.com', 'mylocal', 'arpa', ''])('%j', (hostname) => {
    expect(isSpecialUse(hostname)).toBe(false);
  });

  test('rejects non-strings', () => {
    expect(isSpecialUse(undefined as unknown as string)).toBe(false);
  });
});

describe('isValidDomain', () => {
  test.each([
    'example.com',
    'Example.COM',
    'example.com.',
    'a.b.c.d.example.co.uk',
    'xn--mnchen-3ya.de',
    'münchen.de',
    'пример.рф',
    'example.xn--p1ai',
    'my-site.io',
    '123.com',
    'a.co',
    `${'a'.repeat(63)}.com`,
  ])('%s is valid', (hostname) => {
    expect(isValidDomain(hostname)).toBe(true);
  });

  test.each([
    ['', 'empty'],
    ['com', 'a bare TLD'],
    ['example', 'one label'],
    ['example.local', 'not a real TLD'],
    ['example.notatld', 'not a real TLD'],
    ['-example.com', 'leading hyphen'],
    ['example-.com', 'trailing hyphen'],
    ['exa_mple.com', 'underscore'],
    ['exa mple.com', 'space'],
    [' example.com', 'surrounding whitespace'],
    ['example..com', 'empty label'],
    ['.example.com', 'leading dot'],
    ['example.com:443', 'port'],
    ['example.com/path', 'path'],
    ['user@example.com', 'userinfo'],
    ['192.168.0.1', 'IPv4 address'],
    [`${'a'.repeat(64)}.com`, 'label over 63 characters'],
    [`${'a.'.repeat(126)}com`, 'name over 253 characters'],
    ['xn--zz.com', 'invalid punycode'],
  ])('%j is invalid (%s)', (hostname) => {
    expect(isValidDomain(hostname)).toBe(false);
  });

  test('rejects non-strings', () => {
    expect(isValidDomain(null as unknown as string)).toBe(false);
  });
});

describe('TLDs (1.x API)', () => {
  test('tlds map keeps the 1.x shape', () => {
    expect(TLDs.tlds.get('com')).toBe(1);
    expect(TLDs.tlds.has('भारत')).toBe(true);
    expect(TLDs.tlds.size).toBe(listTlds().length);
  });

  test('isValid', () => {
    expect(TLDs.isValid('com')).toBe(true);
    expect(TLDs.isValid('COM')).toBe(true);
    expect(TLDs.isValid('nope')).toBe(false);
  });

  test('isValid still honours entries added to the map', () => {
    TLDs.tlds.set('internal', 1);
    expect(TLDs.isValid('internal')).toBe(true);
    TLDs.tlds.delete('internal');
  });
});

describe('types', () => {
  test('Tld is a union of real TLDs', () => {
    expectTypeOf<'com'>().toExtend<Tld>();
    expectTypeOf<'рф'>().toExtend<Tld>();
    expectTypeOf<'xn--p1ai'>().not.toExtend<Tld>();
    expectTypeOf<'notatld'>().not.toExtend<Tld>();
    expectTypeOf(normalizeTld).returns.toEqualTypeOf<Tld | undefined>();
    expectTypeOf<TldInfo['tld']>().toEqualTypeOf<Tld>();
  });

  test('KnownTld covers current and removed TLDs, so a removal never breaks a build', () => {
    expectTypeOf<'active'>().toExtend<RemovedTld>();
    expectTypeOf<'active'>().not.toExtend<Tld>();
    expectTypeOf<'active'>().toExtend<KnownTld>();
    expectTypeOf<'com'>().toExtend<KnownTld>();
    expectTypeOf<'notatld'>().not.toExtend<KnownTld>();
  });
});
