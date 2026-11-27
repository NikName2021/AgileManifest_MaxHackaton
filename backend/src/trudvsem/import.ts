import type { Vacancy } from '@prisma/client';
import { db } from '../db.js';
import { fetchCompanyVacancies, type CompanyId, type TrudvsemFullVacancy } from './client.js';
import { matchCategory } from '../categories/service.js';
import { normalizeRegion } from '../regions/dictionary.js';
import { normalizeContact, removeContactLike, findContactLike, MAX_CONTACTS_PER_FIELD } from '../moderation.js';
import { hasForbiddenChars, isMeaningful, normalizeMultiLine, normalizeSingleLine, SALARY_MAX } from '../text.js';
import { MAX_CARD_TEXT_LIMIT, vacancyCardTextLength } from '../vacancies/cardText.js';

// Импорт вакансий работодателя с «Работы России» по ИНН или ОГРН: вакансии становятся черновиками
// «Сезона» — их остаётся проверить и опубликовать (карточка в MAX, QR-плакат, рассылки). Источник —
// открытые данные портала (opendata.trudvsem.ru), без входа через Госуслуги.

export const TRUDVSEM_SOURCE = 'trudvsem';
// Сколько вакансий забираем за один импорт.
export const IMPORT_LIMIT = 50;

export function parseCompanyId(raw: string): CompanyId | null {
  const digits = raw.replace(/\s/g, '');
  if (/^\d{10}$|^\d{12}$/.test(digits)) return { inn: digits };
  if (/^\d{13}$|^\d{15}$/.test(digits)) return { ogrn: digits };
  return null;
}

function cleanText(raw: string | undefined, multiline: boolean): string {
  const noHtml = (raw ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const stripped = removeContactLike(noHtml).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/g, '');
  return multiline ? normalizeMultiLine(stripped) : normalizeSingleLine(stripped);
}

function schedule(v: TrudvsemFullVacancy): string {
  const text = `${v.employment ?? ''} ${v.schedule ?? ''}`.toLowerCase();
  if (text.includes('сезон')) return 'seasonal';
  if (text.includes('времен') || text.includes('вахт')) return 'temporary';
  return 'permanent';
}

// Условия портала, которые прямо совпадают с нашими бейджами.
function badges(v: TrudvsemFullVacancy): string[] {
  const keys = new Set<string>();
  const sched = (v.schedule ?? '').toLowerCase();
  if (sched.includes('сменн')) keys.add('shifts');
  if (sched.includes('гибк')) keys.add('flexible');
  if (sched.includes('неполн')) keys.add('part_time');
  if (sched.includes('вахт')) keys.add('rotation');
  for (const s of v.shift ?? []) {
    if (/дневн/i.test(s)) keys.add('day_shifts');
    if (/ночн/i.test(s)) keys.add('night_shifts');
  }
  if (v.requirement?.experience === 0) keys.add('no_experience');
  return [...keys];
}

function salary(n: number | undefined): number | null {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= SALARY_MAX ? n : null;
}

function category(v: TrudvsemFullVacancy): string {
  for (const text of [v['job-name'], v.typicalPosition, v.category?.specialisation]) {
    if (!text) continue;
    const found = matchCategory(text);
    if (found.match !== 'other') return found.name;
  }
  return 'Другое';
}

function contactInfo(v: TrudvsemFullVacancy): string | null {
  const contacts = (v.contact_list ?? [])
    .map((c) => normalizeContact(c.contact_value ?? ''))
    .filter((c): c is string => c !== null);
  return contacts.length ? [...new Set(contacts)].slice(0, MAX_CONTACTS_PER_FIELD).join(', ') : null;
}

export interface ImportDraft {
  externalId: string;
  externalUrl: string | null;
  title: string;
  regionCode: string;
  regionSubject: string | null;
  category: string;
  schedule: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  contactInfo: string | null;
  headcount: number | null;
  badges: string[];
}

