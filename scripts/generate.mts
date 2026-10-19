/**
 * Regenerates the TLD data from machine-readable IANA and ICANN sources.
 *
 *   node scripts/generate.mts [--message <file>]
 *
 * Writes:
 *   src/data.ts          core list (every TLD, its type, brand/terminated flags, IDN form, country code)
 *                        and special-use names
 *   src/details-data.ts  registry operator, delegation date, RDAP servers and removed TLDs
 *
 * With `--message <file>` it also writes a conventional commit message describing what changed
 * since the previous run (read back from the files above), which the daily workflow commits with.
 *
 * Nothing time-dependent (IANA's version header, publication timestamps) is written, so the output
 * only changes when the data does and the daily job only releases then. The one exception is the
 * date a ccTLD is first seen missing from the root zone, which is recorded once as its removal date.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { domainToUnicode, fileURLToPath, pathToFileURL } from 'node:url';

import { describeChanges, formatCommitMessage, type Snapshot } from './changes.mts';

export const SOURCES = {
  iana: 'https://data.iana.org/TLD/tlds-alpha-by-domain.txt',
  icann: 'https://www.icann.org/resources/registries/gtlds/v2/gtlds.json',
  rdap: 'https://data.iana.org/rdap/dns.json',
  specialUse: 'https://www.iana.org/assignments/special-use-domain-names/special-use-domain-names.xml',
} as const;

/**
 * Names reserved outside the IANA special-use registry. ICANN reserved `.internal` for private use
 * (board resolution 2024.07.29.06), so it will never be delegated.
 */
export const EXTRA_SPECIAL_USE = ['internal'] as const;

/** The registry lists ~40 names; far fewer means the page was not the registry. */
export const MIN_SPECIAL_USE_COUNT = 10;

/** The live root zone has ~1,440 TLDs; anything far below that means a broken download. */
export const MIN_TLD_COUNT = 1000;

export type TldType = 'generic' | 'country-code' | 'infrastructure';

export interface IcannGtld {
  gTLD: string;
  registryOperator: string | null;
  delegationDate: string | null;
  specification13: boolean | null;
  contractTerminated?: boolean | null;
  /** Date the TLD left the root zone (`YYYY-MM-DD`), for gTLDs that have. */
  removalDate?: string | null;
}

export interface RdapBootstrap {
  services: [string[], string[]][];
}

export interface TldRecord {
  ascii: string;
  unicode: string;
  type: TldType;
  brand: boolean;
  /** ICANN terminated the registry agreement; the TLD is still delegated but is being wound down. */
  terminated?: boolean;
  countryCode?: string;
  registryOperator?: string;
  delegationDate?: string;
  rdapServers?: string[];
}

/** A TLD that was in the root zone and no longer is. */
export interface RemovedRecord {
  ascii: string;
  unicode: string;
  type: TldType;
  /** ICANN's removal date for gTLDs; for other TLDs, the day the generator first saw it missing. */
  removalDate: string;
}

/** Generic TLDs that predate ICANN registry agreements, so they are absent from ICANN's gTLD list. */
const LEGACY_GENERIC = new Set(['edu', 'gov', 'int', 'mil']);
const INFRASTRUCTURE = new Set(['arpa']);

/**
 * Internationalized ccTLDs and the ISO 3166-1 code of the country or territory each serves.
 * IANA publishes no machine-readable mapping; checked against each TLD's manager in the IANA
 * root zone database. A new IDN ccTLD missing here still ships, just without a country code.
 */
