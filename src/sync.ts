import axios, { AxiosResponse } from 'axios';
import fs from 'fs';
import path from 'path';

import { toUnicode } from 'punycode';

export class Sync {
  static ianaUrl = 'http://data.iana.org/TLD/tlds-alpha-by-domain.txt';

  static async getData(): Promise<AxiosResponse<string>> {
    return axios.get<string>(Sync.ianaUrl);
  }

  static process(data: string): Map<string, number> {
    const tlds = new Map();
    data
      .toLowerCase()
      .split('\n')
      .forEach((line) => {
        if (line.length <= 0 || line.startsWith('#')) {
          return;
        }
        if (line.startsWith('xn--')) {
          line = toUnicode(line);
        }
        tlds.set(line.trim(), 1);
      });
    return tlds;
  }

  static async do(): Promise<void> {
    const response = await Sync.getData();

    const tlds = Sync.process(response.data);

    const dataFile = path.join(path.dirname(__dirname), 'data', 'serialized.txt');

    await fs.promises.writeFile(dataFile, JSON.stringify([...tlds]));
  }
}
