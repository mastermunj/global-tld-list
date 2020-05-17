import axios, { AxiosResponse } from 'axios';
import fs from 'fs';
import path from 'path';

import { toUnicode } from 'punycode';

// import { TLDs as oldTLDs } from './index';

export class Sync {
  static ianaUrl = 'http://data.iana.org/TLD/tlds-alpha-by-domain.txt';

  static srcPath(): string {
    return path.dirname(__dirname) + '/src';
  }

  static async getData(): Promise<AxiosResponse<string>> {
    return axios.get<string>(Sync.ianaUrl);
  }

  static process(data: string): string[] {
    const tlds: string[] = [];
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
        tlds.push(line.trim());
      });
    return tlds;
  }

  static difference<T>(
    oldTLDs: T[],
    newTLDs: T[],
  ): { added: T[]; removed: T[] } {
    return {
      added: newTLDs.filter((tld) => !oldTLDs.includes(tld)),
      removed: oldTLDs.filter((tld) => !newTLDs.includes(tld)),
    };
  }

  static exportableTLDs(tlds: string[]): string {
    const data = JSON.stringify(tlds, null, 2)
      .replace(/"/gi, `'`)
      .replace(`\n]`, `,\n]`);
    return `export const TLDs = ${data};\n`;
  }

  // static changes(added: string[], removed: string[]): string {
  //   let changes = '';
  //   if (added.length > 0) {
  //     changes = `Added: ${added.join(', ')}\n`;
  //   }
  //   if (removed.length > 0) {
  //     changes += `Removed: ${removed.join(', ')}\n`;
  //   }
  //   return changes;
  // }

  static writeTLDs(tlds: string[]): void {
    const data = Sync.exportableTLDs(tlds);
    fs.writeFileSync(`${Sync.srcPath()}/index.ts`, data);
  }

  // static writeChanges(added: string[], removed: string[]): void {
  //   const changes = Sync.changes(added, removed);
  //   fs.writeFileSync(`${Sync.srcPath()}/.changes`, changes);
  // }

  static async do(): Promise<void> {
    const response = await Sync.getData();

    const tlds = Sync.process(response.data);

    // const { added, removed } = Sync.difference(oldTLDs, tlds);

    // if (added.length <= 0 && removed.length <= 0) {
    //   return;
    // }

    Sync.writeTLDs(tlds);

    // Sync.writeChanges(added, removed);
  }
}
