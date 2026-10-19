import { describe, expect, test } from 'vitest';

import { describeChanges, formatCommitMessage, MAX_BODY_LINES, MAX_LINE, type Snapshot } from '../scripts/changes.mts';
import type { TldRecord } from '../scripts/generate.mts';

const tld = (ascii: string, extra: Partial<TldRecord> = {}): TldRecord => ({
  ascii,
  unicode: ascii,
  type: 'generic',
  brand: false,
  ...extra,
});

const snapshot = (records: TldRecord[], specialUse: string[] = ['local']): Snapshot => ({
  records,
  removed: [],
  specialUse,
});

const base = snapshot([
  tld('com', { registryOperator: 'VeriSign, Inc.', delegationDate: '1985-01-01', rdapServers: ['https://a/'] }),
  tld('in', { type: 'country-code', countryCode: 'IN' }),
  tld('old'),
]);

describe('describeChanges', () => {
  test('nothing to compare with', () => {
    expect(describeChanges(undefined, base)).toStrictEqual({ subject: 'fix(data): regenerate TLD data', body: [] });
  });

  test('no differences', () => {
    expect(describeChanges(base, base)).toStrictEqual({ subject: 'fix(data): regenerate TLD data', body: [] });
  });

  test('added and removed TLDs are a feat, named in the subject', () => {
    const after = snapshot([
      ...base.records.filter((r) => r.ascii !== 'old'),
      tld('new'),
      tld('xn--p1ai', { unicode: 'рф', type: 'country-code' }),
    ]);
    expect(describeChanges(base, after)).toStrictEqual({
      subject: 'feat(data): add .new and .рф and remove .old',
      body: ['- Added .new (generic)', '- Added .рф (xn--p1ai) (country-code)', '- Removed .old (generic)'],
    });
  });

  test('many additions switch the subject to a count', () => {
    const added = ['a', 'b', 'c', 'd', 'e'].map((ascii) => tld(ascii));
    expect(describeChanges(base, snapshot([...base.records, ...added])).subject).toBe('feat(data): add 5 TLDs');
  });

  test('a removal alone', () => {
    expect(describeChanges(base, snapshot(base.records.slice(0, 2))).subject).toBe('feat(data): remove .old');
  });

  test('a subject that would be too long switches to counts', () => {
    const long = (ascii: string): TldRecord => tld(ascii.repeat(30));
    const after = snapshot([long('a'), long('b'), long('c'), long('d')]);
    expect(describeChanges(base, after).subject).toBe('feat(data): add 4 TLDs and remove 3 TLDs');
    expect(describeChanges(base, snapshot([...base.records.slice(0, 2), long('a')])).subject).toBe(
      'feat(data): add .aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa and remove .old',
    );
    const one = snapshot([...base.records.slice(0, 2), ...['a', 'b', 'c', 'd'].map(long)]);
    expect(describeChanges(base, one).subject).toBe('feat(data): add 4 TLDs and remove 1 TLD');
  });

  test('every metadata field is described, and one changed TLD is named in a fix', () => {
    const after = snapshot([
      tld('com', {
        type: 'infrastructure',
        brand: true,
        terminated: true,
        countryCode: 'US',
        registryOperator: 'Someone Else',
        rdapServers: ['https://b/'],
      }),
      base.records[1],
      base.records[2],
    ]);
    expect(describeChanges(base, after)).toStrictEqual({
      subject: 'fix(data): update .com registry details',
      body: [
        '- .com: type generic -> infrastructure',
        '- .com: country code none -> "US"',
        '- .com: now a .brand TLD',
        '- .com: registry agreement terminated',
        '- .com: registry operator "VeriSign, Inc." -> "Someone Else"',
        '- .com: delegation date "1985-01-01" -> none',
        '- .com: RDAP servers "https://a/" -> "https://b/"',
      ],
    });
  });

  test('reverse flags', () => {
    const before = snapshot([tld('com', { brand: true, terminated: true })]);
    expect(describeChanges(before, snapshot([tld('com')])).body).toStrictEqual([
      '- .com: no longer a .brand TLD',
      '- .com: registry agreement no longer marked terminated',
    ]);
  });

  test('several changed TLDs are counted', () => {
    const after = snapshot([
      { ...base.records[0], registryOperator: 'X' },
      { ...base.records[1], countryCode: 'XX' },
      base.records[2],
    ]);
    expect(describeChanges(base, after).subject).toBe('fix(data): update registry details for 2 TLDs');
  });

  test('special-use changes', () => {
    expect(describeChanges(base, snapshot(base.records, ['alt']))).toStrictEqual({
      subject: 'fix(data): update special-use domain names',
      body: ['- Special-use names added: alt', '- Special-use names removed: local'],
    });
  });

  test('lines stay within commitlint limits', () => {
    const operator = 'An Extremely Long Registry Operator Name, Incorporated '.repeat(3);
    const after = snapshot([{ ...base.records[0], registryOperator: operator }, base.records[1], base.records[2]]);
    const { body } = describeChanges(base, after);
    expect(body[0]).toHaveLength(MAX_LINE);
    expect(body[0].endsWith('…')).toBe(true);
  });

  test('a long body ends with a count of the rest', () => {
    const added = Array.from({ length: MAX_BODY_LINES + 5 }, (_, i) => tld(`n${i}`));
    const { body } = describeChanges(base, snapshot([...base.records, ...added]));
    expect(body).toHaveLength(MAX_BODY_LINES);
    expect(body[body.length - 1]).toBe('- …and 6 more');
  });
});

describe('formatCommitMessage', () => {
  test('subject only', () => {
    expect(formatCommitMessage({ subject: 'fix(data): x', body: [] })).toBe('fix(data): x\n');
  });

  test('subject, blank line, body', () => {
    expect(formatCommitMessage({ subject: 'feat(data): x', body: ['- a', '- b'] })).toBe('feat(data): x\n\n- a\n- b\n');
  });
});
