// Демо-данные для витрины «Сезона». Все компании и люди вымышленные; совпадения случайны.
// Суммы — рубли в месяц (как во всём продукте); оплата за смену указана в описании.

export const EMPLOYERS = [
  { key: 'south', name: 'Агрокомплекс «Южный»' },
  { key: 'breeze', name: 'Отель «Морской бриз»' },
  { key: 'alpine', name: 'Ресторан «Альпийский»' },
  { key: 'pines', name: 'База отдыха «Сосновый берег»' },
  { key: 'honey', name: 'КФХ «Медовый луг»' },
  { key: 'gull', name: 'Кафе «Чайка»' },
  { key: 'valley', name: 'Винодельня «Солнечная долина»' },
  { key: 'firs', name: 'Ёлочный базар «Зимняя сказка»' },
  { key: 'greenhouse', name: 'Тепличный комбинат «Зелёный дом»' },
  { key: 'camp', name: 'Детский лагерь «Звёздный»' },
];

export const CANDIDATES = [
  'Анна Котова', 'Илья Смирнов', 'Мария Белова', 'Дмитрий Орлов', 'Алина Захарова', 'Тимур Гафаров',
  'Ольга Ершова', 'Кирилл Новиков', 'Екатерина Лисина', 'Артём Мельников', 'София Ким', 'Руслан Абдуллаев',
  'Полина Миронова', 'Георгий Чхеидзе', 'Вера Соколова', 'Никита Фролов', 'Дарья Павлова', 'Максим Егоров',
];

