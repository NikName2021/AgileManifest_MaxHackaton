# Helm: frontend и backend

Этот chart разворачивает два компонента приложения Agile Manifest:

- **frontend** — Nginx со сборкой React, порт контейнера `80`, одна реплика;
- **backend** — Fastify/Node.js, порт контейнера `3000`, одна реплика.

PostgreSQL должен быть доступен заранее. Chart не создаёт базу, учётные данные,
Ingress или TLS-сертификат. Внешний доступ настраивается в уже существующем Ingress.

## Что исправлено относительно заготовки

1. Манифесты из `manifesets/` перенесены в `templates/`. Helm обрабатывает шаблоны
   именно в `templates/`; прежняя папка не участвовала в установке.
2. Удалены стандартные Deployment и Service для одного Nginx. Вместо них теперь
   отдельные ресурсы для frontend и backend.
3. Backend переведён с `8000` на реальный порт приложения `3000`.
4. Удалены настройки другого приложения: `scheduler-config`, `ALLOWED_HOSTS`,
   `CORS_ORIGINS`, `MAX_UPLOAD_BYTES`, `RUN_MIGRATIONS`, PVC `uploads` и проверки
   `/health/live`, `/health/ready`. В текущем backend таких проверок нет;
   миграции уже выполняет команда запуска Docker-образа.
5. Образы, реплики, настройки приложения и привязка к узлам вынесены в values.
   Текущие пути в values: `agile-manifest-project/backend` и
   `agile-manifest-project/frontend`.
   Наличие образов в реестре при подготовке chart не проверялось.
6. Убрано жёсткое `namespace: app`: namespace определяется параметром Helm
   `--namespace`. Все ресурсы одного релиза устанавливаются вместе.
7. Удалены шаблоны Ingress и HTTPRoute и их настройки в values:
   публикация приложения выполняется через существующий Ingress отдельно от chart.

## Как проходит запрос

```text
Браузер / MAX
    |
    v
Существующий Ingress
    |
    v
Service frontend -> Pod Nginx :80
                       |
                       +-- /                 -> файлы React / index.html
                       +-- /api/*            -> Service backend -> Fastify :3000
                       +-- /webhook/max      -> Service backend -> Fastify :3000
                       +-- /health           -> Service backend -> Fastify :3000
                                                                       |
                                                                       v
                                                                   PostgreSQL
```

Путь API сохраняется: `/api/jobs` попадёт в backend как `/api/jobs`.
Для страниц SPA используется `try_files ... /index.html`, поэтому прямое открытие
вложенной страницы не должно приводить к Nginx 404.

## Файлы и их назначение

| Файл | Что создаёт или настраивает |
| --- | --- |
| `Chart.yaml` | Имя и версия chart. Версия chart отделена от тегов Docker-образов. |
| `values.yaml` | Значения по умолчанию для обоих компонентов. |
| `templates/_helpers.tpl` | Общие правила имён, меток и путей образов. |
| `templates/backend-deployment.yaml` | Pod backend, переменные окружения, ресурсы и проверки. |
| `templates/backend-service.yaml` | Постоянный сетевой адрес backend внутри namespace. |
| `templates/backend-configmap.yaml` | Несекретные переменные backend. |
| `templates/frontend-deployment.yaml` | Pod frontend и подключение конфигурации Nginx. |
| `templates/frontend-service.yaml` | Постоянный сетевой адрес frontend. |
| `templates/frontend-configmap.yaml` | Раздача SPA и проксирование запросов в backend. |
| `templates/tests/test-connection.yaml` | Два проверочных Pod для команды `helm test`. |

### Deployment, Service и метки

Deployment описывает желаемое количество Pod, образ контейнера и его настройки.
Service даёт этим Pod постоянное имя, даже когда они пересоздаются и меняют IP.

Service выбирает Pod по трём меткам: имя chart, имя релиза и компонент.
Поэтому frontend и backend не смешиваются между собой, а два релиза в одном
namespace выбирают каждый свои Pod.

При релизе `agile` имена по умолчанию — `agile-helm-frontend` и
`agile-helm-backend`. При необходимости их можно задать через
`frontend.fullnameOverride` и `backend.fullnameOverride`.
Nginx использует те же helpers, поэтому его ссылка на backend обновится вместе
с именем. Во внешнем Ingress имя frontend Service нужно менять отдельно.
Переименование существующего Service требует осторожности: старый адрес
перестанет работать.

`service.port` — порт Service. `targetPort: http` ссылается на именованный порт
контейнера: `80` у frontend и `3000` у backend. Например, можно выставить
`backend.service.port: 8080`: Nginx будет обращаться к Service на `8080`, а тот
по-прежнему отправит запрос контейнеру на `3000`. Переменная `PORT=3000` в
Deployment согласована с портом контейнера и проверками.

