# Информационная система управления заявками на ремонт и техническое обслуживание оборудования

Учебный сквозной проект по дисциплине «Промышленные ИТ-системы: от идеи до эксплуатации».

Система предназначена для регистрации, обработки и контроля заявок на ремонт и техническое обслуживание производственного оборудования. Она помогает назначать исполнителей, отслеживать сроки и результаты работ, сохранять историю обслуживания и снижать риск потери информации.

Этот репозиторий — **Architecture Dossier** проекта и единый источник актуальной информации (Single Source of Truth, SSOT) о системе на протяжении её lifecycle.

## Команда

| Участник | Роль в текущем модуле |
|---|---|
| Amir Gabdullin | Архитектор платформы, доступа и исходящих интеграций |
| Martin | Архитектор приложений и интеграций (заявка, АРМ, ACL оборудования) |
| Andrey | Архитектор домена диспетчеризации |

Роли — рабочее назначение для [таблицы владения](docs/05-domain-architecture.md) занятия 5 и могут ротироваться.

## Структура репозитория

- `docs/01-system-charter.md` — System Charter v0.1;
- `docs/02-capability-value-stream.md` — Capability Map, As-is VSM, потери, паспорт способности и KPI;
- `docs/03-experience-pack.md` — Experience Pack v0.1: User Journey, Service Blueprint, точки отказа, требования-кандидаты;
- `docs/04-requirements.md` — реестр и формализация FR/NFR;
- `docs/04-prototype.md` — спецификация и статус реализации интерактивного прототипа;
- `docs/04-prototype-testing.md` — учебная UX-симуляция и шаблон фактического тестирования;
- `docs/04-technical-spike.md` — карточка и фактические результаты минимального эксперимента потери связи;
<<<<<<< HEAD
- `docs/05-domain-architecture.md` — Event Storming, карта контекстов, C4 и таблица владения (занятие 5);
- `docs/adr/` — ADR-001…003: стиль, СУБД, доставка событий;
- `prototype/` — рабочий интерактивный HTML-прототип, автоматические браузерные тесты и стенд Technical Spike;
- `docs/diagrams/` — VSM, Service Blueprint, C4 (Structurizr DSL, PlantUML, SVG), Event Storming и карта контекстов;
- `openapi/`, `asyncapi/` — спецификации интеграционных контрактов модуля 2;
=======
- `docs/06-data-architecture.md` — комплект недели 6: модель данных, владение, MDM, OLTP/OLAP, DQ и lineage;
- `docs/data/` — детальные артефакты модели, CRUD/MDM, Data Quality и Data Lineage;
- `docs/07-integration-architecture.md` — комплект недели 7: контракты, Saga, Outbox и идемпотентность;
- `docs/07-contract-versioning.md` — политика версий, compatibility и воспроизводимые проверки контрактов;
- `docs/07-ml-nlp-assessment.md` — оценка NLP-кандидата, Human-in-the-Loop и решение go/no-go;
- `prototype/` — рабочий интерактивный HTML-прототип, автоматические браузерные тесты и стенд Technical Spike;
- `docs/diagrams/` — Service Blueprint, C2-контуры, lineage и sequence diagram саги;
- `docs/adr/` — ADR доставки данных в аналитику и стиля саги;
- `openapi/`, `asyncapi/` — версионированные синхронные и событийные контракты;
- `scripts/validate_contracts.py` — офлайн-проверка структуры и проектных инвариантов контрактов;
>>>>>>> b50e425 (complete 6 and 7 weeks)
- `mkdocs.yml` — конфигурация сборки документации по принципу Docs-as-Code.

## Запуск прототипа

```bash
cd prototype
python3 -m http.server 4173
```

После запуска открыть <http://127.0.0.1:4173>. Полная инструкция, тестовые роли и команды проверок находятся в `prototype/README.md`.

## Проверка контрактов недель 6–7

```bash
python3 scripts/validate_contracts.py
```

Полные стандартные линтеры и политика совместимости приведены в `docs/07-contract-versioning.md`.