// ageDays — сколько дней назад опубликована; status по умолчанию published.
export const VACANCIES = [
  // Агрокомплекс «Южный» — в том числе прошлый сезон, на котором собрана «бригада» и галочка.
  {
    key: 'south_cherry_2025', employer: 'south', status: 'closed', ageDays: 370,
    title: 'Сборщик черешни — сезон 2025', region: 'Краснодарский край, Динской район', category: 'Сельское хозяйство',
    schedule: 'seasonal', salaryMin: 70000, salaryMax: 95000, headcount: 8,
    description: 'Сбор черешни в садах. Работа с 6:00 до 14:00, оплата раз в две недели.',
    contact: '@demo_yuzhny_agro', badges: ['housing_free', 'meals_3', 'pay_twice_month'],
  },
  {
    key: 'south_harvest', employer: 'south', ageDays: 1,
    title: 'Сборщик урожая / Рабочий сада', region: 'Краснодарский край, Динской район', category: 'Сельское хозяйство',
    schedule: 'seasonal', salaryMin: 85000, salaryMax: 120000, headcount: 10,
    description: 'Сбор черешни и абрикосов, сортировка в ящики. Смена 8 часов, перерыв на обед. Официальный договор, выплаты дважды в месяц.',
    contact: '@demo_yuzhny_agro', badges: ['housing_free', 'meals_3', 'tickets_paid'], studentFriendly: true,
  },
  {
    key: 'south_sorter', employer: 'south', ageDays: 3,
    title: 'Сортировщик фруктов', region: 'Краснодарский край', category: 'Сельское хозяйство',
    schedule: 'seasonal', salaryMin: 60000, salaryMax: 75000, headcount: 6,
    description: 'Сортировка и калибровка фруктов на линии под навесом. Обучение на месте.',
    contact: '@demo_yuzhny_agro', badges: ['training', 'meals_2', 'shuttle'],
  },
  {
    key: 'south_tractor', employer: 'south', ageDays: 6,
    title: 'Тракторист-машинист', region: 'Краснодарский край', category: 'Сельское хозяйство',
    schedule: 'seasonal', salaryMin: 110000, salaryMax: 140000, headcount: 2,
    description: 'Работа на МТЗ-82 в садах: междурядная обработка, перевозка урожая. Нужны права категории D.',
    contact: '@demo_yuzhny_agro', badges: ['housing_provided', 'official_contract', 'overtime_paid'],
  },
  // Отель «Морской бриз»
  {
    key: 'breeze_barista', employer: 'breeze', ageDays: 2,
    title: 'Старший бариста курорта', region: 'Сочи, Приморье', category: 'Гостиницы и туризм',
    schedule: 'seasonal', salaryMin: 63000, salaryMax: 80000, headcount: 4,
    description: 'Кофейня у бассейна отеля. Оплата 4 200 ₽ за смену плюс чаевые. Опыт работы с эспрессо-машиной от полугода.',
    contact: '@demo_morskoy_briz_hr', badges: ['housing_provided', 'tips', 'bar', 'by_sea'],
  },
  {
    key: 'breeze_maid', employer: 'breeze', ageDays: 4,
    title: 'Горничная', region: 'Сочи, Адлер', category: 'Гостиницы и туризм',
    schedule: 'seasonal', salaryMin: 55000, salaryMax: 65000, headcount: 6,
    description: 'Уборка номеров по стандартам отеля, 15 номеров в смену. Спецодежда и питание.',
    contact: '@demo_morskoy_briz_hr', badges: ['housing_free', 'meals_3', 'workwear', 'by_sea'],
  },
  {
    key: 'breeze_animator', employer: 'breeze', ageDays: 5,
    title: 'Аниматор детского клуба', region: 'Сочи', category: 'Гостиницы и туризм',
    schedule: 'seasonal', salaryMin: 50000, salaryMax: 60000, headcount: 3,
    description: 'Игры и мастер-классы для детей 4–12 лет, вечерние шоу. Подойдёт студентам педагогических и творческих вузов.',
    contact: '@demo_morskoy_briz_hr', badges: ['housing_free', 'no_experience', 'by_sea'], studentFriendly: true,
  },
  {
    key: 'breeze_reception', employer: 'breeze', ageDays: 9,
    title: 'Администратор ресепшн', region: 'Сочи', category: 'Гостиницы и туризм',
    schedule: 'temporary', salaryMin: 70000, salaryMax: 85000, headcount: 1,
    description: 'Заселение гостей, работа в системе бронирования. Английский на разговорном уровне.',
    contact: '@demo_morskoy_briz_hr', badges: ['official_contract', 'shifts', 'training'],
  },
  // Ресторан «Альпийский»
  {
    key: 'alpine_chef', employer: 'alpine', ageDays: 2,
    title: 'Шеф-повар горячего цеха', region: 'Красная Поляна, Сочи', category: 'Общепит',
    schedule: 'seasonal', salaryMin: 95000, salaryMax: 95000, headcount: 1,
    description: 'Ресторан на 80 посадок, европейская и кавказская кухня. Опыт от 3 лет, санитарная книжка.',
    contact: '@demo_alpiyskiy', badges: ['housing_provided', 'meals_3', 'kitchen', 'mountains'],
  },
  {
    key: 'alpine_waiter', employer: 'alpine', ageDays: 7,
    title: 'Официант', region: 'Красная Поляна, Сочи', category: 'Общепит',
    schedule: 'seasonal', salaryMin: 55000, salaryMax: 90000, headcount: 5,
    description: 'Оклад плюс процент от чека. Горнолыжный сезон с декабря по апрель.',
    contact: '@demo_alpiyskiy', badges: ['tips', 'meals_2', 'mountains'], studentFriendly: true,
  },
  {
    key: 'alpine_dishwasher', employer: 'alpine', ageDays: 11, status: 'closed',
    title: 'Мойщик посуды', region: 'Красная Поляна, Сочи', category: 'Общепит',
    schedule: 'temporary', salaryMin: 45000, salaryMax: 50000, headcount: 2,
    description: 'Работа на посудомоечной машине, поддержание чистоты на кухне.',
    contact: '@demo_alpiyskiy', badges: ['meals_3', 'pay_weekly', 'no_experience'],
  },
  // База отдыха «Сосновый берег»
  {
    key: 'pines_sup', employer: 'pines', ageDays: 3,
    title: 'Инструктор по сапбордингу', region: 'Республика Карелия, Сортавала', category: 'Гостиницы и туризм',
    schedule: 'seasonal', salaryMin: 60000, salaryMax: 80000, headcount: 2,
    description: 'Прокат и групповые прогулки на сапах по Ладоге. Нужен сертификат инструктора или опыт.',
    contact: '@demo_sosnovy_bereg', badges: ['housing_free', 'meals_3', 'outdoor', 'whole_season'],
  },
  {
    key: 'pines_cook', employer: 'pines', ageDays: 8,
    title: 'Повар-универсал', region: 'Карелия', category: 'Гостиницы и туризм',
    schedule: 'seasonal', salaryMin: 75000, salaryMax: 90000, headcount: 1,
    description: 'Завтраки и ужины для гостей базы до 40 человек, заготовки.',
    contact: '@demo_sosnovy_bereg', badges: ['housing_free', 'kitchen', 'countryside'],
  },
  {
    key: 'pines_handyman', employer: 'pines', ageDays: 12,
    title: 'Разнорабочий', region: 'Карелия', category: 'Гостиницы и туризм',
    schedule: 'temporary', salaryMin: 50000, salaryMax: 60000, headcount: 3,
    description: 'Мелкий ремонт домиков, уход за территорией, колка дров.',
    contact: '@demo_sosnovy_bereg', badges: ['housing_free', 'pay_daily', 'tools'],
  },
  // КФХ «Медовый луг»
  {
    key: 'honey_beekeeper', employer: 'honey', ageDays: 5,
    title: 'Помощник пасечника', region: 'Алтайский край, Бийск', category: 'Сельское хозяйство',
    schedule: 'seasonal', salaryMin: 45000, salaryMax: 60000, headcount: 2,
    description: 'Осмотр ульев, откачка мёда, фасовка. Аллергия на укусы пчёл — противопоказание.',
    contact: '@demo_medovy_lug', badges: ['housing_free', 'meals_3', 'training', 'countryside'],
  },
  {
    key: 'honey_seabuckthorn', employer: 'honey', ageDays: 10,
    title: 'Сборщик облепихи', region: 'Алтайский край', category: 'Сельское хозяйство',
    schedule: 'seasonal', salaryMin: 40000, salaryMax: 70000, headcount: 12,
    description: 'Сдельная оплата за килограмм, лучшие сборщики получают от 3 500 ₽ в день.',
    contact: '@demo_medovy_lug', badges: ['piecework', 'housing_free', 'field_garden'], studentFriendly: true,
  },
  // Кафе «Чайка»
  {
    key: 'gull_barista', employer: 'gull', ageDays: 1,
    title: 'Бариста на набережной', region: 'Крым, Ялта', category: 'Общепит',
    schedule: 'seasonal', salaryMin: 50000, salaryMax: 65000, headcount: 2,
    description: 'Кофе с собой и десерты, поток туристов в сезон. Научим готовить кофе.',
    contact: '@demo_chaika_yalta', badges: ['tips', 'no_experience', 'by_sea'], studentFriendly: true,
  },
  {
    key: 'gull_cashier', employer: 'gull', ageDays: 6,
    title: 'Кассир', region: 'Ялта', category: 'Общепит',
    schedule: 'temporary', salaryMin: 40000, salaryMax: 48000, headcount: 1,
    description: 'Работа на кассе в дневную смену, график 2/2.',
    contact: '@demo_chaika_yalta', badges: ['shifts', 'staff_discount', 'pay_twice_month'],
  },
  // Винодельня «Солнечная долина»
  {
    key: 'valley_grapes', employer: 'valley', ageDays: 2,
    title: 'Сборщик винограда', region: 'Севастополь, Балаклавская долина', category: 'Сельское хозяйство',
    schedule: 'seasonal', salaryMin: 65000, salaryMax: 90000, headcount: 20,
    description: 'Ручной сбор винограда с конца августа по октябрь. Развозка от остановок города.',
    contact: '@demo_solnechnaya_dolina', badges: ['shuttle', 'meals_2', 'field_garden'], studentFriendly: true,
  },
  {
    key: 'valley_cellar', employer: 'valley', ageDays: 14,
    title: 'Рабочий винного цеха', region: 'Севастополь', category: 'Производство',
    schedule: 'seasonal', salaryMin: 70000, salaryMax: 85000, headcount: 3,
    description: 'Приёмка винограда, мойка ёмкостей, работа с прессом.',
    contact: '@demo_solnechnaya_dolina', badges: ['official_contract', 'workwear', 'shuttle'],
  },
  // Ёлочный базар
  {
    key: 'firs_seller', employer: 'firs', ageDays: 4,
    title: 'Продавец ёлок', region: 'Москва', category: 'Торговля',
    schedule: 'temporary', salaryMin: 60000, salaryMax: 90000, headcount: 8,
    description: 'Продажа живых ёлок с 10 по 31 декабря, работа на улице, тёплая спецодежда выдаётся.',
    contact: '@demo_zimnyaya_skazka', badges: ['pay_daily', 'workwear', 'outdoor'], studentFriendly: true,
  },
  {
    key: 'firs_loader', employer: 'firs', ageDays: 8,
    title: 'Грузчик склада', region: 'Подмосковье, Химки', category: 'Склад и логистика',
    schedule: 'temporary', salaryMin: 55000, salaryMax: 70000, headcount: 4,
    description: 'Разгрузка фур с ёлками и игрушками, ночные смены по графику.',
    contact: '@demo_zimnyaya_skazka', badges: ['night_shifts', 'pay_weekly', 'warehouse'],
  },
  // Тепличный комбинат «Зелёный дом»
  {
    key: 'greenhouse_grower', employer: 'greenhouse', ageDays: 6,
    title: 'Овощевод в теплице', region: 'Республика Татарстан, Казань', category: 'Сельское хозяйство',
    schedule: 'permanent', salaryMin: 50000, salaryMax: 65000, headcount: 10,
    description: 'Подвязка, прищипка и сбор томатов и огурцов в круглогодичных теплицах.',
    contact: '@demo_zeleny_dom', badges: ['official_contract', 'shuttle', 'lunch', 'pensioners_ok'],
  },
  {
    key: 'greenhouse_picker', employer: 'greenhouse', ageDays: 13,
    title: 'Сборщик томатов', region: 'Казань', category: 'Сельское хозяйство',
    schedule: 'temporary', salaryMin: 45000, salaryMax: 55000, headcount: 6,
    description: 'Подработка на сборе урожая, можно на неполный день.',
    contact: '@demo_zeleny_dom', badges: ['part_time', 'pay_weekly', 'no_experience'], studentFriendly: true,
  },
  // Детский лагерь «Звёздный»
  {
    key: 'camp_counselor', employer: 'camp', ageDays: 3,
    title: 'Вожатый', region: 'Ленинградская область, Зеленогорск', category: 'Детский отдых',
    schedule: 'seasonal', salaryMin: 40000, salaryMax: 55000, headcount: 15,
    description: 'Работа с отрядом детей 9–14 лет, три смены за лето. Засчитываем как практику.',
    contact: '@demo_camp_zvezdny', badges: ['housing_free', 'meals_3', 'training'], studentFriendly: true,
  },
  {
    key: 'camp_nurse', employer: 'camp', ageDays: 9,
    title: 'Медицинская сестра лагеря', region: 'Ленобласть', category: 'Детский отдых',
    schedule: 'seasonal', salaryMin: 70000, salaryMax: 80000, headcount: 1,
    description: 'Медпункт лагеря на 300 детей, нужен действующий сертификат.',
    contact: '@demo_camp_zvezdny', badges: ['housing_free', 'meals_3', 'official_contract', 'countryside'],
  },
];

