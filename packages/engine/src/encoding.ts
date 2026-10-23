/**
 * Answers in published puzzle files are XORed with the puzzle id and base64-encoded. This stops
 * them being read at a glance; it is not security. Server-side scoring is the later fix for that.
 */

export function encodeAnswer(answer: string, key: string): string {
  return btoa(xor(answer, key));
}

export function decodeAnswer(encoded: string, key: string): string {
  return xor(atob(encoded), key);
}

function xor(text: string, key: string): string {
  if (key.length === 0) {
    throw new RangeError('The encoding key must not be empty.');
  }
  return Array.from(text, (char, i) =>
    String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length)),
  ).join('');
}