export const IDN_COUNTRY_CODES: Readonly<Record<string, string>> = {
  'xn--2scrj9c': 'IN',
  'xn--3e0b707e': 'KR',
  'xn--3hcrj9c': 'IN',
  'xn--45br5cyl': 'IN',
  'xn--45brj9c': 'IN',
  'xn--4dbrk0ce': 'IL',
  'xn--54b7fta0cc': 'BD',
  'xn--80ao21a': 'KZ',
  'xn--90a3ac': 'RS',
  'xn--90ae': 'BG',
  'xn--90ais': 'BY',
  'xn--clchc0ea0b2g2a9gcd': 'SG',
  'xn--d1alf': 'MK',
  'xn--e1a4c': 'EU',
  'xn--fiqs8s': 'CN',
  'xn--fiqz9s': 'CN',
  'xn--fpcrj9c3d': 'IN',
  'xn--fzc2c9e2c': 'LK',
  'xn--gecrj9c': 'IN',
  'xn--h2breg3eve': 'IN',
  'xn--h2brj9c': 'IN',
  'xn--h2brj9c8c': 'IN',
  'xn--j1amh': 'UA',
  'xn--j6w193g': 'HK',
  'xn--kprw13d': 'TW',
  'xn--kpry57d': 'TW',
  'xn--l1acc': 'MN',
  'xn--lgbbat1ad8j': 'DZ',
  'xn--mgb9awbf': 'OM',
  'xn--mgba3a4f16a': 'IR',
  'xn--mgbaam7a8h': 'AE',
  'xn--mgbah1a3hjkrd': 'MR',
  'xn--mgbai9azgqp6j': 'PK',
  'xn--mgbayh7gpa': 'JO',
  'xn--mgbbh1a': 'IN',
  'xn--mgbbh1a71e': 'IN',
  'xn--mgbc0a9azcg': 'MA',
  'xn--mgbcpq6gpa1a': 'BH',
  'xn--mgberp4a5d4ar': 'SA',
  'xn--mgbgu82a': 'IN',
  'xn--mgbpl2fh': 'SD',
  'xn--mgbtx2b': 'IQ',
  'xn--mgbx4cd0ab': 'MY',
  'xn--mix891f': 'MO',
  'xn--node': 'GE',
  'xn--o3cw4h': 'TH',
  'xn--ogbpf8fl': 'SY',
  'xn--p1ai': 'RU',
  'xn--pgbs0dh': 'TN',
  'xn--q7ce6a': 'LA',
  'xn--qxa6a': 'EU',
  'xn--qxam': 'GR',
  'xn--rvc1e0am3e': 'IN',
  'xn--s9brj9c': 'IN',
  'xn--wgbh1c': 'EG',
  'xn--wgbl6a': 'QA',
  'xn--xkc2al3hye2a': 'LK',
  'xn--xkc2dl3a5ee0h': 'IN',
  'xn--y9a3aq': 'AM',
  'xn--yfro4i67o': 'SG',
  'xn--ygbi2ammx': 'PS',
};

export type Fetch = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

export async function fetchText(url: string, fetchImpl: Fetch = fetch): Promise<string> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

/** Parses IANA's `tlds-alpha-by-domain.txt` into lowercase ASCII labels, in file order. */
export function parseIanaList(text: string): string[] {
  const tlds: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim().toLowerCase();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    if (!/^[a-z0-9-]+$/.test(line)) {
      throw new Error(`Unexpected line in the IANA TLD list: ${JSON.stringify(raw)}`);
    }
    tlds.push(line);
  }
  return tlds;
}

function classify(ascii: string, isIcannGtld: boolean): TldType {
  if (INFRASTRUCTURE.has(ascii)) {
    return 'infrastructure';
  }
  if (isIcannGtld || LEGACY_GENERIC.has(ascii)) {
    return 'generic';
  }
  // Two ASCII letters, or an IDN outside ICANN's gTLD registry, is a country code.
  if (/^[a-z]{2}$/.test(ascii) || ascii.startsWith('xn--')) {
    return 'country-code';
  }
  // A gTLD can reach the root zone a day before ICANN's JSON lists it.
  return 'generic';
}

function countryCodeOf(ascii: string): string | undefined {
  if (ascii.startsWith('xn--')) {
    return IDN_COUNTRY_CODES[ascii];
  }
  // .uk is the one ccTLD whose ISO 3166-1 code differs (GB).
  return ascii === 'uk' ? 'GB' : ascii.toUpperCase();
}

export function buildRecords(asciiTlds: string[], gtlds: IcannGtld[], rdap: RdapBootstrap): TldRecord[] {
  if (asciiTlds.length < MIN_TLD_COUNT) {
    throw new Error(`The IANA TLD list has only ${asciiTlds.length} entries; refusing to publish it`);
  }

  const icann = new Map(gtlds.map((gtld) => [gtld.gTLD.toLowerCase(), gtld]));
  const rdapServers = new Map<string, string[]>();
  for (const [tlds, servers] of rdap.services) {
    // RFC 9224 requires base URLs to end in '/'; normalise here so getRdapUrl can simply append.
    const bases = servers.map((server) => (server.endsWith('/') ? server : `${server}/`)).sort();
    for (const tld of tlds) {
      rdapServers.set(tld.toLowerCase(), bases);
    }
  }

  return asciiTlds.map((ascii) => {
    const gtld = icann.get(ascii);
    const type = classify(ascii, gtld !== undefined);
    const record: TldRecord = {
      ascii,
      unicode: ascii.startsWith('xn--') ? domainToUnicode(ascii) : ascii,
      type,
      brand: gtld?.specification13 === true,
    };
    if (gtld?.contractTerminated === true) {
      record.terminated = true;
    }
    if (record.unicode === '') {
      throw new Error(`Could not decode the IDN TLD ${ascii}`);
    }
    if (type === 'country-code') {
      const countryCode = countryCodeOf(ascii);
      if (countryCode) {
        record.countryCode = countryCode;
      }
    }
    if (gtld?.registryOperator) {
      record.registryOperator = gtld.registryOperator.trim();
    }
    if (gtld?.delegationDate) {
      record.delegationDate = gtld.delegationDate;
    }
    const servers = rdapServers.get(ascii);
    if (servers) {
      record.rdapServers = servers;
    }
    return record;
  });
}

