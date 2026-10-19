import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import type { Snapshot } from '../scripts/changes.mts';
import {
  buildRecords,
  buildRemoved,
  fetchText,
  generate,
  IDN_COUNTRY_CODES,
  MIN_TLD_COUNT,
  parseIanaList,
  parseSpecialUse,
  readPrevious,
  renderCore,
  renderDetails,
  snapshotFromModules,
  SOURCES,
  type Fetch,
  type IcannGtld,
  type RdapBootstrap,
  type RemovedRecord,
  type TldRecord,
} from '../scripts/generate.mts';

const ianaText = [
  '# Version 2026101700, Last Updated Sat Oct 17 07:07:01 2026 UTC',
  'AAA',
  'ARPA',
  'COM',
  'EDU',
  'GOOGLE',
  'IN',
  'NEWGTLD',
  'UK',
  'XN--H2BRJ9C',
  'XN--11B4C3D',
  'XN--Q9JYB4C',
  '',
].join('\n');

const gtlds: IcannGtld[] = [
  {
    gTLD: 'aaa',
    registryOperator: ' American Automobile Association, Inc. ',
    delegationDate: '2015-08-28',
    specification13: true,
  },
  { gTLD: 'com', registryOperator: 'VeriSign, Inc.', delegationDate: '1985-01-01', specification13: false },
  {
    gTLD: 'google',
    registryOperator: 'Charleston Road Registry Inc.',
    delegationDate: '2014-09-15',
    specification13: true,
  },
  { gTLD: 'xn--11b4c3d', registryOperator: 'VeriSign Sarl', delegationDate: '2015-07-28', specification13: false },
  {
    gTLD: 'xn--q9jyb4c',
    registryOperator: null,
    delegationDate: null,
    specification13: null,
    contractTerminated: true,
  },
  {
    gTLD: 'removed',
    registryOperator: 'Gone',
    delegationDate: '2014-01-01',
    specification13: false,
    contractTerminated: true,
    removalDate: '2020-06-01',
  },
  {
    gTLD: 'xn--removed-idn',
    registryOperator: null,
    delegationDate: '2015-01-01',
    specification13: null,
    removalDate: '2021-01-01',
  },
  // Terminated before it was ever delegated: never in the root zone, so never "removed".
  { gTLD: 'never', registryOperator: null, delegationDate: null, specification13: null, contractTerminated: true },
];

const specialUseXml = `<?xml version='1.0' encoding='UTF-8'?>
<registry xmlns="http://www.iana.org/assignments" id="special-use-domain-names">
  <registry id="special-use-domain">
    <record date="2023-05-10"><name>alt.</name></record>
    <record date="2021-09-21"><name>eap-noob.arpa. (DEPRECATED)</name></record>
    <record date="2018-03-14"><name>home.arpa.</name></record>
    <record><name>10.in-addr.arpa.</name></record>
    <record><name>example.</name></record>
    <record><name>example.com.</name></record>
    <record><name>invalid.</name></record>
    <record><name>local.</name></record>
    <record><name>localhost.</name></record>
    <record><name>onion.</name></record>
    <record><name>test.</name></record>
  </registry>
</registry>`;

const rdap: RdapBootstrap = {
  services: [
    [['COM'], ['https://rdap.verisign.com/com/v1/']],
    [['uk'], ['https://rdap.nominet.uk/uk/', 'http://rdap.nominet.uk/uk/']],
    [['GOOGLE'], ['https://www.registry.google/rdap']],
  ],
};

/** Pads a fixture to the minimum size buildRecords accepts. */
const padded = (tlds: string[]): string[] => [
  ...tlds,
  ...Array.from({ length: MIN_TLD_COUNT }, (_, i) => `pad${String(i).padStart(4, '0')}`),
];

const records = buildRecords(padded(parseIanaList(ianaText)), gtlds, rdap).filter((r) => !r.ascii.startsWith('pad'));
const byAscii = new Map(records.map((r) => [r.ascii, r]));

describe('parseIanaList', () => {
  test('skips the header and blank lines, lowercases, keeps order', () => {
    expect(parseIanaList(ianaText)).toStrictEqual([
      'aaa',
      'arpa',
      'com',
      'edu',
      'google',
      'in',
      'newgtld',
      'uk',
      'xn--h2brj9c',
      'xn--11b4c3d',
      'xn--q9jyb4c',
    ]);
  });

  test('handles CRLF', () => {
    expect(parseIanaList('# header\r\nCOM\r\nNET\r\n')).toStrictEqual(['com', 'net']);
  });

  test('throws on anything that is not a DNS label (e.g. an HTML error page)', () => {
    expect(() => parseIanaList('<html>Service unavailable</html>')).toThrow(/Unexpected line/);
  });
});

