# Global TLD List

List of Glogal TLDs (gTLDs) gathered from [IANA](http://data.iana.org/TLD/tlds-alpha-by-domain.txt).

## Installation

```sh
npm install global-tld-list --save
```

## Usage

```js
import { TLDs } from 'global-tld-list';

const isValid = TLDs.indexOf('com') >= 0;
```
