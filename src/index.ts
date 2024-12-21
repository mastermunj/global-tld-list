import data from '../data/serialized.json' with { type: 'json' };

const tlds = new Map(data as [string, number][]);

const isValid = (tld: string): boolean => {
  return tlds.has(tld);
};

export const TLDs = {
  isValid,
  tlds,
};

export default TLDs;
