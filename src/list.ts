import fs from 'node:fs';
import path from 'node:path';
import { toUnicode } from 'punycode';

export class List {
  static ianaUrl = 'http://data.iana.org/TLD/tlds-alpha-by-domain.txt';

  static async getData(): Promise<string> {
    const response = await fetch(List.ianaUrl);
    return response.text();
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

  static async generate(): Promise<void> {
    const response = await List.getData();

    const tlds = List.process(response);

    const dataFile = path.join(path.dirname(__dirname), 'data', 'serialized.json');

    await fs.promises.writeFile(dataFile, JSON.stringify([...tlds]));
  }
}

(async (): Promise<void> => {
  await List.generate();
})();