describe('buildRecords', () => {
  test('refuses a truncated list', () => {
    expect(() => buildRecords(['com'], gtlds, rdap)).toThrow(/only 1 entries/);
  });

  test('classifies every TLD', () => {
    expect(Object.fromEntries(records.map((r) => [r.ascii, r.type]))).toStrictEqual({
      aaa: 'generic',
      arpa: 'infrastructure',
      com: 'generic',
      edu: 'generic',
      google: 'generic',
      in: 'country-code',
      newgtld: 'generic',
      uk: 'country-code',
      'xn--h2brj9c': 'country-code',
      'xn--11b4c3d': 'generic',
      'xn--q9jyb4c': 'generic',
    });
  });

  test('decodes IDNs', () => {
    expect(byAscii.get('xn--h2brj9c')?.unicode).toBe('भारत');
    expect(byAscii.get('xn--11b4c3d')?.unicode).toBe('कॉम');
    expect(byAscii.get('com')?.unicode).toBe('com');
  });

  test('brand flag comes from Specification 13', () => {
    expect(records.filter((r) => r.brand).map((r) => r.ascii)).toStrictEqual(['aaa', 'google']);
  });

  test('terminated flag comes from ICANN', () => {
    expect(records.filter((r) => r.terminated).map((r) => r.ascii)).toStrictEqual(['xn--q9jyb4c']);
  });

  test('country codes', () => {
    expect(byAscii.get('in')?.countryCode).toBe('IN');
    expect(byAscii.get('uk')?.countryCode).toBe('GB');
    expect(byAscii.get('xn--h2brj9c')?.countryCode).toBe('IN');
    expect(byAscii.get('com')?.countryCode).toBeUndefined();
  });

  test('an IDN ccTLD missing from the country map ships without a country code', () => {
    // xn--80akhbyknj4f (испытание) was an IANA test TLD, so it is not in the map.
    expect(IDN_COUNTRY_CODES['xn--80akhbyknj4f']).toBeUndefined();
    const [record] = buildRecords(padded(['xn--80akhbyknj4f']), [], { services: [] });
    expect(record).toStrictEqual({
      ascii: 'xn--80akhbyknj4f',
      unicode: 'испытание',
      type: 'country-code',
      brand: false,
    });
  });

  test('registry metadata', () => {
    expect(byAscii.get('aaa')).toMatchObject({
      registryOperator: 'American Automobile Association, Inc.',
      delegationDate: '2015-08-28',
    });
    expect(byAscii.get('xn--q9jyb4c')?.registryOperator).toBeUndefined();
    expect(byAscii.get('com')?.rdapServers).toStrictEqual(['https://rdap.verisign.com/com/v1/']);
    expect(byAscii.get('uk')?.rdapServers).toStrictEqual(['http://rdap.nominet.uk/uk/', 'https://rdap.nominet.uk/uk/']);
    expect(byAscii.get('in')?.rdapServers).toBeUndefined();
    // A base URL without the trailing slash RFC 9224 requires is normalised.
    expect(byAscii.get('google')?.rdapServers).toStrictEqual(['https://www.registry.google/rdap/']);
  });

  test('throws when an IDN cannot be decoded', () => {
    expect(() => buildRecords(padded(['xn--a']), [], { services: [] })).toThrow(/Could not decode/);
  });
});

describe('renderers', () => {
  test('core module', () => {
    const core = renderCore(records);
    expect(core).toContain("export const GENERIC = [\n  'aaa',\n");
    expect(core).toContain("export const INFRASTRUCTURE = [\n  'arpa',\n] as const;");
    expect(core).toContain("  'xn--h2brj9c': 'भारत',\n");
    expect(core).toContain(
      "export const IDN_COUNTRY: Readonly<Record<string, string>> = {\n  'xn--h2brj9c': 'IN',\n};",
    );
    expect(core).not.toMatch(/2026101700/);
  });

  test('core module: terminated and special-use', () => {
    const core = renderCore(records, ['local']);
    expect(core).toContain("export const TERMINATED = [\n  'xn--q9jyb4c',\n] as const;");
    expect(core).toContain("export const SPECIAL_USE = [\n  'local',\n] as const;");
    expect(core).not.toContain('REMOVED');
  });

  test('details module: removed TLDs', () => {
    const details = renderDetails(records, [
      { ascii: 'xn--p1ai', unicode: 'рф', type: 'country-code', removalDate: '2001-01-01' },
    ]);
    expect(details).toContain(
      "export const REMOVED = {\n  'xn--p1ai': ['рф', 'country-code', '2001-01-01'],\n} as const;",
    );
  });

  test('empty lists render as []', () => {
    const core = renderCore([]);
    expect(core).toContain('export const BRAND = [] as const;');
    expect(core).toContain('export const SPECIAL_USE = [] as const;');
    expect(renderDetails([])).toContain('export const REMOVED = {\n} as const;');
  });

  test('details module deduplicates and indexes', () => {
    const details = renderDetails(records);
    expect(details).toContain("  com: [3, '1985-01-01', 1],\n");
    expect(details).toContain("  in: [-1, '', -1],\n");
    expect(details).toContain("  ['http://rdap.nominet.uk/uk/', 'https://rdap.nominet.uk/uk/'],\n");
  });

  test('quotes are escaped', () => {
    const details = renderDetails([
      { ascii: 'x', unicode: 'x', type: 'generic', brand: false, registryOperator: "O'Brien \\ Co" },
    ]);
    expect(details).toContain("  'O\\'Brien \\\\ Co',\n");
  });
});

