/**
 * Registry metadata, in a separate entry point (`global-tld-list/details`) so the main
 * bundle stays small for apps that only validate TLDs.
 */
import { DETAILS, OPERATORS, RDAP_SERVERS, REMOVED } from './details-data.js';
import { getTld, getTldInfo, type RemovedTld, type TldInfo, type TldType } from './index.js';

export type { KnownTld, RemovedTld } from './index.js';

export interface TldDetails extends TldInfo {
  /** Registry operator from the ICANN registry agreement. Generic TLDs only. */
  readonly registryOperator?: string;
  /** Date the TLD was delegated into the root zone (`YYYY-MM-DD`). Generic TLDs only. */
  readonly delegationDate?: string;
  /** RDAP base URLs from the IANA bootstrap file. Empty when the registry runs no RDAP service. */
  readonly rdapServers: readonly string[];
}

/** {@link TldInfo} plus registry metadata, or `undefined` if `value` is not in the root zone. */
export function getTldDetails(value: string): TldDetails | undefined {
  const info = getTldInfo(value);
  if (!info) {
    return undefined;
  }
  const [operator, delegationDate, rdap] = DETAILS[info.ascii];
  return Object.freeze({
    ...info,
    ...(operator >= 0 ? { registryOperator: OPERATORS[operator] } : {}),
    ...(delegationDate ? { delegationDate } : {}),
    rdapServers: rdap >= 0 ? RDAP_SERVERS[rdap] : [],
  });
}

/**
 * The RDAP URL that describes a domain, or `undefined` if its TLD has no RDAP service.
 * An HTTP 404 from this URL means the domain is not registered:
 *
 * ```js
 * const url = getRdapUrl('example.com'); // 'https://rdap.verisign.com/com/v1/domain/example.com'
 * const available = (await fetch(url)).status === 404;
 * ```
 *
 * Unicode domains are converted to their ASCII form. HTTPS servers are preferred.
 */
export function getRdapUrl(domain: string): string | undefined {
  const tld = getTld(domain);
  const servers = tld ? getTldDetails(tld)?.rdapServers : undefined;
  if (!servers || servers.length === 0) {
    return undefined;
  }
  const base = servers.find((server) => server.startsWith('https:')) ?? servers[0];
  const ascii = new URL(`http://${domain.trim().replace(/\.$/, '')}`).hostname;
  return `${base}domain/${ascii}`;
}

/** A TLD that was in the root zone and no longer is. */
export interface RemovedTldInfo {
  /** Canonical lowercase Unicode form. */
  readonly tld: RemovedTld;
  /** ASCII form as it appeared in DNS. */
  readonly ascii: string;
  readonly type: TldType;
  /**
   * `YYYY-MM-DD`. ICANN's removal date for gTLDs; for other TLDs, the day this package's daily
   * update first found it missing from the root zone.
   */
  readonly removalDate: string;
}

const removedRecords: Readonly<Record<string, readonly [string, string, string]>> = REMOVED;
const removedAll: RemovedTldInfo[] = Object.keys(removedRecords)
  .sort()
  .map((ascii) => {
    const [tld, type, removalDate] = removedRecords[ascii];
    return Object.freeze({ tld: tld as RemovedTld, ascii, type: type as TldType, removalDate });
  });
const removedIndex = new Map<string, RemovedTldInfo>();
for (const info of removedAll) {
  removedIndex.set(info.ascii, info);
  removedIndex.set(info.tld, info);
}

/**
 * Details of a TLD that was removed from the root zone, or `undefined` if it never was in it or still is.
 * Accepts the same forms as `normalizeTld`: `getRemovedTld('.Active')` is ICANN's 2019 removal of `.active`.
 */
export function getRemovedTld(value: string): RemovedTldInfo | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const key = value.trim().normalize('NFC').toLowerCase();
  return removedIndex.get(key.startsWith('.') ? key.slice(1) : key);
}

/** True if `value` was a TLD and has since been removed from the root zone. */
export function isRemovedTld(value: string): boolean {
  return getRemovedTld(value) !== undefined;
}

/** Every removed TLD, sorted by ASCII form. */
export function listRemovedTlds(): RemovedTldInfo[] {
  return [...removedAll];
}
