import data from '../data/serialized.json';

export class TLDs {
  public static tlds: Map<string, number> = new Map(data as [string, number][]);

  public static isValid(tld: string): boolean {
    return this.tlds.has(tld);
  }
}
