import { BRAND, COUNTRY_CODE, GENERIC, IDN, IDN_COUNTRY, INFRASTRUCTURE, SPECIAL_USE, TERMINATED } from './data.js';
// Type-only: the removed list itself ships in `global-tld-list/details`, not the main bundle.
import type { REMOVED } from './details-data.js';

type AsciiTld = (typeof GENERIC)[number] | (typeof COUNTRY_CODE)[number] | (typeof INFRASTRUCTURE)[number];

/** Every TLD in the IANA root zone, in its canonical lowercase Unicode form (e.g. `'com'`, `'भारत'`). */
export type Tld = Exclude<AsciiTld, `xn--${string}`> | (typeof IDN)[keyof typeof IDN];

/** Every TLD that has been removed from the root zone, in canonical lowercase Unicode form. */
export type RemovedTld = (typeof REMOVED)[keyof typeof REMOVED][0];

/**
 * Every TLD that is or ever was in the root zone. Unlike {@link Tld}, this type only grows: a TLD
 * IANA removes moves from `Tld` to `RemovedTld`, so code that names it keeps compiling.
 */
export type KnownTld = Tld | RemovedTld;

/** IANA's classification of a TLD. */
export type TldType = 'generic' | 'country-code' | 'infrastructure';

export interface TldInfo {
  /** Canonical lowercase Unicode form, e.g. `'com'`, `'рф'`. */
  readonly tld: Tld;
  /** ASCII form as it appears in DNS, e.g. `'com'`, `'xn--p1ai'`. */
  readonly ascii: string;
  readonly type: TldType;
  /** True for internationalized (non-ASCII) TLDs. */
  readonly idn: boolean;
  /** True for ICANN Specification 13 ".brand" TLDs, which only their owner can register under. */
  readonly brand: boolean;
  /**
   * True for gTLDs whose ICANN registry agreement was terminated. They still resolve, but are being
   * wound down and will usually be removed from the root zone, so don't accept new sign-ups on them.
   */
  readonly terminated: boolean;
  /**
   * For country-code TLDs, the ISO 3166-1 alpha-2 code it serves (`.uk` gives `'GB'`, `.рф` gives `'RU'`).
   * Includes ISO's exceptionally reserved codes such as `'EU'` and `'AC'`.
   */
  readonly countryCode?: string;
}

export interface TldFilter {
  type?: TldType;
  idn?: boolean;
  brand?: boolean;
  terminated?: boolean;
}

const brands = new Set<string>(BRAND);
const terminated = new Set<string>(TERMINATED);
const idnUnicode: Readonly<Record<string, string>> = IDN;
const all: TldInfo[] = [];
/** Lookup by both ASCII and Unicode form. */
const index = new Map<string, TldInfo>();

function add(asciiTlds: readonly string[], type: TldType): void {
  for (const ascii of asciiTlds) {
    const tld = (idnUnicode[ascii] ?? ascii) as Tld;
    const countryCode =
      type !== 'country-code'
        ? undefined
        : ascii.startsWith('xn--')
          ? IDN_COUNTRY[ascii]
          : ascii === 'uk'
            ? 'GB'
            : ascii.toUpperCase();
    const info: TldInfo = Object.freeze({
      tld,
      ascii,
      type,
      idn: tld !== ascii,
      brand: brands.has(ascii),
      terminated: terminated.has(ascii),
      ...(countryCode ? { countryCode } : {}),
    });
    all.push(info);
    index.set(ascii, info);
    index.set(tld, info);
  }
}

add(GENERIC, 'generic');
add(COUNTRY_CODE, 'country-code');
add(INFRASTRUCTURE, 'infrastructure');
all.sort((a, b) => (a.ascii < b.ascii ? -1 : 1));

const specialUse = new Set<string>(SPECIAL_USE);

function key(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().normalize('NFC').toLowerCase();
  return normalized.startsWith('.') ? normalized.slice(1) : normalized;
}

function lookup(value: unknown): TldInfo | undefined {
  const k = key(value);
  return k === undefined ? undefined : index.get(k);
}

/** IDNA treats the ideographic and full-width full stops as dots too. */
const IDN_DOTS = /[\u3002\uff0e\uff61]/g;

/** Hostname with IDN dots mapped to `.` and one trailing (root) dot removed. */
function hostOf(hostname: string): string {
  const host = hostname.replace(IDN_DOTS, '.');
  return host.endsWith('.') ? host.slice(0, -1) : host;
}