// Отклики: stage — до какого этапа дошёл кандидат (см. seed-showcase.mjs, applyStages).
// Прошлый сезон «Южного» — шесть подтверждённых наймов: из них «Моя бригада» и галочка.
export const APPLICATIONS = [
  ...[0, 1, 2, 3, 4, 5].map((c) => ({ vacancy: 'south_cherry_2025', candidate: c, stage: 'hired', daysAgo: 368 - c, source: c % 2 ? 'link' : 'qr' })),
  { vacancy: 'south_cherry_2025', candidate: 6, stage: 'rejected', daysAgo: 366, source: 'card' },
  { vacancy: 'south_harvest', candidate: 0, stage: 'invited', daysAgo: 1, source: 'team' },
  { vacancy: 'south_harvest', candidate: 1, stage: 'shift_confirmed', daysAgo: 1, source: 'team' },
  { vacancy: 'south_harvest', candidate: 7, stage: 'new', daysAgo: 0.2, source: 'qr' },
  { vacancy: 'south_harvest', candidate: 8, stage: 'viewed', daysAgo: 0.6, source: 'subscription' },
  { vacancy: 'south_harvest', candidate: 9, stage: 'contacted', daysAgo: 0.8, source: 'channel' },
  { vacancy: 'south_sorter', candidate: 10, stage: 'new', daysAgo: 1.5, source: 'miniapp' },
  { vacancy: 'south_sorter', candidate: 11, stage: 'invited', daysAgo: 2.5, source: 'link' },
  { vacancy: 'breeze_barista', candidate: 12, stage: 'invited', daysAgo: 1.5, source: 'miniapp' },
  { vacancy: 'breeze_barista', candidate: 13, stage: 'shift_confirmed', daysAgo: 1.8, source: 'card' },
  { vacancy: 'breeze_barista', candidate: 14, stage: 'hired', daysAgo: 2, source: 'link' },
  { vacancy: 'breeze_maid', candidate: 15, stage: 'contacted', daysAgo: 3, source: 'qr' },
  { vacancy: 'breeze_animator', candidate: 16, stage: 'new', daysAgo: 0.5, source: 'channel' },
  { vacancy: 'alpine_chef', candidate: 17, stage: 'viewed', daysAgo: 1, source: 'miniapp' },
  { vacancy: 'alpine_waiter', candidate: 2, stage: 'rejected', daysAgo: 5, source: 'subscription' },
  { vacancy: 'alpine_dishwasher', candidate: 3, stage: 'hired', daysAgo: 10, source: 'card' },
  { vacancy: 'gull_barista', candidate: 4, stage: 'new', daysAgo: 0.3, source: 'qr' },
  { vacancy: 'valley_grapes', candidate: 5, stage: 'invited', daysAgo: 1.2, source: 'channel' },
  { vacancy: 'valley_grapes', candidate: 10, stage: 'new', daysAgo: 0.4, source: 'subscription' },
  { vacancy: 'camp_counselor', candidate: 16, stage: 'contacted', daysAgo: 2, source: 'channel' },
  { vacancy: 'camp_counselor', candidate: 12, stage: 'new', daysAgo: 1, source: 'miniapp' },
  { vacancy: 'honey_seabuckthorn', candidate: 11, stage: 'viewed', daysAgo: 6, source: 'link' },
  { vacancy: 'firs_seller', candidate: 14, stage: 'new', daysAgo: 2, source: 'qr' },
];

// Отклики владельца (--owner-max-id) как работника — для «Моих откликов» и дорожных карт.
export const OWNER_APPLICATIONS = [
  { vacancy: 'breeze_barista', stage: 'invited', daysAgo: 1.2, source: 'miniapp' },
  { vacancy: 'valley_grapes', stage: 'viewed', daysAgo: 0.9, source: 'subscription' },
  { vacancy: 'alpine_waiter', stage: 'rejected', daysAgo: 4, source: 'miniapp' },
  { vacancy: 'camp_counselor', stage: 'new', daysAgo: 0.2, source: 'channel' },
];