// Вакансия портала → черновик «Сезона» по нашим правилам: контакты из текста вырезаны (они идут
// в поле контакта), сфера — из справочника, описание укорочено под лимит карточки MAX.
export function toDraft(v: TrudvsemFullVacancy): ImportDraft | null {
  const title = cleanText(v['job-name'], false).slice(0, 200).trim();
  if (!title || !isMeaningful(title) || hasForbiddenChars(title) || findContactLike(title)) return null;
  const region = cleanText(v.region?.name, false).slice(0, 100);
  const duty = cleanText(v.duty, true);
  const req = cleanText(v.requirements, true);
  let description = [duty, req && !duty.includes(req) ? `Требования: ${req}` : ''].filter(Boolean).join('\n\n') || null;
  const draft: ImportDraft = {
    externalId: v.id,
    externalUrl: v.vac_url && /^https:\/\/trudvsem\.ru\//.test(v.vac_url) ? v.vac_url : null,
    title,
    regionCode: region,
    regionSubject: normalizeRegion(region) ?? (v.region?.region_code?.match(/^(\d{2})0{11}$/)?.[1] ?? null),
    category: category(v),
    schedule: schedule(v),
    salaryMin: salary(v.salary_min),
    salaryMax: salary(v.salary_max),
    description,
    contactInfo: contactInfo(v),
    headcount: typeof v.work_places === 'number' && v.work_places >= 1 && v.work_places <= 1000 ? v.work_places : null,
    badges: badges(v),
  };
  if (draft.salaryMin !== null && draft.salaryMax !== null && draft.salaryMin > draft.salaryMax) draft.salaryMax = null;
  // Карточка в MAX не длиннее 4000 символов — режем описание по предложениям.
  const length = () => vacancyCardTextLength({ ...draft, description });
  while (description && length() > MAX_CARD_TEXT_LIMIT) {
    const cut = description.slice(0, Math.max(0, description.length - 200));
    description = cut.replace(/\s+\S*$/, '').trimEnd() + '…';
    if (description.length < 10) description = null;
  }
  draft.description = description;
  return draft;
}

export interface CompanyPreviewItem {
  externalId: string;
  title: string;
  salaryMin: number | null;
  salaryMax: number | null;
  region: string;
  category: string;
  externalUrl: string | null;
  // Уже импортирована этим работодателем — id черновика или вакансии в «Сезоне».
  importedVacancyId: number | null;
}

export interface CompanyPreview {
  company: { name: string | null; inn: string | null; ogrn: string | null } | null;
  items: CompanyPreviewItem[];
}

async function importedMap(employerUserId: number, ids: string[]): Promise<Map<string, number>> {
  const rows = await db.vacancy.findMany({
    where: { employerUserId, externalSource: TRUDVSEM_SOURCE, externalId: { in: ids } },
    select: { id: true, externalId: true },
  });
  return new Map(rows.map((r) => [r.externalId!, r.id]));
}

// Что можно импортировать: вакансии компании на портале и какие из них уже в «Сезоне».
export async function previewCompanyVacancies(employerUserId: number, company: CompanyId): Promise<CompanyPreview> {
  const vacancies = (await fetchCompanyVacancies(company)).slice(0, IMPORT_LIMIT);
  const drafts = vacancies.map((v) => ({ v, d: toDraft(v) })).filter((x) => x.d !== null);
  const imported = await importedMap(employerUserId, drafts.map((x) => x.d!.externalId));
  const first = vacancies[0]?.company;
  return {
    company: first ? { name: first.name ?? null, inn: first.inn ?? null, ogrn: first.ogrn ?? null } : null,
    items: drafts.map(({ d }) => ({
      externalId: d!.externalId,
      title: d!.title,
      salaryMin: d!.salaryMin,
      salaryMax: d!.salaryMax,
      region: d!.regionCode,
      category: d!.category,
      externalUrl: d!.externalUrl,
      importedVacancyId: imported.get(d!.externalId) ?? null,
    })),
  };
}

export interface ImportResult {
  created: Vacancy[];
  skipped: { externalId: string; reason: 'already_imported' | 'not_found' | 'invalid' }[];
}

// Черновики из выбранных вакансий (ids не передан — из всех ещё не импортированных). Данные берём
// с портала заново на сервере: клиенту в этом не доверяем. Повторный импорт дублей не создаёт.
export async function importCompanyVacancies(employerUserId: number, company: CompanyId, ids?: string[]): Promise<ImportResult> {
  const vacancies = (await fetchCompanyVacancies(company)).slice(0, IMPORT_LIMIT);
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  const wanted = ids ? [...new Set(ids)] : vacancies.map((v) => v.id);
  const imported = await importedMap(employerUserId, wanted);
  const result: ImportResult = { created: [], skipped: [] };
  for (const externalId of wanted) {
    if (imported.has(externalId)) { result.skipped.push({ externalId, reason: 'already_imported' }); continue; }
    const source = byId.get(externalId);
    if (!source) { result.skipped.push({ externalId, reason: 'not_found' }); continue; }
    const draft = toDraft(source);
    if (!draft) { result.skipped.push({ externalId, reason: 'invalid' }); continue; }
    try {
      result.created.push(await db.vacancy.create({
        data: { employerUserId, ...draft, externalSource: TRUDVSEM_SOURCE, studentFriendly: false, status: 'draft' },
      }));
    } catch (err: any) {
      // Параллельный импорт той же вакансии — уникальный индекс.
      if (err?.code === 'P2002') { result.skipped.push({ externalId, reason: 'already_imported' }); continue; }
      throw err;
    }
  }
  // ИНН запоминаем: в следующий раз работодателю не нужно вводить его снова.
  const inn = 'inn' in company ? company.inn : vacancies[0]?.company?.inn;
  if (inn) await db.user.update({ where: { id: employerUserId }, data: { companyInn: inn } });
  return result;
}
