import { db } from '../db.js';
import { normalizeRegion, regionByCode, REGIONS } from './dictionary.js';

export interface RegionDto {
  code: string;
  name: string;
}

export function regionDto(code: string | null | undefined): RegionDto | null {
  const region = regionByCode(code);
  return region ? { code: region.code, name: region.name } : null;
}

export function listRegions(): RegionDto[] {
  return REGIONS.map((r) => ({ code: r.code, name: r.name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// Заполняет region_subject у вакансий, созданных до справочника. Идемпотентно: трогает только
// записи без кода, нераспознанные остаются null и проверяются снова при следующем старте.
export async function backfillRegionSubjects(): Promise<number> {
  const rows = await db.vacancy.findMany({
    where: { regionSubject: null, regionCode: { not: '' } },
    select: { id: true, regionCode: true },
  });
  let updated = 0;
  for (const row of rows) {
    const code = normalizeRegion(row.regionCode);
    if (!code) continue;
    await db.vacancy.update({ where: { id: row.id }, data: { regionSubject: code } });
    updated += 1;
  }
  return updated;
}
