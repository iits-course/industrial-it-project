# Версионирование и проверка контрактов v1.0

## 1. Contract-first workflow

1. Поставщик меняет YAML-контракт и changelog в одном pull request.
2. Автоматические проверки разбирают YAML, проверяют стандарт и проектные инварианты.
3. Consumers проверяют примеры, ошибки, timeout/retry и совместимость.
4. Для breaking change публикуется новый major, старый работает параллельно в период миграции.
5. Реализация поставщика и consumer проходят contract tests до выпуска.

Контракты являются источником истины для интеграции; сгенерированный код и документация — производные артефакты.

## 2. Нумерация версий

Используется SemVer `MAJOR.MINOR.PATCH` в `info.version`.

- `MAJOR` — несовместимая схема/семантика;
- `MINOR` — обратно совместимое добавление;
- `PATCH` — уточнение документации/примеров без изменения wire contract.

Major дублируется в адресе: REST `/v1/...`, routing key `repair.request-created.v1`. Minor/patch не добавляются в URL или routing key.

## 3. Классификация изменений

| Изменение | Совместимость | Действие |
|---|---|---|
| добавить необязательное поле response/event | совместимо для tolerant reader | minor; consumer игнорирует неизвестное поле |
| добавить endpoint, operation или новый event channel | совместимо | minor и запись в changelog |
| расширить enum | условно совместимо | только если consumers имеют `unknown`/fallback; иначе новый major |
| добавить новый необязательный request field | совместимо | minor; default/отсутствие имеет прежний смысл |
| сделать поле обязательным | breaking | новый major |
| удалить или переименовать поле | breaking | новое поле в новом major, период сосуществования |
| изменить тип, формат, единицы или смысл | breaking | новое поле/major; старое не переопределять |
| ужесточить validation, уменьшить timeout/limit | breaking для части клиентов | новый major либо согласованная миграция |
| добавить новый 4xx исход | потенциально breaking | minor только если единый формат ошибок уже обрабатывается; иначе major |

## 4. Жизненный цикл версии

`draft → active → deprecated → retired`.

- Новые major-версии работают параллельно минимум **90 дней** или до миграции всех зарегистрированных consumers — что наступит позже. Срок является проектной гипотезой.
- Deprecated-контракт не получает новых функций, но получает исправления безопасности и критические fixes.
- Владелец публикует дату retirement, список consumers и migration guide.
- Удаление допускается только после нулевого трафика старой версии в течение 14 дней и письменного подтверждения владельцев consumers.

## 5. Автоматические проверки

Репозиторный валидатор:

```bash
python3 scripts/validate_contracts.py
```

Он выполняет офлайн-проверки, специфичные для проекта:

- YAML разбирается без дубликатов ключей;
- OpenAPI имеет версию 3.0.x, уникальные `operationId`, `/vMAJOR` и разрешимые локальные `$ref`;
- изменяющие операции с `x-idempotent: true` требуют `Idempotency-Key`;
- у операций есть `x-timeout-ms`, успешный ответ и документированные ошибки;
- AsyncAPI имеет версию 3.x; major routing key совпадает с `info.version`;
- у каждого события есть envelope: `event_id`, тип/версия, `occurred_at`, `correlation_id`, aggregate ID/version, producer и data;
- события декларируют at-least-once, ordering key и deduplication key;
- примеры payload проверяются по JSON Schema Draft 2020-12 с учётом локальных `$ref`.

Дополнительные стандартные линтеры для CI:

```bash
npx --yes @redocly/cli lint openapi/*.yaml
npx --yes @asyncapi/cli validate asyncapi/*.yaml
```

Проектный скрипт не заменяет полные стандартные линтеры; он даёт быстрый воспроизводимый gate и проверяет правила курса, которых может не быть в стандартной схеме.

## 6. Contract tests

| Слой | Проверка |
|---|---|
| Provider OpenAPI | каждый example валиден; фактический response соответствует schema; обязательные 409/422/429/503 покрыты |
| Consumer OpenAPI | mock по контракту; timeout; повтор тем же ключом; неизвестное необязательное поле не ломает parsing |
| Provider AsyncAPI | сообщение сериализуется по schema; channel и event version совпадают; ПДн не появляется в payload |
| Consumer AsyncAPI | дубликат `event_id` не даёт второго эффекта; out-of-order version уходит в retry/DLQ; неизвестное поле игнорируется |
| Compatibility | baseline active-версии сравнивается с PR; breaking change требует нового major |

Рекомендуемый CI-порядок: parse/project rules → standard lint → compatibility diff → provider/consumer tests → публикация документации. В текущем репозитории backend и CI отсутствуют, поэтому реализован только локальный gate и выполнены доступные линтеры.

## 7. Peer review checklist

- Нет ли breaking change без нового major?
- Что произойдёт при повторе REST-команды и повторной доставке события?
- Что произойдёт при ответе через 15 секунд?
- Нет ли цикла синхронных вызовов?
- Минимальны ли payload и нет ли ФИО/телефона/свободного текста?
- Все ли ошибки машиночитаемы и имеют понятный следующий шаг?
- У события есть `event_id`, время факта, aggregate key/version и correlation ID?
- Названы ли владелец, SLO свежести, retention и путь миграции?

Фактическое кросс-командное ревью невозможно провести автономно без соседней команды и pull request. Вместо вымышленного результата подготовлен этот checklist; внешний review остаётся организационным действием перед бордом.

## 8. Changelog v1

| Контракт | Версия | Статус | Изменение |
|---|---|---|---|
| Repair Request API | 1.0.0 | active design | первоначальный contract-first draft |
| Workforce Reservation API | 1.0.0 | active design | резерв, проверка неизвестного исхода, компенсация |
| Repair Request Domain Events | 1.0.0 | active design | Created, Assigned, Completed v1 |

`active design` означает готовность контракта к реализации и review, а не наличие работающего production endpoint.
