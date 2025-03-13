# Global TLD List

List of Global TLDs (gTLDs) gathered from [IANA](http://data.iana.org/TLD/tlds-alpha-by-domain.txt).

## Installation

```sh
npm install global-tld-list --save
```

## Usage

```js
import { TLDs } from 'global-tld-list';

const isValid = TLDs.isValid('com');
```

## Breaking Change in v1.0.0
Since v1.0.0, this package uses map instead of array for runtime performance.
