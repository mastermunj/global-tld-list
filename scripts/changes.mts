/**
 * Describes what changed between two generator runs as a conventional commit, so each release's
 * changelog entry says which TLDs were added or removed instead of "generate new TLD list".
 *
 * New or removed TLDs are a `feat` (minor release); anything else is a `fix` (patch release).
 * Lines are kept within commitlint's 100-character header and body limits.
 */
import type { RemovedRecord, TldRecord } from './generate.mts';

export interface Snapshot {
  records: TldRecord[];
  removed: RemovedRecord[];
  specialUse: string[];
}

export interface CommitMessage {
  subject: string;
  body: string[];
}

/** commitlint's `header-max-length` and `body-max-line-length`. */
export const MAX_LINE = 100;
/** Past this many lines the body ends with a count of the rest. */
export const MAX_BODY_LINES = 60;
/** Subjects name TLDs individually up to this many, then switch to a count. */
const MAX_NAMED = 4;

const label = (r: Pick<TldRecord, 'ascii' | 'unicode'>): string =>
  r.unicode === r.ascii ? `.${r.ascii}` : `.${r.unicode} (${r.ascii})`;

const truncate = (line: string): string => (line.length <= MAX_LINE ? line : `${line.slice(0, MAX_LINE - 1)}…`);

const names = (records: TldRecord[], noun: string): string => {
  if (records.length > MAX_NAMED) {
    return `${records.length} ${noun}s`;
  }
  const labels = records.map((r) => `.${r.unicode}`);
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};

const show = (value: string | undefined): string => (value === undefined ? 'none' : `"${value}"`);

/** One line per field that differs between two records of the same TLD. */
function fieldChanges(before: TldRecord, after: TldRecord): string[] {
  const name = label(after);
  const lines: string[] = [];
  if (before.type !== after.type) {
    lines.push(`${name}: type ${before.type} -> ${after.type}`);
  }
  if (before.countryCode !== after.countryCode) {
    lines.push(`${name}: country code ${show(before.countryCode)} -> ${show(after.countryCode)}`);
  }
  if (before.brand !== after.brand) {
    lines.push(`${name}: ${after.brand ? 'now' : 'no longer'} a .brand TLD`);
  }
  if (Boolean(before.terminated) !== Boolean(after.terminated)) {
    lines.push(`${name}: registry agreement ${after.terminated ? 'terminated' : 'no longer marked terminated'}`);
  }
  if (before.registryOperator !== after.registryOperator) {
    lines.push(`${name}: registry operator ${show(before.registryOperator)} -> ${show(after.registryOperator)}`);
  }
  if (before.delegationDate !== after.delegationDate) {
    lines.push(`${name}: delegation date ${show(before.delegationDate)} -> ${show(after.delegationDate)}`);
  }
  const servers = (r: TldRecord): string | undefined => r.rdapServers?.join(' ');
  if (servers(before) !== servers(after)) {
    lines.push(`${name}: RDAP servers ${show(servers(before))} -> ${show(servers(after))}`);
  }
  return lines;
}

/** Summarises `after` against `before`; with no `before` there is nothing to compare, so it says so. */
export function describeChanges(before: Snapshot | undefined, after: Snapshot): CommitMessage {
  if (!before) {
    return { subject: 'fix(data): regenerate TLD data', body: [] };
  }
  const old = new Map(before.records.map((r) => [r.ascii, r]));
  const current = new Map(after.records.map((r) => [r.ascii, r]));
  const added = after.records.filter((r) => !old.has(r.ascii));
  const removed = before.records.filter((r) => !current.has(r.ascii));

  const changed: string[] = [];
  const changedRecords: TldRecord[] = [];
  for (const r of [...after.records].sort((a, b) => (a.ascii < b.ascii ? -1 : 1))) {
    const previous = old.get(r.ascii);
    const lines = previous ? fieldChanges(previous, r) : [];
    if (lines.length > 0) {
      changed.push(...lines);
      changedRecords.push(r);
    }
  }

  const oldSpecial = new Set(before.specialUse);
  const newSpecial = new Set(after.specialUse);
  const specialAdded = after.specialUse.filter((name) => !oldSpecial.has(name));
  const specialRemoved = before.specialUse.filter((name) => !newSpecial.has(name));

  const body = [
    ...added.map((r) => `Added ${label(r)} (${r.type})`),
    ...removed.map((r) => `Removed ${label(r)} (${r.type})`),
    ...changed,
    ...(specialAdded.length > 0 ? [`Special-use names added: ${specialAdded.join(', ')}`] : []),
    ...(specialRemoved.length > 0 ? [`Special-use names removed: ${specialRemoved.join(', ')}`] : []),
  ];
  const lines =
    body.length > MAX_BODY_LINES
      ? [...body.slice(0, MAX_BODY_LINES - 1), `…and ${body.length - MAX_BODY_LINES + 1} more`]
      : body;

  let subject: string;
  if (added.length > 0 || removed.length > 0) {
    const summary = (count: (records: TldRecord[], noun: string) => string): string =>
      [
        ...(added.length > 0 ? [`add ${count(added, 'TLD')}`] : []),
        ...(removed.length > 0 ? [`remove ${count(removed, 'TLD')}`] : []),
      ].join(' and ');
    subject = `feat(data): ${summary(names)}`;
    if (subject.length > MAX_LINE) {
      subject = `feat(data): ${summary((records, noun) => `${records.length} ${noun}${records.length === 1 ? '' : 's'}`)}`;
    }
  } else if (changedRecords.length === 1) {
    subject = truncate(`fix(data): update ${label(changedRecords[0])} registry details`);
  } else if (changedRecords.length > 1) {
    subject = `fix(data): update registry details for ${changedRecords.length} TLDs`;
  } else if (specialAdded.length > 0 || specialRemoved.length > 0) {
    subject = 'fix(data): update special-use domain names';
  } else {
    subject = 'fix(data): regenerate TLD data';
  }
  return { subject, body: lines.map((line) => truncate(`- ${line}`)) };
}

/** `subject`, a blank line, then the body: the layout `git commit -F` and commitlint expect. */
export function formatCommitMessage(message: CommitMessage): string {
  return message.body.length === 0 ? `${message.subject}\n` : `${message.subject}\n\n${message.body.join('\n')}\n`;
}
