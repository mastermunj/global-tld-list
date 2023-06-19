import fs from 'fs';
import path from 'path';

export class TLDs {
  public static tlds: Map<string, number>;

  static {
    const dataFile = path.join(path.dirname(__dirname), 'data', 'serialized.txt');
    const serialized = fs.readFileSync(dataFile, 'utf-8');
    this.tlds = new Map(JSON.parse(serialized));
  }

  public static isValid(tld: string): boolean {
    return this.tlds.has(tld);
  }
}