### ConfigMap и Secret

`backend.config` попадает в ConfigMap. Здесь размещены `PUBLIC_BASE_URL`,
`FRONTEND_ORIGIN`, адрес MAX API, часовой пояс и прочие несекретные настройки.
Значения приводятся к строкам, как требуется переменным окружения.

`backend.existingSecret` указывает на уже созданный Secret **в том же namespace**.
Он должен содержать как минимум:

- `DATABASE_URL` — строку подключения к существующему PostgreSQL;
- `MAX_BOT_TOKEN` — токен бота.

Дополнительно можно передать `SESSION_SECRET`, `MAX_WEBHOOK_SECRET`,
`TEST_API_TOKEN`, `MAX_BOT_USERNAME`. Chart не содержит реальные секреты.

ConfigMap подключается первым, Secret — вторым, поэтому при совпадении ключей
значение из Secret имеет приоритет. Явный `PORT` имеет приоритет над обоими.

При изменении ConfigMap меняется аннотация `checksum/...` в шаблоне Pod;
Deployment запускает Pod с новой конфигурацией. Это нужно и для Nginx, поскольку
файл смонтирован через `subPath`. Обновление внешнего Secret само по себе Pod
не пересоздаёт: после такого изменения выполните перезапуск backend.

### Проверки состояния

- **Backend startupProbe**: ждёт открытия TCP-порта до примерно пяти минут.
  Это даёт время на миграции Prisma и начальные обращения к MAX API.
- **Backend readinessProbe**: вызывает `/health`, который выполняет `SELECT 1`
  в PostgreSQL. При недоступной БД Pod исключается из готовых адресов Service.
- **Backend livenessProbe**: проверяет TCP-порт. Потеря БД сама по себе не должна
  перезапускать процесс. TCP-проверка слабее отдельного HTTP liveness endpoint:
  она подтверждает доступность порта, но не всех обработчиков приложения.
- **Frontend readiness/liveness**: запрашивают `/`, проверяя раздачу страницы.
  Готовность frontend не зависит от доступности backend.

Пока startupProbe не пройдена, liveness и readiness backend не выполняются.

### Реплики и обновления

Frontend по текущим values имеет одну реплику. Backend — одну, потому что внутри него запускаются
фоновые напоминания без координации между экземплярами. Chart отклоняет
`backend.replicaCount`, отличный от `1`, чтобы не включить параллельную обработку
случайно. Для масштабирования сначала нужно согласовать фоновые задачи.

Для backend выбрана стратегия `Recreate`: старый Pod останавливается перед
запуском нового. Это сокращает риск одновременной работы фоновых задач при
обычном обновлении Deployment, но означает паузу в работе API во время обновления.
Такая настройка не заменяет распределённую блокировку или leader election.

Привязка обоих компонентов к узлу
`test-schedule-semenov-02.hpc-client-003.local` сохранена из исходных манифестов.
Даже при увеличении числа реплик frontend привязка к одному узлу не защищает от его отказа.
Для другого кластера замените hostname либо задайте обоим компонентам
`nodeSelector: {}`. При использовании дополнительного файла values для удаления
унаследованного ключа задайте `nodeSelector: null`.

`resources.requests` учитываются при размещении Pod, `limits` ограничивают
потребление ресурсов. Например, `250m` CPU — четверть ядра, `256Mi` — 256 MiB RAM.
Превышение лимита памяти может привести к завершению контейнера.
Исходные значения сохранены; под нагрузкой их стоит подобрать по метрикам.

## Подготовка к установке

Дальнейшие команды выполняются из папки `helm/`.

1. Проверьте доступность PostgreSQL из кластера. В `DATABASE_URL` нельзя использовать
   `localhost`, если БД находится вне Pod backend. Используйте доступное DNS-имя
   или адрес БД, а также настоящие учётные данные.
2. Убедитесь, что в реестре есть образы для обоих компонентов. Значение
   `global.registry` взято из прежних манифестов; замените его при необходимости.
3. Подготовьте namespace и Secret. Например, если защищённый файл окружения уже
   существует и содержит ключи `DATABASE_URL`, `MAX_BOT_TOKEN` и другие секреты:

   ```sh
   kubectl create namespace app
   kubectl -n app create secret generic agile-manifest-secrets \
     --from-env-file=/absolute/path/backend.env
   ```

   Если namespace или Secret уже есть, повторно создавать их не нужно.
   При другом имени Secret задайте `backend.existingSecret`.
4. Для приватного реестра создайте registry Secret `my-private-registry`
   в namespace `app` своим обычным способом либо укажите существующий в
   `imagePullSecrets`. Для публичного реестра используйте пустой список `[]`.
