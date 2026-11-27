// Минимальный разбор письма RFC 822 / MIME для входящих уведомлений: заголовки (с переносами и
// encoded-words RFC 2047), multipart, base64 и quoted-printable, кодировки через TextDecoder.
// Тело приходит строкой: 8bit-части не в UTF-8 могут прочитаться неверно — уведомления порталов
// обычно в base64 или quoted-printable.

export interface ParsedEmail {
  headers: Map<string, string[]>;
  subject: string;
  from: string;
  messageId: string | null;
  text: string;
}

function decoderFor(charset: string | undefined): TextDecoder {
  try {
    return new TextDecoder((charset || 'utf-8').trim().toLowerCase());
  } catch {
    return new TextDecoder('utf-8');
  }
}

function qpBytes(text: string, header = false): Uint8Array {
  const source = (header ? text.replace(/_/g, ' ') : text).replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(source.slice(i + 1, i + 3))) {
      bytes.push(parseInt(source.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of Buffer.from(ch, 'utf8')) bytes.push(b);
    }
  }
  return Uint8Array.from(bytes);
}

export function decodeHeaderWords(value: string): string {
  return value
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset: string, enc: string, data: string) => {
      const bytes = enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64') : qpBytes(data, true);
      return decoderFor(charset).decode(bytes);
    });
}

function splitHeadBody(raw: string): [string, string] {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? [raw.slice(0, m.index), raw.slice(m.index + m[0].length)] : [raw, ''];
}

function parseHeaders(head: string): Map<string, string[]> {
  const headers = new Map<string, string[]>();
  const unfolded = head.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = decodeHeaderWords(line.slice(i + 1).trim());
    headers.set(key, [...(headers.get(key) ?? []), value]);
  }
  return headers;
}

function param(value: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(value);
  return m ? (m[1] ?? m[2]) : undefined;
}

function decodeBody(body: string, encoding: string, charset: string | undefined): string {
  const enc = encoding.toLowerCase();
  if (enc === 'base64') return decoderFor(charset).decode(Buffer.from(body.replace(/\s+/g, ''), 'base64'));
  if (enc === 'quoted-printable') return decoderFor(charset).decode(qpBytes(body));
  return body;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\s[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 $1 ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ');
}

// Тексты частей письма: сначала text/plain, если его нет — text/html без разметки.
function collect(raw: string, depth: number, plain: string[], html: string[]): void {
  if (depth > 5) return;
  const [head, body] = splitHeadBody(raw);
  const headers = parseHeaders(head);
  const type = headers.get('content-type')?.[0] ?? 'text/plain';
  const encoding = headers.get('content-transfer-encoding')?.[0] ?? '7bit';
  const charset = param(type, 'charset');
  if (/^multipart\//i.test(type)) {
    const boundary = param(type, 'boundary');
    if (!boundary) return;
    const parts = body.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\s*\\r?\\n?`));
    for (const part of parts) if (part.trim()) collect(part, depth + 1, plain, html);
    return;
  }
  if (/attachment/i.test(headers.get('content-disposition')?.[0] ?? '')) return;
  if (/^text\/plain/i.test(type)) plain.push(decodeBody(body, encoding, charset));
  else if (/^text\/html/i.test(type)) html.push(htmlToText(decodeBody(body, encoding, charset)));
}

export function parseEmail(raw: string): ParsedEmail {
  const [head] = splitHeadBody(raw);
  const headers = parseHeaders(head);
  const plain: string[] = [];
  const html: string[] = [];
  collect(raw, 0, plain, html);
  return {
    headers,
    subject: headers.get('subject')?.[0] ?? '',
    from: headers.get('from')?.[0] ?? '',
    messageId: headers.get('message-id')?.[0]?.replace(/[<>\s]/g, '') || null,
    text: (plain.length ? plain : html).join('\n').replace(/\r\n/g, '\n'),
  };
}
