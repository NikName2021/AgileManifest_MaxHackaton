import { Prisma } from '@prisma/client';
import { db } from '../db.js';

// Дорожная карта отклика для кандидата: этапы по порядку, на каком он сейчас и когда каждый
// пройден. Время — из журнала application_events; frontend показывает его по наведению (чч.мм).

export type EventType =
  | 'applied'
  | 'status:new'
  | 'status:contacted'
  | 'status:invited'
  | 'status:hired'
  | 'status:rejected'
  | 'shift_scheduled'
  | 'shift_confirmed'
  | 'shift_declined';

type Client = Prisma.TransactionClient | typeof db;

export async function recordEvents(client: Client, applicationIds: number[], type: EventType, at = new Date()) {
  if (applicationIds.length === 0) return;
  await client.applicationEvent.createMany({
    data: applicationIds.map((applicationId) => ({ applicationId, type, createdAt: at })),
  });
}

// Первый просмотр работодателем. Повторные просмотры время не меняют.
export async function markViewed(applicationIds: number[], at = new Date()) {
  if (applicationIds.length === 0) return;
  await db.application.updateMany({ where: { id: { in: applicationIds }, viewedAt: null }, data: { viewedAt: at } });
}

export type StepKey = 'applied' | 'viewed' | 'contacted' | 'invited' | 'shift_confirmed' | 'hired';
export type StepState = 'done' | 'current' | 'upcoming' | 'skipped';
export type OutcomeKey = 'hired' | 'rejected' | 'vacancy_closed';

export interface TimelineStep {
  key: StepKey;
  emoji: string;
  label: string;
  hint: string;
  state: StepState;
  // Когда этап пройден; null — ещё не пройден или пропущен.
  reachedAt: Date | null;
}

export interface Timeline {
  current: StepKey;
  outcome: { key: OutcomeKey; emoji: string; label: string; reachedAt: Date | null } | null;
  steps: TimelineStep[];
}

const STEPS: { key: StepKey; emoji: string; label: string; hint: string }[] = [
  { key: 'applied', emoji: '📨', label: 'Отклик отправлен', hint: 'Работодатель получил ваш контакт' },
  { key: 'viewed', emoji: '👀', label: 'Работодатель посмотрел', hint: 'Отклик открыт в кабинете работодателя' },
  { key: 'contacted', emoji: '📞', label: 'На связи', hint: 'Работодатель связался с вами' },
  { key: 'invited', emoji: '✉️', label: 'Приглашение', hint: 'Вас пригласили на работу или собеседование' },
  { key: 'shift_confirmed', emoji: '✅', label: 'Выход подтверждён', hint: 'Вы подтвердили, что выйдете на смену' },
  { key: 'hired', emoji: '🎉', label: 'Нанят', hint: 'Вас приняли на работу' },
];

const OUTCOMES: Record<OutcomeKey, { emoji: string; label: string }> = {
  hired: { emoji: '🎉', label: 'Вас приняли на работу' },
  rejected: { emoji: '❌', label: 'Работодатель выбрал другого кандидата' },
  vacancy_closed: { emoji: '🔒', label: 'Набор на вакансию закрыт' },
};

export interface TimelineInput {
  status: string;
  attendance: string | null;
  createdAt: Date;
  viewedAt: Date | null;
  hiredAt: Date | null;
  vacancyStatus: string;
  vacancyClosedAt: Date | null;
}

function first(events: { type: string; createdAt: Date }[], type: string): Date | null {
  return events.find((e) => e.type === type)?.createdAt ?? null;
}

function last(events: { type: string; createdAt: Date }[], type: string): Date | null {
  return events.filter((e) => e.type === type).at(-1)?.createdAt ?? null;
}

// Текущий этап — по текущему статусу отклика: если работодатель вернул кандидата на этап назад,
// дорожная карта тоже откатывается, а не показывает устаревший прогресс.
function currentStep(input: TimelineInput, viewed: boolean): StepKey {
  switch (input.status) {
    case 'hired':
      return 'hired';
    case 'invited':
      return input.attendance === 'confirmed' ? 'shift_confirmed' : 'invited';
    case 'contacted':
      return 'contacted';
    case 'rejected':
      return viewed ? 'viewed' : 'applied';
    default:
      return viewed ? 'viewed' : 'applied';
  }
}

// events — события одного отклика по возрастанию времени.
export function buildTimeline(input: TimelineInput, events: { type: string; createdAt: Date }[]): Timeline {
  const firstStatusChange = events.find((e) => e.type.startsWith('status:') && e.type !== 'status:new')?.createdAt ?? null;
  const viewedAt = [input.viewedAt, firstStatusChange].filter((d): d is Date => d !== null).sort((a, b) => +a - +b)[0] ?? null;

  const reached: Record<StepKey, Date | null> = {
    applied: first(events, 'applied') ?? input.createdAt,
    viewed: viewedAt,
    contacted: first(events, 'status:contacted'),
    invited: first(events, 'status:invited'),
    shift_confirmed: input.attendance === 'confirmed' ? last(events, 'shift_confirmed') : null,
    hired: first(events, 'status:hired') ?? input.hiredAt,
  };

  const current = currentStep(input, viewedAt !== null);
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  const steps = STEPS.map((step, i): TimelineStep => {
    if (i > currentIndex) return { ...step, state: 'upcoming', reachedAt: null };
    const at = reached[step.key];
    if (i === currentIndex) return { ...step, state: 'current', reachedAt: at };
    return at ? { ...step, state: 'done', reachedAt: at } : { ...step, state: 'skipped', reachedAt: null };
  });

  let outcome: Timeline['outcome'] = null;
  if (input.status === 'hired') {
    outcome = { key: 'hired', ...OUTCOMES.hired, reachedAt: reached.hired };
    steps[currentIndex].state = 'done';
  } else if (input.status === 'rejected') {
    outcome = { key: 'rejected', ...OUTCOMES.rejected, reachedAt: last(events, 'status:rejected') };
  } else if (input.vacancyStatus === 'closed') {
    outcome = { key: 'vacancy_closed', ...OUTCOMES.vacancy_closed, reachedAt: input.vacancyClosedAt };
  }
  return { current, outcome, steps };
}

const TIMELINE_SELECT = Prisma.validator<Prisma.ApplicationSelect>()({
  id: true,
  status: true,
  attendance: true,
  createdAt: true,
  viewedAt: true,
  hiredAt: true,
  vacancy: { select: { status: true, closedAt: true } },
  events: { select: { type: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
});

// Один запрос на всю страницу откликов.
export async function loadTimelines(applicationIds: number[]): Promise<Map<number, Timeline>> {
  if (applicationIds.length === 0) return new Map();
  const rows = await db.application.findMany({ where: { id: { in: applicationIds } }, select: TIMELINE_SELECT });
  return new Map(
    rows.map((r) => [
      r.id,
      buildTimeline(
        {
          status: r.status,
          attendance: r.attendance,
          createdAt: r.createdAt,
          viewedAt: r.viewedAt,
          hiredAt: r.hiredAt,
          vacancyStatus: r.vacancy.status,
          vacancyClosedAt: r.vacancy.closedAt,
        },
        r.events
      ),
    ])
  );
}
