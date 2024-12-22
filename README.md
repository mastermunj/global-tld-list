# Global TLD List

List of Global TLDs (gTLDs) gathered from [IANA](http://data.iana.org/TLD/tlds-alpha-by-domain.txt).

## Installation

```sh
npm install @boredland/global-tld-list --save
```

## Usage

```js
import { isValidTLD } from "@boredland/global-tld-list";

const isValid = isValidTLD("com");
```

## Breaking Change in v1.0.0

Since v1.0.0, this package uses Map instead of array for runtime performance.

## Breaking Change in v2.0.0

Since v1.0.0, this package uses Set instead of array for runtime performance.
