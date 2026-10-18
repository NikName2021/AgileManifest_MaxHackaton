import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export interface MaxInitDataUser {
  id: string;
  name?: string;
}

export interface ParsedInitData {
  user: MaxInitDataUser;
  authDate: number;
}

// Окно годности auth_date MAX не документирует — консервативное значение, как в похожих Web App SDK.
const MAX_INIT_DATA_AGE_SECONDS = 24 * 3600;

// dev.max.ru/docs/webapps/validation:
// secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)
// signature  = HMAC_SHA256(key=secret_key, data=dataCheckString)
// dataCheckString — параметры initData без hash, отсортированные по ключу, "key=value" через \n.
export function verifyMaxInitData(initData: string): { ok: true; data: ParsedInitData } | { ok: false; error: string } {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: 'malformed initData' };
  }

  // Повторяющиеся ключи отклоняем: params.get() вернул бы только первое значение, и проверялась
  // бы подпись не тех данных, которые потом используются.
  const rawKeys = Array.from(params.keys());
  if (new Set(rawKeys).size !== rawKeys.length) {
    return { ok: false, error: 'duplicate parameter in initData' };
  }

  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'missing hash' };
  params.delete('hash');

  const pairs: string[] = [];
  for (const key of Array.from(params.keys()).sort()) {
    pairs.push(`${key}=${params.get(key)}`);
  }
  const dataCheckString = pairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(config.maxBotToken).digest();
  const signature = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  let signatureBuf: Buffer;
  let hashBuf: Buffer;
  try {
    signatureBuf = Buffer.from(signature, 'hex');
    hashBuf = Buffer.from(hash, 'hex');
  } catch {
    return { ok: false, error: 'malformed hash' };
  }
  if (signatureBuf.length !== hashBuf.length || !timingSafeEqual(signatureBuf, hashBuf)) {
    return { ok: false, error: 'invalid signature' };
  }

  const authDateRaw = params.get('auth_date');
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate)) {
    return { ok: false, error: 'missing auth_date' };
  }
  const ageSeconds = Date.now() / 1000 - authDate;
  if (ageSeconds > MAX_INIT_DATA_AGE_SECONDS || ageSeconds < -60) {
    return { ok: false, error: 'initData expired or clock skew' };
  }

  const userRaw = params.get('user');
  if (!userRaw) return { ok: false, error: 'missing user' };
  let userJson: any;
  try {
    userJson = JSON.parse(userRaw);
  } catch {
    return { ok: false, error: 'malformed user field' };
  }
  const userId = userJson?.id ?? userJson?.user_id;
  if (!userId) return { ok: false, error: 'user id missing in initData' };

  return {
    ok: true,
    data: {
      user: { id: String(userId), name: userJson?.name ?? userJson?.first_name },
      authDate,
    },
  };
}