/**
 * Parses IANA's special-use domain names registry (RFC 6761) into lowercase names without the
 * trailing dot, adds {@link EXTRA_SPECIAL_USE}, and drops entries the registry marks deprecated.
 */
export function parseSpecialUse(xml: string): string[] {
  const names = new Set<string>(EXTRA_SPECIAL_USE);
  let count = 0;
  for (const [, raw] of xml.matchAll(/<name>([^<]*)<\/name>/g)) {
    count++;
    if (/deprecated/i.test(raw)) {
      continue;
    }
    const name = raw.trim().toLowerCase().replace(/\.$/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(name)) {
      throw new Error(`Unexpected name in the special-use registry: ${JSON.stringify(raw)}`);
    }
    names.add(name);
  }
  if (count < MIN_SPECIAL_USE_COUNT) {
    throw new Error(`The special-use registry has only ${count} entries; refusing to publish it`);
  }
  return [...names].sort();
}

/**
 * Every TLD that has left the root zone: ICANN's removed gTLDs, plus anything that was in the
 * previous run's list (or removed list) and is not in this one. A TLD that comes back is dropped.
 */
export function buildRemoved(
  records: TldRecord[],
  gtlds: IcannGtld[],
  previous: Snapshot | undefined,
  today: string,
): RemovedRecord[] {
  const current = new Set(records.map((r) => r.ascii));
  const removed = new Map<string, RemovedRecord>();
  for (const r of previous?.removed ?? []) {
    removed.set(r.ascii, r);
  }
  for (const r of previous?.records ?? []) {
    if (!removed.has(r.ascii)) {
      removed.set(r.ascii, { ascii: r.ascii, unicode: r.unicode, type: r.type, removalDate: today });
    }
  }
  // ICANN's removal date is authoritative, so it replaces a date the generator recorded itself.
  for (const gtld of gtlds) {
    if (gtld.removalDate) {
      const ascii = gtld.gTLD.toLowerCase();
      const unicode = ascii.startsWith('xn--') ? domainToUnicode(ascii) || ascii : ascii;
      removed.set(ascii, { ascii, unicode, type: 'generic', removalDate: gtld.removalDate });
    }
  }
  return [...removed.values()].filter((r) => !current.has(r.ascii)).sort((a, b) => (a.ascii < b.ascii ? -1 : 1));
}

const HEADER =
  '// Generated by scripts/generate.mts from IANA and ICANN data. Do not edit by hand.\n' +
  '// Regenerate with `npm run generate`.\n';

const quote = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Object keys are quoted only when they must be, matching prettier's `quoteProps: 'as-needed'`. */
const key = (value: string): string => (/^[A-Za-z_$][\w$]*$/.test(value) ? value : quote(value));

const list = (values: string[]): string =>
  values.length === 0 ? '[]' : `[\n${values.map((value) => `  ${quote(value)},\n`).join('')}]`;

