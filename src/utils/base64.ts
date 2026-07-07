// Small, dependency-free base64url encoder. Gmail's "raw" message field
// must be UTF-8 bytes, base64url-encoded (RFC 4648 §5 — "-" and "_"
// instead of "+" and "/", no padding). We don't rely on btoa/Buffer being
// present since availability varies across RN/Hermes versions.

const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)!;
    if (code > 0xffff) i++; // consumed a surrogate pair

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return bytes;
}

function bytesToBase64(bytes: number[]): string {
  let result = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result += B64_CHARS[(chunk >> 18) & 0x3f];
    result += B64_CHARS[(chunk >> 12) & 0x3f];
    result += B64_CHARS[(chunk >> 6) & 0x3f];
    result += B64_CHARS[chunk & 0x3f];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i] << 16;
    result += B64_CHARS[(chunk >> 18) & 0x3f];
    result += B64_CHARS[(chunk >> 12) & 0x3f];
    result += '==';
  } else if (remaining === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8);
    result += B64_CHARS[(chunk >> 18) & 0x3f];
    result += B64_CHARS[(chunk >> 12) & 0x3f];
    result += B64_CHARS[(chunk >> 6) & 0x3f];
    result += '=';
  }
  return result;
}

export function utf8ToBase64Url(str: string): string {
  const base64 = bytesToBase64(utf8Bytes(str));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
