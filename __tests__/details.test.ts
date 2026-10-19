import { describe, expect, test } from 'vitest';

import { getRdapUrl, getRemovedTld, getTldDetails, isRemovedTld, listRemovedTlds } from '../src/details';
import { isTld, listTlds } from '../src/index';

describe('getTldDetails', () => {
  test('generic TLD with registry agreement and RDAP', () => {
    expect(getTldDetails('.COM')).toStrictEqual({
      tld: 'com',
      ascii: 'com',
      type: 'generic',
      idn: false,
      brand: false,
      terminated: false,
      registryOperator: 'VeriSign, Inc.',
      delegationDate: '1985-01-01',
      rdapServers: ['https://rdap.verisign.com/com/v1/'],
    });
  });

  test('ccTLD has no ICANN agreement data', () => {
    const uk = getTldDetails('uk');
    expect(uk).toMatchObject({ type: 'country-code', countryCode: 'GB' });
    expect(uk?.registryOperator).toBeUndefined();
    expect(uk?.delegationDate).toBeUndefined();
  });

  test('a TLD without RDAP gets an empty server list', () => {
    expect(getTldDetails('arpa')?.rdapServers).toStrictEqual([]);
  });

  test('every TLD resolves, and nearly every generic TLD has ICANN agreement data', () => {
    let withOperator = 0;
    const badDates: string[] = [];
    for (const info of listTlds()) {
      const details = getTldDetails(info.ascii);
      expect(details?.tld).toBe(info.tld);
      const date = details?.delegationDate;
      if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        badDates.push(`${info.ascii}: ${date}`);
      }
      if (info.type === 'generic' && details?.registryOperator) {
        withOperator++;
      }
    }
    expect(badDates).toStrictEqual([]);
    // Only the legacy gTLDs (edu, gov, int, mil) and ones whose contract ICANN terminated lack it.
    expect(withOperator).toBeGreaterThan(listTlds({ type: 'generic' }).length - 20);
  });

  test('unknown', () => {
    expect(getTldDetails('nope')).toBeUndefined();
  });
});

describe('getRdapUrl', () => {
  test.each([
    ['example.com', 'https://rdap.verisign.com/com/v1/domain/example.com'],
    ['Example.COM.', 'https://rdap.verisign.com/com/v1/domain/example.com'],
    ['münchen.com', 'https://rdap.verisign.com/com/v1/domain/xn--mnchen-3ya.com'],
  ])('%s', (domain, expected) => {
    expect(getRdapUrl(domain)).toBe(expected);
  });

  test('builds a valid URL for every TLD with RDAP', () => {
    const urls = listTlds().flatMap((info) => {
      const url = getRdapUrl(`example.${info.ascii}`);
      const servers = getTldDetails(info.ascii)?.rdapServers ?? [];
      return url === undefined ? [] : [{ ascii: info.ascii, url, servers }];
    });
    expect(urls.length).toBeGreaterThan(1000);
    for (const { ascii, url } of urls) {
      expect(new URL(url).pathname.endsWith(`/domain/example.${ascii}`)).toBe(true);
      expect(url).toMatch(/^https?:\/\//);
    }
    // HTTPS is preferred; a registry that only publishes an http:// server (e.g. .kg) still gets a URL.
    const wrongScheme = urls.filter(
      ({ url, servers }) => url.startsWith('https:') !== servers.some((server) => server.startsWith('https:')),
    );
    expect(wrongScheme).toStrictEqual([]);
  });

  test.each(['example.local', 'example.arpa', ''])('%j has no RDAP URL', (domain) => {
    expect(getRdapUrl(domain)).toBeUndefined();
  });
});

describe('removed TLDs', () => {
  test('ICANN removals carry their removal date', () => {
    expect(getRemovedTld('active')).toStrictEqual({
      tld: 'active',
      ascii: 'active',
      type: 'generic',
      removalDate: '2019-02-17',
    });
  });

  test.each(['active', '.ACTIVE', ' Active '])('%j is a removed TLD, not a TLD', (input) => {
    expect(isRemovedTld(input)).toBe(true);
    expect(isTld(input)).toBe(false);
  });

  test.each(['com', 'nope', ''])('%j is not a removed TLD', (input) => {
    expect(isRemovedTld(input)).toBe(false);
    expect(getRemovedTld(input)).toBeUndefined();
  });

  test('rejects non-strings', () => {
    expect(getRemovedTld(42 as unknown as string)).toBeUndefined();
  });

  test('never overlaps the root zone, sorted, with valid dates, frozen', () => {
    const removed = listRemovedTlds();
    expect(removed.length).toBeGreaterThan(100);
    expect(removed.filter((info) => isTld(info.ascii) || isTld(info.tld))).toStrictEqual([]);
    const ascii = removed.map((info) => info.ascii);
    expect(ascii).toStrictEqual([...ascii].sort());
    expect(removed.filter((info) => !/^\d{4}-\d{2}-\d{2}$/.test(info.removalDate))).toStrictEqual([]);
    expect(Object.isFrozen(removed[0])).toBe(true);
  });

  test('IDN removals are looked up by either form', () => {
    const idn = listRemovedTlds().find((info) => info.ascii !== info.tld);
    expect(idn).toBeDefined();
    expect(getRemovedTld((idn as { tld: string }).tld)).toBe(idn);
  });

  test('returns a fresh array', () => {
    const length = listRemovedTlds().length;
    listRemovedTlds().pop();
    expect(listRemovedTlds()).toHaveLength(length);
  });
});