/** Renders `src/data.ts`: everything the main entry point needs, one TLD per line for readable diffs. */
export function renderCore(records: TldRecord[], specialUse: string[] = []): string {
  const ofType = (type: TldType): string[] => records.filter((r) => r.type === type).map((r) => r.ascii);
  const idn = records.filter((r) => r.ascii !== r.unicode);
  const idnCountries = records.filter((r) => r.ascii.startsWith('xn--') && r.countryCode);

  return (
    HEADER +
    '\n/** Generic TLDs, ASCII (punycode) form. */\n' +
    `export const GENERIC = ${list(ofType('generic'))} as const;\n` +
    '\n/** Country-code TLDs, ASCII (punycode) form. */\n' +
    `export const COUNTRY_CODE = ${list(ofType('country-code'))} as const;\n` +
    '\n/** Infrastructure TLDs. */\n' +
    `export const INFRASTRUCTURE = ${list(ofType('infrastructure'))} as const;\n` +
    '\n/** ICANN Specification 13 ".brand" TLDs: closed to the public, used by one company. */\n' +
    `export const BRAND = ${list(records.filter((r) => r.brand).map((r) => r.ascii))} as const;\n` +
    '\n/** gTLDs whose ICANN registry agreement was terminated; still delegated, but being wound down. */\n' +
    `export const TERMINATED = ${list(records.filter((r) => r.terminated).map((r) => r.ascii))} as const;\n` +
    '\n/** Internationalized TLDs: ASCII (punycode) form to Unicode form. */\n' +
    `export const IDN = {\n${idn.map((r) => `  ${key(r.ascii)}: ${quote(r.unicode)},\n`).join('')}} as const;\n` +
    '\n/** ISO 3166-1 codes of internationalized ccTLDs (ASCII ccTLDs use their own label). */\n' +
    `export const IDN_COUNTRY: Readonly<Record<string, string>> = {\n${idnCountries
      .map((r) => `  ${key(r.ascii)}: ${quote(r.countryCode as string)},\n`)
      .join('')}};\n` +
    '\n/** Special-use domain names (RFC 6761 registry, plus ICANN-reserved names); subdomains included. */\n' +
    `export const SPECIAL_USE = ${list(specialUse)} as const;\n`
  );
}

/**
 * Renders `src/details-data.ts`: per-TLD registry metadata, with operators and RDAP servers deduplicated,
 * and the TLDs removed from the root zone.
 */
export function renderDetails(records: TldRecord[], removed: RemovedRecord[] = []): string {
  const operators = [...new Set(records.flatMap((r) => (r.registryOperator ? [r.registryOperator] : [])))].sort();
  const rdapKeys = [...new Set(records.flatMap((r) => (r.rdapServers ? [r.rdapServers.join(' ')] : [])))].sort();
  const operatorIndex = new Map(operators.map((operator, index) => [operator, index]));
  const rdapIndex = new Map(rdapKeys.map((key, index) => [key, index]));

  const rows = records.map((r) => {
    const operator = r.registryOperator ? operatorIndex.get(r.registryOperator) : -1;
    const rdap = r.rdapServers ? rdapIndex.get(r.rdapServers.join(' ')) : -1;
    return `  ${key(r.ascii)}: [${operator}, ${quote(r.delegationDate ?? '')}, ${rdap}],\n`;
  });

  return (
    HEADER +
    '\n/** Registry operators named in ICANN registry agreements. */\n' +
    `export const OPERATORS: readonly string[] = ${list(operators)};\n` +
    '\n/** RDAP base URLs from the IANA bootstrap file, one entry per distinct server set. */\n' +
    `export const RDAP_SERVERS: readonly (readonly string[])[] = [\n${rdapKeys
      .map((key) => `  [${key.split(' ').map(quote).join(', ')}],\n`)
      .join('')}];\n` +
    '\n/** ASCII TLD -> [OPERATORS index or -1, delegation date or empty, RDAP_SERVERS index or -1]. */\n' +
    `export const DETAILS: Readonly<Record<string, readonly [number, string, number]>> = {\n${rows.join('')}};\n` +
    '\n/** TLDs no longer in the root zone: ASCII form -> [Unicode form, type, removal date]. */\n' +
    `export const REMOVED = {\n${removed
      .map((r) => `  ${key(r.ascii)}: [${quote(r.unicode)}, ${quote(r.type)}, ${quote(r.removalDate)}],\n`)
      .join('')}} as const;\n`
  );
}

type WriteFile = (file: string, contents: string) => Promise<void>;

/** The exports of a previously generated `src/data.ts`; older files lack the later additions. */
export interface CoreModule {
  GENERIC: readonly string[];
  COUNTRY_CODE: readonly string[];
  INFRASTRUCTURE: readonly string[];
  BRAND: readonly string[];
  TERMINATED?: readonly string[];
  IDN: Readonly<Record<string, string>>;
  IDN_COUNTRY: Readonly<Record<string, string>>;
  SPECIAL_USE?: readonly string[];
}

/** The exports of a previously generated `src/details-data.ts`. */
export interface DetailsModule {
  OPERATORS: readonly string[];
  RDAP_SERVERS: readonly (readonly string[])[];
  DETAILS: Readonly<Record<string, readonly [number, string, number]>>;
  REMOVED?: Readonly<Record<string, readonly [string, string, string]>>;
}