describe('fetchText', () => {
  test('returns the body', async () => {
    const fetchImpl = vi.fn<Fetch>(async () => ({ ok: true, status: 200, text: async () => 'body' }));
    await expect(fetchText('https://x', fetchImpl)).resolves.toBe('body');
  });

  test('throws on an HTTP error instead of publishing an empty list', async () => {
    const fetchImpl = vi.fn<Fetch>(async () => ({ ok: false, status: 503, text: async () => '' }));
    await expect(fetchText('https://x', fetchImpl)).rejects.toThrow('HTTP 503');
  });
});

describe('parseSpecialUse', () => {
  test('reads the registry, drops deprecated entries, adds .internal, sorts', () => {
    expect(parseSpecialUse(specialUseXml)).toStrictEqual(
      [
        'alt',
        'example',
        'example.com',
        'home.arpa',
        'internal',
        'local',
        'localhost',
        'onion',
        'test',
        '10.in-addr.arpa',
        'invalid',
      ].sort(),
    );
  });

  test('refuses a page that is not the registry', () => {
    expect(() => parseSpecialUse('<html>Just a moment...</html>')).toThrow(/only 0 entries/);
  });

  test('throws on a name that is not a domain name', () => {
    expect(() => parseSpecialUse(specialUseXml.replace('<name>alt.</name>', '<name>a b.</name>'))).toThrow(
      /Unexpected name/,
    );
  });
});

describe('buildRemoved', () => {
  const previous: Snapshot = {
    records: [...records, { ascii: 'zz', unicode: 'zz', type: 'country-code', brand: false, countryCode: 'ZZ' }],
    removed: [
      { ascii: 'old', unicode: 'old', type: 'country-code', removalDate: '2001-01-01' },
      // Re-delegated since: dropped from the removed list.
      { ascii: 'com', unicode: 'com', type: 'generic', removalDate: '2001-01-01' },
    ],
    specialUse: [],
  };

  test('combines ICANN removals, earlier removals and TLDs that just disappeared', () => {
    expect(buildRemoved(records, gtlds, previous, '2026-10-19')).toStrictEqual([
      { ascii: 'old', unicode: 'old', type: 'country-code', removalDate: '2001-01-01' },
      { ascii: 'removed', unicode: 'removed', type: 'generic', removalDate: '2020-06-01' },
      { ascii: 'xn--removed-idn', unicode: 'xn--removed-idn', type: 'generic', removalDate: '2021-01-01' },
      { ascii: 'zz', unicode: 'zz', type: 'country-code', removalDate: '2026-10-19' },
    ]);
  });

  test("ICANN's date replaces the date the generator recorded", () => {
    const seen: Snapshot = {
      ...previous,
      removed: [{ ascii: 'removed', unicode: 'removed', type: 'generic', removalDate: '2026-01-01' }],
    };
    expect(buildRemoved(records, gtlds, seen, '2026-10-19').find((r) => r.ascii === 'removed')?.removalDate).toBe(
      '2020-06-01',
    );
  });

  test('decodes removed IDN gTLDs', () => {
    const [record] = buildRemoved([], [{ ...gtlds[0], gTLD: 'xn--p1ai', removalDate: '2020-01-01' }], undefined, '');
    expect(record.unicode).toBe('рф');
  });

  test('without a previous run, only ICANN removals are known', () => {
    expect(buildRemoved(records, gtlds, undefined, '2026-10-19').map((r) => r.ascii)).toStrictEqual([
      'removed',
      'xn--removed-idn',
    ]);
  });
});

