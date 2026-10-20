import { Prisma, type PartnerChannel } from '@prisma/client';
import { db } from '../db.js';
import { maxApi, type InlineButton } from '../max/client.js';
import { findOrCreateUserByMaxId } from '../users/service.js';
import { buildApplyDeepLink, buildVacancyCardText } from '../vacancies/cardText.js';
import { regionDto, type RegionDto } from '../regions/service.js';

export interface PartnerChannelDto {
  id: number;
  title: string | null;
  isChannel: boolean;
  active: boolean;
  region: RegionDto | null;
  studentOnly: boolean;
  removed: boolean;
  createdAt: Date;
}

function toDto(c: PartnerChannel): PartnerChannelDto {
  return {
    id: c.id,
    title: c.title,
    isChannel: c.isChannel,
    active: c.active && !c.removedAt,
    region: regionDto(c.regionSubject),
    studentOnly: c.studentOnly,
    removed: c.removedAt !== null,
    createdAt: c.createdAt,
  };
}

async function fetchTitle(chatId: string): Promise<string | null> {
  try {
    const chat = (await maxApi.getChat(chatId)) as { title?: string | null } | undefined;
    return chat?.title ?? null;
  } catch {
    return null;
  }
}

// bot_added: бота добавили в чат или канал. Тот, кто добавил, становится владельцем канала-партнёра.
// Публикация не включается сама — владелец включает её в мини-приложении.
export async function handleBotAdded(chatId: string, user: { id: string; name?: string }, isChannel: boolean) {
  const owner = await findOrCreateUserByMaxId(user.id, user.name);
  const title = await fetchTitle(chatId);
  await db.partnerChannel.upsert({
    where: { chatId },
    update: { ownerUserId: owner.id, isChannel, removedAt: null, ...(title ? { title } : {}) },
    create: { chatId, ownerUserId: owner.id, isChannel, title },
  });
  if (owner.dialogChatId) {
    const where = title ? `«${title}»` : isChannel ? 'канал' : 'чат';
    await maxApi
      .sendMessage(
        owner.dialogChatId,
        `Бот добавлен в ${where}. Чтобы туда автоматически публиковались подходящие вакансии, ` +
          'включите публикацию и выберите регион в мини-приложении «Сезон» → «Каналы».'
      )
      .catch((err) => console.error('failed to notify channel owner', chatId, err));
  }
}

export async function isPartnerChat(chatId: string): Promise<boolean> {
  return (await db.partnerChannel.count({ where: { chatId, removedAt: null } })) > 0;
}

export async function handleBotRemoved(chatId: string) {
  await db.partnerChannel.updateMany({ where: { chatId, removedAt: null }, data: { removedAt: new Date() } });
}

export async function listChannels(ownerUserId: number) {
  const items = await db.partnerChannel.findMany({ where: { ownerUserId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  return { items: items.map(toDto) };
}

export async function updateChannel(
  ownerUserId: number,
  id: number,
  patch: { active?: boolean; regionSubject?: string | null; studentOnly?: boolean }
): Promise<PartnerChannelDto | 'not_found' | 'removed'> {
  const channel = await db.partnerChannel.findFirst({ where: { id, ownerUserId } });
  if (!channel) return 'not_found';
  if (channel.removedAt && patch.active) return 'removed';
  const updated = await db.partnerChannel.update({ where: { id }, data: patch });
  return toDto(updated);
}

// В канале нажатие callback-кнопки пришло бы с chat_id канала, и бот ответил бы прямо туда,
// поэтому кнопка — ссылка: она открывает личный чат с ботом.
function channelButtons(url: string | null): InlineButton[][] | undefined {
  return url ? [[{ type: 'link', text: 'Откликнуться', url }]] : undefined;
}

export async function notifyPartnerChannels(vacancyId: number): Promise<number> {
  const vacancy = await db.vacancy.findUnique({ where: { id: vacancyId } });
  if (!vacancy || vacancy.status !== 'published') return 0;

  const channels = await db.partnerChannel.findMany({
    where: {
      active: true,
      removedAt: null,
      OR: [{ regionSubject: null }, { regionSubject: vacancy.regionSubject ?? '__none__' }],
      ...(vacancy.studentFriendly ? {} : { studentOnly: false }),
    },
  });
  const url = buildApplyDeepLink(vacancy.id, undefined, 'ch');
  const text = buildVacancyCardText(vacancy, url);

  let sent = 0;
  for (const channel of channels) {
    try {
      await db.channelDelivery.create({ data: { vacancyId, channelId: channel.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
      throw err;
    }
    try {
      await maxApi.sendMessage(channel.chatId, text, channelButtons(url));
      sent += 1;
    } catch (err) {
      console.error('failed to post vacancy to partner channel', vacancyId, channel.id, err);
    }
  }
  return sent;
}