5. Проверьте `nodeSelector`, теги образов, публичный адрес и правила существующего Ingress.

`PUBLIC_BASE_URL` должен содержать внешний HTTPS-адрес без завершающего `/`,
например `https://app.example.com`. Backend добавит `/webhook/max` при регистрации
вебхука. `FRONTEND_ORIGIN` задаёт разрешённые origin для CORS; без него текущий
backend разрешает любой origin.

### Подключение к существующему Ingress

Chart не создаёт Ingress и HTTPRoute. Добавьте в существующий Ingress правило
для домена приложения. Например, при имени Helm-релиза `agile` и стандартных
values следующий элемент добавляется в `spec.rules` существующего Ingress:

```yaml
- host: app.example.com # замените на реальный домен приложения
  http:
    paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: agile-helm-frontend
            port:
              number: 80
```

Существующий Ingress должен находиться в **том же namespace, что frontend Service**.
Устанавливайте приложение с `--namespace`, соответствующим namespace этого Ingress.
Наличие Ingress-контроллера в другом namespace допустимо: здесь речь об объекте
Ingress с правилами, а не о Pod контроллера.

Для другого имени релиза или `frontend.fullnameOverride` укажите фактическое имя
Service из вывода `helm template`; порт соответствует `frontend.service.port`.
В примерах установки ниже используется namespace `app` — замените его, если нужно.

Весь трафик приложения направляется во frontend. Nginx сам передаёт `/api/*`,
`/webhook/max` и `/health` в backend, поэтому отдельные правила для backend не нужны.
Пример предполагает отдельный hostname и публикацию приложения от корня `/`.
Публикация в подпапке вроде `/agile` потребует дополнительной настройки React и Nginx.
Не применяйте к этому правилу переписывание путей: backend ожидает исходные `/api/...`.
Проверьте аннотации существующего Ingress, особенно если для другого приложения
уже настроен rewrite.

Домен должен указывать на адрес вашего Ingress-контроллера, а TLS-настройки
существующего Ingress и сертификат должны охватывать домен приложения.

Если собранный frontend содержит непустой `VITE_API_BASE_URL`, он будет использовать
этот адрес вместо относительных `/api/...`. Переменные Vite встраиваются при
сборке: изменить их только окружением контейнера Nginx нельзя. Конфигурация chart
рассчитана на относительный API, как в примере окружения проекта.

## Проверка и установка

Проверка и просмотр результата без изменения кластера:

```sh
helm lint . --strict
helm template agile . --namespace app
```

Установка или обновление с закреплёнными тегами образов:

```sh
helm upgrade --install agile . \
  --namespace app --create-namespace \
  --set-string backend.image.tag=REPLACE_WITH_BACKEND_TAG \
  --set-string frontend.image.tag=REPLACE_WITH_FRONTEND_TAG \
  --wait --timeout 10m
```

Замените оба значения `REPLACE_WITH_...` существующими тегами, например SHA коммитов.
Вместо `--set` можно отредактировать `values.yaml` или передать дополнительный файл
через `-f`. В defaults сохранён `latest` с `pullPolicy: Always`; для воспроизводимых
обновлений предпочтительны фиксированные теги. Новый образ под тем же тегом
`latest` сам по себе не меняет шаблон Deployment и не запускает обновление Pod.

Проверка работающего релиза:

```sh
kubectl -n app get deployments,pods,services
helm test agile --namespace app --logs
```

Один тест обращается непосредственно к backend `/health`, второй — к `/health`
через frontend, проверяя связку Nginx → backend → БД. Тестовые Pod удаляются после
успеха; неуспешные остаются для диагностики. Тесты требуют доступности указанного
в `tests.image` образа BusyBox; их можно отключить через `tests.enabled: false`.

Для локальной проверки без Ingress:

```sh
kubectl -n app port-forward service/agile-helm-frontend 8080:80
```

Откройте `http://localhost:8080`, а для проверки БД — `http://localhost:8080/health`.
Такой доступ не публикует вебхук в интернете.

После изменения внешнего Secret:

```sh
kubectl -n app rollout restart deployment/agile-helm-backend
kubectl -n app rollout status deployment/agile-helm-backend
```

Имена в примерах соответствуют defaults и релизу `agile`; при overrides используйте
свои. Удаление релиза: `helm uninstall agile --namespace app`. Внешние БД и Secrets
chart не создаёт и при удалении релиза не удаляет.

## Официальная документация

- [Структура Helm chart и templates](https://helm.sh/docs/chart_template_guide/getting_started/)
- [Startup, readiness и liveness probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [ConfigMap](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Ingress и маршрутизация к Service](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