describe('snapshotFromModules / readPrevious', () => {
  const removed: RemovedRecord[] = [{ ascii: 'old', unicode: 'old', type: 'country-code', removalDate: '2001-01-01' }];
  const specialUse = ['local', 'test'];

  test('round-trips what the renderers write', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gtl-'));
    try {
      await mkdir(path.join(dir, 'src'));
      await writeFile(path.join(dir, 'src', 'data.ts'), renderCore(records, specialUse));
      await writeFile(path.join(dir, 'src', 'details-data.ts'), renderDetails(records, removed));
      const snapshot = await readPrevious(dir);
      const sort = (list: TldRecord[]): TldRecord[] => [...list].sort((a, b) => (a.ascii < b.ascii ? -1 : 1));
      expect(sort(snapshot?.records ?? [])).toStrictEqual(sort(records));
      expect(snapshot?.removed).toStrictEqual(removed);
      expect(snapshot?.specialUse).toStrictEqual(specialUse);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test('a module from before removed TLDs and special-use names existed', () => {
    const snapshot = snapshotFromModules(
      {
        GENERIC: ['com'],
        COUNTRY_CODE: ['xn--p1ai'],
        INFRASTRUCTURE: [],
        BRAND: [],
        IDN: { 'xn--p1ai': 'рф' },
        IDN_COUNTRY: {},
      },
      { OPERATORS: [], RDAP_SERVERS: [], DETAILS: {} },
    );
    expect(snapshot).toStrictEqual({
      records: [
        { ascii: 'com', unicode: 'com', type: 'generic', brand: false },
        { ascii: 'xn--p1ai', unicode: 'рф', type: 'country-code', brand: false },
      ],
      removed: [],
      specialUse: [],
    });
  });

  test('no previous output', async () => {
    await expect(readPrevious(path.join(os.tmpdir(), 'gtl-does-not-exist'))).resolves.toBeUndefined();
  });
});

describe('generate', () => {
  const bodies: Record<string, string> = {
    [SOURCES.iana]: [ianaText, ...padded([]).map((tld) => tld.toUpperCase())].join('\n'),
    [SOURCES.icann]: JSON.stringify({ gTLDs: gtlds, updatedOn: 'ignored' }),
    [SOURCES.rdap]: JSON.stringify(rdap),
    [SOURCES.specialUse]: specialUseXml,
  };

  test('downloads all sources over HTTPS, writes the three files and describes the change', async () => {
    const fetchImpl = vi.fn<Fetch>(async (url) => ({ ok: true, status: 200, text: async () => bodies[url] }));
    const written = new Map<string, string>();
    const previous: Snapshot = {
      records: buildRecords(padded(parseIanaList(ianaText)), gtlds, rdap).filter((r) => r.ascii !== 'newgtld'),
      removed: [],
      specialUse: parseSpecialUse(specialUseXml),
    };

    const result = await generate('/root', {
      fetch: fetchImpl,
      writeFile: async (file, contents) => {
        written.set(file, contents);
      },
      previous,
      today: '2026-10-19',
    });

    expect(Object.values(SOURCES).every((url) => url.startsWith('https://'))).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.records.length).toBe(11 + MIN_TLD_COUNT);
    expect(result.removed.map((r) => r.ascii)).toStrictEqual(['removed', 'xn--removed-idn']);
    expect(result.message).toBe('feat(data): add .newgtld\n\n- Added .newgtld (generic)\n');
    expect([...written.keys()]).toStrictEqual([
      path.join('/root', 'src', 'data.ts'),
      path.join('/root', 'src', 'details-data.ts'),
    ]);
    expect(written.get(path.join('/root', 'src', 'data.ts'))).toContain(
      "export const SPECIAL_USE = [\n  '10.in-addr.arpa',",
    );
  });

  test('end to end on disk: the second run describes what changed since the first', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gtl-'));
    try {
      await mkdir(path.join(dir, 'src'));
      const serve =
        (overrides: Record<string, string>): Fetch =>
        async (url) => ({ ok: true, status: 200, text: async () => ({ ...bodies, ...overrides })[url] });

      const first = await generate(dir, { fetch: serve({}) });
      expect(first.message).toBe('fix(data): regenerate TLD data\n');

      const withoutNewGtld = bodies[SOURCES.iana].replace('NEWGTLD\n', '');
      const second = await generate(dir, { fetch: serve({ [SOURCES.iana]: withoutNewGtld }), today: '2026-10-19' });
      expect(second.message).toBe('feat(data): remove .newgtld\n\n- Removed .newgtld (generic)\n');
      expect(second.removed.find((r) => r.ascii === 'newgtld')?.removalDate).toBe('2026-10-19');
      expect(await readFile(path.join(dir, 'src', 'details-data.ts'), 'utf8')).toContain(
        "  newgtld: ['newgtld', 'generic', '2026-10-19'],\n",
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