/**
 * Returns the canonical form of a TLD, or `undefined` if it is not in the root zone.
 * Accepts any case, a leading dot, and the ASCII (punycode) form of an IDN:
 * `normalizeTld('.COM')` is `'com'` and `normalizeTld('xn--p1ai')` is `'рф'`.
 */
export function normalizeTld(value: string): Tld | undefined {
  return lookup(value)?.tld;
}

/** True if `value` is a TLD in the root zone. Forgiving in the same ways as {@link normalizeTld}. */
export function isTld(value: string): boolean {
  return lookup(value) !== undefined;
}

/** Details of one TLD, or `undefined` if it is not in the root zone. */
export function getTldInfo(value: string): TldInfo | undefined {
  return lookup(value);
}

/** True if `value` is a country-code TLD (including internationalized ones such as `.рф`). */
export function isCountryCode(value: string): boolean {
  return lookup(value)?.type === 'country-code';
}

/**
 * Returns the TLD a hostname ends in, or `undefined` if its last label is not a real TLD.
 * `getTld('www.Example.co.uk.')` is `'uk'`; `getTld('example.local')` is `undefined`.
 *
 * This is the last label only. For the registrable suffix (`co.uk`) use the Public Suffix List.
 */
export function getTld(hostname: string): Tld | undefined {
  if (typeof hostname !== 'string') {
    return undefined;
  }
  const host = hostOf(hostname.trim());
  return normalizeTld(host.slice(host.lastIndexOf('.') + 1));
}

/** Every TLD matching `filter`, sorted by ASCII form. `listTlds({ brand: false })` lists the TLDs open to the public. */
export function listTlds(filter: TldFilter = {}): TldInfo[] {
  return all.filter(
    (info) =>
      (filter.type === undefined || info.type === filter.type) &&
      (filter.idn === undefined || info.idn === filter.idn) &&
      (filter.brand === undefined || info.brand === filter.brand) &&
      (filter.terminated === undefined || info.terminated === filter.terminated),
  );
}

/**
 * True if `hostname` is, or is under, a special-use domain name that never resolves on the public
 * internet: `localhost`, `local` (mDNS), `test`, `invalid`, `example`/`example.com`, `onion`, `alt`,
 * `home.arpa`, `internal` and the rest of IANA's special-use registry. `isSpecialUse('printer.local')`
 * is `true`; `isSpecialUse('example.org')` is `true` (reserved for documentation).
 */
export function isSpecialUse(hostname: string): boolean {
  if (typeof hostname !== 'string') {
    return false;
  }
  const labels = hostOf(hostname.trim()).toLowerCase().split('.');
  for (let i = 0; i < labels.length; i++) {
    if (specialUse.has(labels.slice(i).join('.'))) {
      return true;
    }
  }
  return false;
}

/** One DNS label: letters, digits and hyphens, 1-63 characters, no leading or trailing hyphen. */
const LDH_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * True if `hostname` is a syntactically valid domain name under a TLD in the root zone:
 * at least two labels, each 1-63 letters, digits or hyphens (no leading or trailing hyphen),
 * at most 253 characters in ASCII form, and a real TLD. Internationalized names are accepted
 * and checked in their ASCII (punycode) form, as is a trailing root dot.
 *
 * Strict where a validator should be: surrounding whitespace, `_`, ports, paths, IP addresses
 * and unknown TLDs (`example.local`) are all rejected. It checks the name, not that it resolves.
 */
export function isValidDomain(hostname: string): boolean {
  if (typeof hostname !== 'string') {
    return false;
  }
  const host = hostOf(hostname);
  // Letters of any script, combining marks, digits, hyphens and dots only.
  if (host === '' || !/^[\p{L}\p{M}\p{N}.-]+$/u.test(host)) {
    return false;
  }
  let ascii: string;
  try {
    // The URL parser applies the IDNA (UTS #46) mapping browsers use: case folding and punycode.
    ascii = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  const labels = ascii.split('.');
  return (
    ascii.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => LDH_LABEL.test(label)) &&
    isTld(labels[labels.length - 1])
  );
}

/** The 1.x API, kept for compatibility. */
export class TLDs {
  /** Canonical TLD -> 1. */
  public static tlds: Map<string, number> = new Map(all.map((info) => [info.tld, 1]));

  /** Same as {@link isTld}. Since 1.29 this also accepts any case, a leading dot and punycode. */
  public static isValid(tld: string): boolean {
    return isTld(tld) || this.tlds.has(tld);
  }
}
