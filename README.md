# Global TLD List

Every top-level domain in the [IANA root zone](https://www.iana.org/domains/root/db), regenerated daily and published only when the list changes. Validate TLDs and domain names, find the TLD of a hostname, spot special-use names like `.local`, tell country codes from generic and brand TLDs, convert IDN TLDs between Unicode and punycode, and look up registry operators, RDAP servers and removed TLDs.

- All ~1,440 TLDs, including internationalized ones (`.рф`, `.भारत`, `.中国`)
- Forgiving input: any case, a leading dot, Unicode or punycode
- A `Tld` union type of every TLD for TypeScript, and a `KnownTld` type that never shrinks
- Zero dependencies, ESM and CommonJS, no Node-specific APIs at runtime

Data comes from IANA's [TLD list](https://data.iana.org/TLD/tlds-alpha-by-domain.txt), [RDAP bootstrap file](https://data.iana.org/rdap/dns.json) and [special-use domain names registry](https://www.iana.org/assignments/special-use-domain-names/special-use-domain-names.xhtml), and ICANN's [gTLD registry](https://www.icann.org/resources/registries/gtlds/v2/gtlds.json).

## Installation

```sh
npm install global-tld-list
```

## Usage

```js
import { isTld, normalizeTld, getTld, getTldInfo, isCountryCode, listTlds } from 'global-tld-list';

isTld('com'); // true
isTld('.COM'); // true
isTld('xn--p1ai'); // true (.рф)
isTld('local'); // false

normalizeTld('.COM'); // 'com'
normalizeTld('xn--p1ai'); // 'рф'

getTld('www.Example.co.uk'); // 'uk'
getTld('shop.xn--p1ai'); // 'рф'
getTld('printer.local'); // undefined

isCountryCode('io'); // true
isCountryCode('рф'); // true
isCountryCode('com'); // false
```

`getTld` returns the last label only. For the registrable suffix (`co.uk`, `github.io`) use a Public Suffix List library such as [tldts](https://www.npmjs.com/package/tldts).

### Domain names

```js
import { isValidDomain, isSpecialUse } from 'global-tld-list';

isValidDomain('example.com'); // true
isValidDomain('münchen.de'); // true (checked as xn--mnchen-3ya.de)
isValidDomain('example.com.'); // true (trailing root dot)
isValidDomain('example.local'); // false: .local is not a TLD
isValidDomain('exa_mple.com'); // false: _ is not allowed in a hostname
isValidDomain('example.com:443'); // false: ports, paths, IP addresses and spaces are rejected

isSpecialUse('printer.local'); // true (mDNS)
isSpecialUse('db.internal'); // true (reserved by ICANN for private networks)
isSpecialUse('www.example.com'); // true (reserved for documentation)
isSpecialUse('example.net.au'); // false
```

`isValidDomain` checks the name: at least two labels, each 1-63 letters, digits or hyphens with no hyphen at either end, at most 253 characters in ASCII form, under a TLD in the root zone. It does not check that the name resolves or is registered.

`isSpecialUse` is true for names that never resolve on the public internet: everything in IANA's [special-use registry](https://www.iana.org/assignments/special-use-domain-names/special-use-domain-names.xhtml) (`localhost`, `local`, `test`, `invalid`, `example`, `onion`, `alt`, `home.arpa`, ...), plus `internal`, and any subdomain of those. Use it to reject such hosts in a form, or to skip them in a crawler.

### TLD info

```js
getTldInfo('xn--h2brj9c');
// {
//   tld: 'भारत',            canonical lowercase Unicode form
//   ascii: 'xn--h2brj9c',   form used in DNS
//   type: 'country-code',   'generic' | 'country-code' | 'infrastructure'
//   idn: true,
//   brand: false,           ICANN ".brand" TLD, closed to the public
//   terminated: false,      ICANN terminated the registry agreement; being wound down
//   countryCode: 'IN',      ccTLDs only, ISO 3166-1 alpha-2
// }
```

`terminated` marks the few gTLDs (such as `.desi`) whose registry agreement ICANN has terminated. They still resolve, but are on their way out of the root zone.

`countryCode` works with `Intl.DisplayNames` to get a country name:

```js
const { countryCode } = getTldInfo('de');
new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode); // 'Germany'
```

`.uk` maps to `GB`. ISO's exceptionally reserved codes are used where they apply, e.g. `.eu` is `EU` and `.ac` is `AC`.

### Filtering

```js
listTlds(); // every TLD, sorted by ASCII form
listTlds({ type: 'country-code' }); // 309 ccTLDs
listTlds({ type: 'generic', brand: false }); // gTLDs anyone can register under
listTlds({ idn: true }); // internationalized TLDs
listTlds({ type: 'generic', brand: false, terminated: false }); // gTLDs open to new sign-ups
```

### TypeScript

```ts
import { normalizeTld, type KnownTld, type Tld } from 'global-tld-list';

const tld: Tld | undefined = normalizeTld(input);
const allowed: KnownTld[] = ['com', 'org', 'in']; // typos are compile errors
```

`Tld` is exactly the TLDs in the root zone today, so it loses a member when IANA removes a TLD. `KnownTld` is `Tld` plus every removed TLD and only ever grows, so prefer it for lists written in your own code: a removal then never breaks your build after an update.

## Registry details

Registry operators, delegation dates, RDAP servers and removed TLDs live in a separate entry point so the main bundle stays small (about 12 KB gzipped for the main entry, plus about 26 KB for details).

```js
import { getTldDetails, getRdapUrl } from 'global-tld-list/details';

getTldDetails('com');
// {
//   ...getTldInfo('com'),
//   registryOperator: 'VeriSign, Inc.',   generic TLDs only
//   delegationDate: '1985-01-01',         generic TLDs only
//   rdapServers: ['https://rdap.verisign.com/com/v1/'],
// }

getRdapUrl('example.com'); // 'https://rdap.verisign.com/com/v1/domain/example.com'
getRdapUrl('münchen.com'); // 'https://rdap.verisign.com/com/v1/domain/xn--mnchen-3ya.com'
```

[RDAP](https://about.rdap.org/) is the JSON successor to WHOIS. A `404` from the URL `getRdapUrl` returns means the domain is not registered, which makes a simple availability check:

```js
const url = getRdapUrl('my-new-startup.com');
const available = url !== undefined && (await fetch(url)).status === 404;
```

About 1,200 TLDs publish an RDAP server: every gTLD except `.edu` and `.mil`, but only a minority of ccTLDs. `getRdapUrl` returns `undefined` for the rest.

### Removed TLDs

```js
import { getRemovedTld, isRemovedTld, listRemovedTlds } from 'global-tld-list/details';

isRemovedTld('active'); // true
getRemovedTld('active');
// { tld: 'active', ascii: 'active', type: 'generic', removalDate: '2019-02-17' }
listRemovedTlds(); // every removed TLD, sorted by ASCII form
```

Removed gTLDs and their removal dates come from ICANN. Any other TLD that disappears from the root zone is added on the day the daily update first finds it missing. ccTLDs retired before this list existed (such as `.an` and `.tp`) are not included.

## 1.x API

The original API still works:

```js
import { TLDs } from 'global-tld-list';

TLDs.isValid('com'); // true
TLDs.tlds; // Map<string, 1> of every TLD in Unicode form
```

Since 1.29 `TLDs.isValid` is as forgiving as `isTld` (case, leading dot, punycode). The undocumented `data/serialized.json` file is no longer published; use `listTlds()` or `TLDs.tlds` instead.

## Updates

A GitHub Action regenerates the data from IANA and ICANN every day. A new version is published only when the data changed, and never when a download fails or looks truncated.

Each release's changelog entry says what changed. A TLD added or removed is a minor release (`feat(data): add .foo and remove .bar`); a change to registry details only, such as a renamed operator or new RDAP server, is a patch release (`fix(data): update .foo registry details`). The commit lists every change.