/** Rebuilds the records a previous run rendered, so this run can say what changed. */
export function snapshotFromModules(core: CoreModule, details: DetailsModule): Snapshot {
  const brands = new Set(core.BRAND);
  const terminated = new Set(core.TERMINATED ?? []);
  const records: TldRecord[] = [];
  const add = (asciiTlds: readonly string[], type: TldType): void => {
    for (const ascii of asciiTlds) {
      const record: TldRecord = { ascii, unicode: core.IDN[ascii] ?? ascii, type, brand: brands.has(ascii) };
      if (terminated.has(ascii)) {
        record.terminated = true;
      }
      const countryCode =
        type !== 'country-code' ? undefined : ascii.startsWith('xn--') ? core.IDN_COUNTRY[ascii] : countryCodeOf(ascii);
      if (countryCode) {
        record.countryCode = countryCode;
      }
      const [operator, delegationDate, rdap] = details.DETAILS[ascii] ?? [-1, '', -1];
      if (operator >= 0) {
        record.registryOperator = details.OPERATORS[operator];
      }
      if (delegationDate) {
        record.delegationDate = delegationDate;
      }
      if (rdap >= 0) {
        record.rdapServers = [...details.RDAP_SERVERS[rdap]];
      }
      records.push(record);
    }
  };
  add(core.GENERIC, 'generic');
  add(core.COUNTRY_CODE, 'country-code');
  add(core.INFRASTRUCTURE, 'infrastructure');
  const removed = Object.entries(details.REMOVED ?? {}).map(([ascii, [unicode, type, removalDate]]) => ({
    ascii,
    unicode,
    type: type as TldType,
    removalDate,
  }));
  return { records, removed, specialUse: [...(core.SPECIAL_USE ?? [])] };
}

/** Reads the previous run's output from `root`, or `undefined` when there is none to compare with. */
export async function readPrevious(root: string): Promise<Snapshot | undefined> {
  try {
    const url = (file: string): string => pathToFileURL(path.join(root, 'src', file)).href;
    const [core, details] = await Promise.all([
      import(url('data.ts')) as Promise<CoreModule>,
      import(url('details-data.ts')) as Promise<DetailsModule>,
    ]);
    return snapshotFromModules(core, details);
  } catch {
    return undefined;
  }
}

export interface GenerateOptions {
  /** How to download the sources; the CLI passes the global `fetch`. */
  fetch: Fetch;
  writeFile?: WriteFile;
  /** The previous run's data; defaults to reading it back from `root`. */
  previous?: Snapshot;
  /** `YYYY-MM-DD`, recorded as the removal date of a TLD seen missing for the first time. */
  today?: string;
}

export interface GenerateResult extends Snapshot {
  /** Conventional commit message describing the changes since the previous run. */
  message: string;
}

export async function generate(root: string, options: GenerateOptions): Promise<GenerateResult> {
  const fetchImpl = options.fetch;
  const writeFileImpl = options.writeFile ?? writeFile;
  const previous = 'previous' in options ? options.previous : await readPrevious(root);
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  const [ianaText, icannText, rdapText, specialUseXml] = await Promise.all([
    fetchText(SOURCES.iana, fetchImpl),
    fetchText(SOURCES.icann, fetchImpl),
    fetchText(SOURCES.rdap, fetchImpl),
    fetchText(SOURCES.specialUse, fetchImpl),
  ]);
  const icann = JSON.parse(icannText) as { gTLDs: IcannGtld[] };
  const rdap = JSON.parse(rdapText) as RdapBootstrap;
  const records = buildRecords(parseIanaList(ianaText), icann.gTLDs, rdap);
  const removed = buildRemoved(records, icann.gTLDs, previous, today);
  const specialUse = parseSpecialUse(specialUseXml);
  const next: Snapshot = { records, removed, specialUse };

  await writeFileImpl(path.join(root, 'src', 'data.ts'), renderCore(records, specialUse));
  await writeFileImpl(path.join(root, 'src', 'details-data.ts'), renderDetails(records, removed));
  return { ...next, message: formatCommitMessage(describeChanges(previous, next)) };
}

/* c8 ignore start -- CLI entry point */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await generate(root, { fetch });
  const messageIndex = process.argv.indexOf('--message');
  if (messageIndex !== -1) {
    await writeFile(process.argv[messageIndex + 1], result.message);
  }
  console.log(`Wrote ${result.records.length} TLDs, ${result.removed.length} removed.\n\n${result.message}`);
}
/* c8 ignore stop */
