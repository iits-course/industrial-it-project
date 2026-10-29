workspace "РемКонтур" "C4-модель информационной системы управления заявками на ремонт и ТО. Версия 0.1, занятие 5." {

    !identifiers hierarchical

    model {
        operator = person "Оператор оборудования" "Инициатор: регистрирует неисправность и смотрит статус своей заявки."
        master = person "Мастер смены" "Уточняет заявку участка и предлагает повышение приоритета. Окончательный приоритет не утверждает."
        dispatcher = person "Диспетчер / координатор техслужбы" "Утверждает приоритет, назначает исполнителя, закрывает выполненную заявку."
        engineer = person "Инженер техслужбы" "Ведёт диагностику и результат по назначенным заявкам."
        head = person "Руководитель техслужбы" "Контролирует очередь, сроки и историю обслуживания."

        sso = softwareSystem "Корпоративный SSO" "Аутентификация корпоративной учётной записи." {
            tags "External"
        }
        directory = softwareSystem "Справочник сотрудников и подразделений" "Люди, участки, принадлежность к роли." {
            tags "External"
        }
        equipment = softwareSystem "Система учёта оборудования" "Идентификаторы и карточки единиц оборудования." {
            tags "External"
        }
        notifications = softwareSystem "Корпоративный сервис уведомлений" "Доставка сообщений о событиях заявки." {
            tags "External"
        }

        remkontur = softwareSystem "РемКонтур" "Регистрация, диспетчеризация, фиксация результата и история заявок на ремонт и ТО." {
            arm = container "АРМ сотрудника" "Экраны списка, создания и карточки; локальная очередь неподтверждённых операций создания." "SPA/PWA, JavaScript, IndexedDB"
            app = container "Приложение РемКонтур" "Модульный монолит: заявки, диспетчеризация, доступ и аудит, ACL оборудования, запись outbox." "Python, FastAPI"
            worker = container "Обработчик исходящих" "Читает transactional outbox и доставляет уведомления; заявки не изменяет." "Python worker"
            db = container "БД заявок" "Система записи заявок, истории, аудита, ключей идемпотентности и outbox." "PostgreSQL"
        }

        operator -> remkontur "Создаёт заявки и смотрит статус"
        master -> remkontur "Уточняет заявки участка"
        dispatcher -> remkontur "Назначает исполнителя и утверждает приоритет"
        engineer -> remkontur "Фиксирует диагностику и результат"
        head -> remkontur "Просматривает очередь и историю"

        remkontur -> sso "Проверяет сессию пользователя"
        remkontur -> directory "Читает сотрудников, участки и доступность"
        remkontur -> equipment "Читает карточку оборудования"
        remkontur -> notifications "Передаёт события заявки к доставке"
        notifications -> operator "Сообщает об изменении статуса"
        notifications -> engineer "Сообщает о назначении"

        operator -> remkontur.arm "Работает с заявками"
        master -> remkontur.arm "Работает с заявками участка"
        dispatcher -> remkontur.arm "Диспетчеризирует очередь"
        engineer -> remkontur.arm "Ведёт назначенные заявки"
        head -> remkontur.arm "Просматривает очередь и историю"

        remkontur.arm -> remkontur.app "Команды и запросы [HTTPS/JSON, синхронно]"
        remkontur.app -> remkontur.db "Читает и пишет [SQL, синхронно]"
        remkontur.worker -> remkontur.db "Читает outbox и отмечает доставку [SQL, синхронно]"
        remkontur.worker -> notifications "Отправляет уведомление [HTTPS, асинхронно относительно пользователя]"
        remkontur.app -> sso "Проверяет токен [OIDC/HTTPS, синхронно]"
        remkontur.app -> directory "Читает сотрудника и участок [HTTPS/JSON, синхронно]"
        remkontur.app -> equipment "Читает оборудование [HTTPS/JSON, синхронно]"
    }

    views {
        systemContext remkontur "C1-Context" {
            include *
            exclude relationship.tag==Container
            autoLayout lr
            description "Контекстная диаграмма РемКонтур v0.1. Технологий нет. Стрелка — инициатор взаимодействия."
        }

        container remkontur "C2-Containers" {
            include *
            autoLayout lr
            description "Контейнерная диаграмма РемКонтур v0.1. Один писатель агрегата заявки — приложение. Брокера нет (ADR-003)."
        }

        styles {
            element "Person" {
                shape person
                background #084c61
                color #ffffff
            }
            element "Software System" {
                background #177e89
                color #ffffff
            }
            element "External" {
                background #999999
                color #ffffff
            }
            element "Container" {
                background #db3a34
                color #ffffff
            }
        }
    }
}
