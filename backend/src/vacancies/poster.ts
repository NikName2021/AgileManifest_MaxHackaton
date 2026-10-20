import QRCode from 'qrcode';
import type { Vacancy } from '@prisma/client';
import { formatSalary, scheduleLabel } from './cardText.js';

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

// Перенос по словам для SVG <text>; слишком длинное слово режется по ширине строки.
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const chunks = word.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [];
    for (const chunk of chunks) {
      if (!line) line = chunk;
      else if (line.length + 1 + chunk.length <= maxChars) line += ` ${chunk}`;
      else { lines.push(line); line = chunk; }
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, maxChars - 1)}…`;
  }
  return lines;
}

// QR как вложенный <svg> заданного размера.
async function qrSvg(url: string, x: number, y: number, size: number): Promise<string> {
  const raw = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  const inner = raw.replace(/<\?xml[^>]*>/, '').replace(/\s(width|height)="[^"]*"/g, '');
  return inner.replace('<svg', `<svg x="${x}" y="${y}" width="${size}" height="${size}"`);
}

export async function renderQrSvg(url: string): Promise<string> {
  const raw = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return raw;
}

// Объявление A4 (единицы — миллиметры) для доски у магазина, администрации, общежития.
export async function renderPosterSvg(vacancy: Vacancy, url: string): Promise<string> {
  const title = wrap(vacancy.title, 20, 3);
  const details = [
    `Зарплата: ${formatSalary(vacancy.salaryMin, vacancy.salaryMax)}`,
    `График: ${scheduleLabel(vacancy.schedule)}`,
    vacancy.regionCode ? `Где: ${vacancy.regionCode}` : null,
    vacancy.headcount ? `Нужно человек: ${vacancy.headcount}` : null,
  ].filter((l): l is string => l !== null).flatMap((l) => wrap(l, 38, 2));

  let y = 32;
  const parts: string[] = [];
  parts.push(`<text x="105" y="${y}" font-size="11" font-weight="700" text-anchor="middle" fill="#2563eb" letter-spacing="1">ТРЕБУЮТСЯ</text>`);
  y += 18;
  for (const line of title) {
    parts.push(`<text x="105" y="${y}" font-size="14" font-weight="700" text-anchor="middle">${escapeXml(line)}</text>`);
    y += 16;
  }
  y += 4;
  for (const line of details) {
    parts.push(`<text x="105" y="${y}" font-size="8" text-anchor="middle">${escapeXml(line)}</text>`);
    y += 10;
  }

  const qrSize = 110;
  const qrY = Math.max(y + 6, 120);
  parts.push(await qrSvg(url, (210 - qrSize) / 2, qrY, qrSize));
  let bottom = qrY + qrSize + 12;
  for (const line of ['Наведите камеру телефона на код —', 'откликнуться можно в MAX за 2 нажатия, без резюме']) {
    parts.push(`<text x="105" y="${bottom}" font-size="7" text-anchor="middle">${escapeXml(line)}</text>`);
    bottom += 9;
  }
  parts.push(`<text x="105" y="${bottom + 4}" font-size="4.5" text-anchor="middle" fill="#555">${escapeXml(url)}</text>`);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" font-family="Arial, Helvetica, sans-serif">',
    '<rect width="210" height="297" fill="#ffffff"/>',
    '<rect x="8" y="8" width="194" height="281" fill="none" stroke="#2563eb" stroke-width="1.2" rx="4"/>',
    ...parts,
    '</svg>',
  ].join('\n');
}
