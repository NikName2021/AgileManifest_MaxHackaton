import type { BadgeCatalog } from '../features/badges/api'

// Development-only snapshot of the public catalog; live sessions always use /api/badges.
export const previewBadgeCatalog: BadgeCatalog = {
  groups: [
    {
      key: 'housing',
      label: 'Жильё и быт',
      emoji: '🏠',
      items: [
        {
          key: 'housing_free',
          emoji: '🏠',
          label: 'Жильё бесплатно',
        },
        {
          key: 'housing_provided',
          emoji: '🏡',
          label: 'Жильё предоставляется',
        },
        {
          key: 'hostel',
          emoji: '🛏️',
          label: 'Общежитие',
        },
        {
          key: 'housing_help',
          emoji: '🔑',
          label: 'Помощь с жильём',
        },
        {
          key: 'wifi',
          emoji: '📶',
          label: 'Wi-Fi в жилье',
        },
        {
          key: 'laundry',
          emoji: '🧺',
          label: 'Прачечная',
        },
      ],
    },
    {
      key: 'food',
      label: 'Питание',
      emoji: '🍲',
      items: [
        {
          key: 'meals_3',
          emoji: '🍲',
          label: '3-разовое питание',
        },
        {
          key: 'meals_2',
          emoji: '🥪',
          label: '2-разовое питание',
        },
        {
          key: 'lunch',
          emoji: '🍱',
          label: 'Обед за счёт работодателя',
        },
        {
          key: 'staff_discount',
          emoji: '☕',
          label: 'Скидка на еду и напитки',
        },
      ],
    },
    {
      key: 'travel',
      label: 'Дорога',
      emoji: '🚌',
      items: [
        {
          key: 'tickets_paid',
          emoji: '🎫',
          label: 'Билеты оплатят',
        },
        {
          key: 'travel_compensation',
          emoji: '✈️',
          label: 'Проезд компенсируют',
        },
        {
          key: 'shuttle',
          emoji: '🚌',
          label: 'Развозка',
        },
        {
          key: 'fuel_compensation',
          emoji: '⛽',
          label: 'Компенсация бензина',
        },
      ],
    },
    {
      key: 'pay',
      label: 'Оплата',
      emoji: '💵',
      items: [
        {
          key: 'pay_daily',
          emoji: '💵',
          label: 'Ежедневные выплаты',
        },
        {
          key: 'pay_weekly',
          emoji: '📅',
          label: 'Выплаты раз в неделю',
        },
        {
          key: 'pay_twice_month',
          emoji: '💳',
          label: 'Выплаты дважды в месяц',
        },
        {
          key: 'piecework',
          emoji: '⚖️',
          label: 'Сдельная оплата',
        },
        {
          key: 'bonus',
          emoji: '🎁',
          label: 'Премии',
        },
        {
          key: 'tips',
          emoji: '🪙',
          label: 'Чаевые',
        },
        {
          key: 'overtime_paid',
          emoji: '⏱️',
          label: 'Переработки оплачиваются',
        },
      ],
    },
    {
      key: 'terms',
      label: 'Условия работы',
      emoji: '📄',
      items: [
        {
          key: 'official_contract',
          emoji: '📄',
          label: 'Официальный договор',
        },
        {
          key: 'self_employed_ok',
          emoji: '🧾',
          label: 'Можно самозанятым',
        },
        {
          key: 'workwear',
          emoji: '🦺',
          label: 'Спецодежда выдаётся',
        },
        {
          key: 'tools',
          emoji: '🧰',
          label: 'Инструмент выдаётся',
        },
        {
          key: 'training',
          emoji: '📚',
          label: 'Обучение на месте',
        },
        {
          key: 'medbook_help',
          emoji: '🩺',
          label: 'Помощь с медкнижкой',
        },
        {
          key: 'insurance',
          emoji: '🛡️',
          label: 'Страховка',
        },
      ],
    },
    {
      key: 'audience',
      label: 'Кому подходит',
      emoji: '🎓',
      items: [
        {
          key: 'students_ok',
          emoji: '🎓',
          label: 'Подходит студентам',
        },
        {
          key: 'no_experience',
          emoji: '🌱',
          label: 'Без опыта',
        },
        {
          key: 'pensioners_ok',
          emoji: '👵',
          label: 'Пенсионерам',
        },
        {
          key: 'from_16',
          emoji: '🧒',
          label: 'С 16 лет',
        },
        {
          key: 'couples_ok',
          emoji: '👫',
          label: 'Можно парой',
        },
        {
          key: 'accessible',
          emoji: '♿',
          label: 'Доступная среда',
        },
      ],
    },
    {
      key: 'schedule',
      label: 'График',
      emoji: '⏰',
      items: [
        {
          key: 'flexible',
          emoji: '⏰',
          label: 'Гибкий график',
        },
        {
          key: 'shifts',
          emoji: '🔁',
          label: 'Сменный график',
        },
        {
          key: 'part_time',
          emoji: '⌛',
          label: 'Неполный день',
        },
        {
          key: 'night_shifts',
          emoji: '🌙',
          label: 'Ночные смены',
        },
        {
          key: 'weekends_off',
          emoji: '🗓️',
          label: 'Выходные свободны',
        },
        {
          key: 'short_gig',
          emoji: '⚡',
          label: 'Короткая подработка',
        },
        {
          key: 'whole_season',
          emoji: '🌞',
          label: 'На весь сезон',
        },
      ],
    },
    {
      key: 'place',
      label: 'Место и сфера',
      emoji: '📍',
      items: [
        {
          key: 'by_sea',
          emoji: '🏖️',
          label: 'У моря',
        },
        {
          key: 'mountains',
          emoji: '⛰️',
          label: 'В горах',
        },
        {
          key: 'countryside',
          emoji: '🌾',
          label: 'За городом',
        },
        {
          key: 'outdoor',
          emoji: '🌤️',
          label: 'На свежем воздухе',
        },
        {
          key: 'field_garden',
          emoji: '🚜',
          label: 'Поле и сад',
        },
        {
          key: 'farm_animals',
          emoji: '🐄',
          label: 'Работа с животными',
        },
        {
          key: 'kitchen',
          emoji: '🍳',
          label: 'Кухня',
        },
        {
          key: 'bar',
          emoji: '🍸',
          label: 'Бар',
        },
        {
          key: 'hotel',
          emoji: '🛎️',
          label: 'Отель',
        },
        {
          key: 'warehouse',
          emoji: '📦',
          label: 'Склад',
        },
      ],
    },
  ],
  maxPerVacancy: 4,
}
