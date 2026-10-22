import type { BadgeCatalog } from '../features/badges/api'
// Development-only catalog snapshot. Live sessions use the API.
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
          key: 'apartment',
          emoji: '🏢',
          label: 'Квартира',
        },
        {
          key: 'room_shared',
          emoji: '🛌',
          label: 'Комната на 2–4 человека',
        },
        {
          key: 'housing_near',
          emoji: '🚶',
          label: 'Жильё рядом с работой',
        },
        {
          key: 'housing_help',
          emoji: '🔑',
          label: 'Помощь с жильём',
        },
        {
          key: 'utilities_paid',
          emoji: '💡',
          label: 'Коммуналка оплачена',
        },
        {
          key: 'shower',
          emoji: '🚿',
          label: 'Душ и горячая вода',
        },
        {
          key: 'own_kitchen',
          emoji: '🫕',
          label: 'Кухня в жилье',
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
          key: 'food_compensation',
          emoji: '🧾',
          label: 'Компенсация питания',
        },
        {
          key: 'staff_discount',
          emoji: '☕',
          label: 'Скидка на еду и напитки',
        },
        {
          key: 'free_drinks',
          emoji: '🥤',
          label: 'Чай, кофе и вода бесплатно',
        },
        {
          key: 'harvest_take',
          emoji: '🍒',
          label: 'Урожай можно брать с собой',
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
          key: 'transfer',
          emoji: '🚐',
          label: 'Трансфер от вокзала',
        },
        {
          key: 'shuttle',
          emoji: '🚌',
          label: 'Развозка',
        },
        {
          key: 'taxi_night',
          emoji: '🚕',
          label: 'Такси после ночной смены',
        },
        {
          key: 'fuel_compensation',
          emoji: '⛽',
          label: 'Компенсация бензина',
        },
        {
          key: 'near_transport',
          emoji: '🚇',
          label: 'Рядом с остановкой',
        },
        {
          key: 'parking',
          emoji: '🅿️',
          label: 'Парковка',
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
          key: 'advance',
          emoji: '💸',
          label: 'Авансы',
        },
        {
          key: 'pay_card',
          emoji: '🏦',
          label: 'Оплата на карту',
        },
        {
          key: 'pay_cash',
          emoji: '💴',
          label: 'Оплата наличными',
        },
        {
          key: 'white_salary',
          emoji: '📈',
          label: 'Белая зарплата',
        },
        {
          key: 'pay_on_time',
          emoji: '✅',
          label: 'Зарплата без задержек',
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
          key: 'season_bonus',
          emoji: '🏆',
          label: 'Бонус за весь сезон',
        },
        {
          key: 'referral_bonus',
          emoji: '🤝',
          label: 'Бонус за друга',
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
          key: 'foreigners_ok',
          emoji: '🌍',
          label: 'Можно иностранцам',
        },
        {
          key: 'patent_help',
          emoji: '🗂️',
          label: 'Помощь с патентом',
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
          key: 'mentor',
          emoji: '🧑‍🏫',
          label: 'Наставник',
        },
        {
          key: 'career',
          emoji: '🚀',
          label: 'Карьерный рост',
        },
        {
          key: 'medbook_help',
          emoji: '🩺',
          label: 'Помощь с медкнижкой',
        },
        {
          key: 'medbook_paid',
          emoji: '💉',
          label: 'Медкнижку оплатят',
        },
        {
          key: 'no_medbook',
          emoji: '📋',
          label: 'Медкнижка не нужна',
        },
        {
          key: 'insurance',
          emoji: '🛡️',
          label: 'Страховка',
        },
      ],
    },
    {
      key: 'benefits',
      label: 'Соцпакет и досуг',
      emoji: '🎉',
      items: [
        {
          key: 'dms',
          emoji: '🏥',
          label: 'ДМС',
        },
        {
          key: 'paid_vacation',
          emoji: '🏝️',
          label: 'Оплачиваемый отпуск',
        },
        {
          key: 'sick_leave',
          emoji: '🤒',
          label: 'Больничные оплачиваются',
        },
        {
          key: 'gym',
          emoji: '🏋️',
          label: 'Спортзал',
        },
        {
          key: 'beach_access',
          emoji: '🏊',
          label: 'Бассейн и пляж для персонала',
        },
        {
          key: 'leisure',
          emoji: '🎢',
          label: 'Экскурсии и досуг',
        },
        {
          key: 'team_events',
          emoji: '🎉',
          label: 'Корпоративы',
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
          key: 'from_14',
          emoji: '🧑',
          label: 'С 14 лет',
        },
        {
          key: 'couples_ok',
          emoji: '👫',
          label: 'Можно парой',
        },
        {
          key: 'families_ok',
          emoji: '👨‍👩‍👧',
          label: 'Можно с семьёй',
        },
        {
          key: 'pets_ok',
          emoji: '🐕',
          label: 'Можно с животными',
        },
        {
          key: 'driver_license',
          emoji: '🚗',
          label: 'Нужны права',
        },
        {
          key: 'english',
          emoji: '🇬🇧',
          label: 'Нужен английский',
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
          key: 'five_two',
          emoji: '📆',
          label: 'График 5/2',
        },
        {
          key: 'two_two',
          emoji: '🔂',
          label: 'График 2/2',
        },
        {
          key: 'rotation',
          emoji: '🔄',
          label: 'Вахта',
        },
        {
          key: 'day_shifts',
          emoji: '☀️',
          label: 'Дневные смены',
        },
        {
          key: 'morning_shifts',
          emoji: '🌅',
          label: 'Утренние смены',
        },
        {
          key: 'night_shifts',
          emoji: '🌙',
          label: 'Ночные смены',
        },
        {
          key: 'part_time',
          emoji: '⌛',
          label: 'Неполный день',
        },
        {
          key: 'weekends_off',
          emoji: '🗓️',
          label: 'Выходные свободны',
        },
        {
          key: 'weekend_job',
          emoji: '🎈',
          label: 'Подработка в выходные',
        },
        {
          key: 'short_gig',
          emoji: '⚡',
          label: 'Короткая подработка',
        },
        {
          key: 'start_now',
          emoji: '🏁',
          label: 'Выход сразу',
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
          key: 'ski_resort',
          emoji: '🎿',
          label: 'Горнолыжный курорт',
        },
        {
          key: 'resort',
          emoji: '🌴',
          label: 'Курорт',
        },
        {
          key: 'countryside',
          emoji: '🌾',
          label: 'За городом',
        },
        {
          key: 'forest',
          emoji: '🌲',
          label: 'В лесу',
        },
        {
          key: 'city',
          emoji: '🏙️',
          label: 'В городе',
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
          key: 'vineyard',
          emoji: '🍇',
          label: 'Виноградник',
        },
        {
          key: 'farm_animals',
          emoji: '🐄',
          label: 'Работа с животными',
        },
        {
          key: 'camp',
          emoji: '🏕️',
          label: 'Детский лагерь',
        },
        {
          key: 'festival',
          emoji: '🎪',
          label: 'Фестивали и мероприятия',
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
          key: 'shop',
          emoji: '🛒',
          label: 'Магазин',
        },
        {
          key: 'warehouse',
          emoji: '📦',
          label: 'Склад',
        },
        {
          key: 'construction',
          emoji: '🏗️',
          label: 'Стройка',
        },
      ],
    },
  ],
  maxPerVacancy: 10,
}
