/**
 * Punycode (RFC 3492) decoding for the part of an IDN label after `xn--`. Used to reject labels
 * that look like IDNs but are not, identically on every runtime: how `URL` and `domainToUnicode`
 * treat invalid punycode differs between Node and browser versions.
 *
 * The input is already a lowercase LDH label, so every character is a valid punycode digit.
 * Returns `undefined` when the label does not decode, or decodes to no non-ASCII characters.
 */
export function decodePunycode(input: string): string | undefined {
  const basicEnd = Math.max(input.lastIndexOf('-'), 0);
  const output: number[] = [];
  for (let j = 0; j < basicEnd; j++) {
    output.push(input.charCodeAt(j));
  }
  let n = 128;
  let i = 0;
  let bias = 72;
  for (let pos = basicEnd > 0 ? basicEnd + 1 : 0; pos < input.length;) {
    const oldi = i;
    for (let w = 1, k = 36; ; k += 36) {
      if (pos >= input.length) {
        return undefined;
      }
      const c = input.charCodeAt(pos++);
      // 'a'-'z' are digits 0-25, '0'-'9' are 26-35.
      const digit = c <= 57 ? c - 22 : c - 97;
      i += digit * w;
      if (i > 0x7fffffff) {
        return undefined;
      }
      const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < t) {
        break;
      }
      w *= 36 - t;
    }
    const length = output.length + 1;
    bias = adapt(i - oldi, length, oldi === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff) {
      return undefined;
    }
    output.splice(i++, 0, n);
  }
  // An A-label must encode at least one non-ASCII code point: `xn--a` (empty) and `xn--abc-` (plain
  // `abc`) decode without error but are not IDN labels.
  if (!output.some((codePoint) => codePoint >= 0x80)) {
    return undefined;
  }
  return String.fromCodePoint(...output);
}

function adapt(delta: number, numPoints: number, first: boolean): number {
  let d = first ? Math.floor(delta / 700) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  for (; d > 455; k += 36) {
    d = Math.floor(d / 35);
  }
  return k + Math.floor((36 * d) / (d + 38));
}
