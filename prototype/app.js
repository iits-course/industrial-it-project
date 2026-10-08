import { IdempotentRequestStore, SyncEngine } from "./sync-engine.mjs";

const STORAGE_VERSION = "repair.prototype.seed.v2";
const UI_KEY = "repair.prototype.ui.v2";

const roles = {
  operator: { name: "Эрнест Миронов", short: "ЭМ", label: "Сотрудник цеха", userId: "u-operator" },
  dispatcher: { name: "Никита Орлов", short: "НО", label: "Диспетчер", userId: "u-dispatcher" },
  engineer: { name: "Алексей Воронов", short: "АВ", label: "Инженер-механик", userId: "u-engineer" },
  manager: { name: "Мария Соколова", short: "МС", label: "Руководитель техслужбы", userId: "u-manager" },
};

const equipment = [
  { id: "EQ-017", name: "Токарный станок DMG MORI NLX 2500", area: "Механический цех № 2" },
  { id: "EQ-042", name: "Гидравлический пресс П6324", area: "Прессовый участок" },
  { id: "EQ-108", name: "Насос охлаждающего контура НЦ-80", area: "Линия термообработки" },
  { id: "EQ-205", name: "Конвейер сборочной линии КЛ-7", area: "Сборочный цех № 1" },
  { id: "EQ-311", name: "Компрессор Atlas Copco GA 37", area: "Компрессорная станция" },
];

const areas = [...new Set(equipment.map((item) => item.area))];
const categories = ["Механика", "Электрика", "Гидравлика", "Автоматика", "Другое"];
const specialists = [
  { id: "sp-1", name: "Алексей Воронов", short: "АВ", specialty: "Механика · гидравлика", available: true, workload: "2 заявки в работе" },
  { id: "sp-2", name: "Ирина Белова", short: "ИБ", specialty: "Электрика · автоматика", available: true, workload: "1 заявка в работе" },
  { id: "sp-3", name: "Олег Сафронов", short: "ОС", specialty: "Механика · станки ЧПУ", available: true, workload: "Свободен" },
  { id: "sp-4", name: "Денис Фролов", short: "ДФ", specialty: "Автоматика · КИП", available: false, workload: "Занят до 16:30" },
];

const statusMeta = {
  new: { label: "Новая", className: "status-new" },
  assigned: { label: "Назначена", className: "status-assigned" },
  in_progress: { label: "В работе", className: "status-progress" },
  completed: { label: "Выполнена", className: "status-completed" },
  closed: { label: "Закрыта", className: "status-closed" },
  pending: { label: "Ожидает синхронизации", className: "status-pending" },
};

const priorityMeta = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  critical: "Критический",
};

const icons = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 4.6 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h12a4 4 0 0 0 .7-7.9A7 7 0 0 0 5.4 9.3 5 5 0 0 0 6 19Z"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L5 16a2.1 2.1 0 0 0 3 3l7.3-7.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3Z"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v13H4zM4 13h4l2 3h4l2-3h4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
};

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const engine = new SyncEngine(localStorage);
const server = new IdempotentRequestStore(localStorage, {
  idFactory: (state) => {
    const max = state.requests.reduce((value, item) => {
      const numeric = Number(String(item.id).match(/(\d+)$/)?.[1] || 0);
      return Math.max(value, numeric);
    }, 1042);
    return `REQ-2026-${String(max + 1).padStart(4, "0")}`;
  },
});

let ui = readJSON(UI_KEY, {
  role: "operator",
  online: true,
  noSpecialists: false,
  emptyList: false,
  faultNext: false,
  listLoadError: false,
  filters: { search: "", status: "", priority: "", area: "", assignee: "" },
});

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveUI() {
  localStorage.setItem(UI_KEY, JSON.stringify(ui));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));
}

function iso(date) {
  return new Date(date).toISOString();
}

function seedRequests() {
  const operator = roles.operator;
  return [
    {
      id: "REQ-2026-1042", equipmentId: "EQ-042", equipmentName: "Гидравлический пресс П6324", area: "Прессовый участок",
      description: "При рабочем ходе слышен металлический стук, давление в гидросистеме нестабильно.", category: "Гидравлика", priority: "high", proposedPriority: "high", status: "new", assignee: null,
      createdBy: { id: operator.userId, name: operator.name }, detectedAt: iso("2026-10-08T08:35:00+03:00"), createdAt: iso("2026-10-08T08:42:00+03:00"), updatedAt: iso("2026-10-08T08:42:00+03:00"), diagnosis: "", repairResult: "",
      history: [{ at: iso("2026-10-08T08:42:00+03:00"), actor: operator.name, action: "Заявка зарегистрирована", detail: "Приоритет предложен: высокий" }],
    },
    {
      id: "REQ-2026-1041", equipmentId: "EQ-017", equipmentName: "Токарный станок DMG MORI NLX 2500", area: "Механический цех № 2",
      description: "Периодическая ошибка датчика положения револьверной головки после смены инструмента.", category: "Автоматика", priority: "normal", proposedPriority: "normal", status: "in_progress", assignee: specialists[0],
      createdBy: { id: "u-operator-2", name: "Павел Котов" }, detectedAt: iso("2026-10-08T07:50:00+03:00"), createdAt: iso("2026-10-08T08:03:00+03:00"), updatedAt: iso("2026-10-08T09:12:00+03:00"), diagnosis: "Проверяется разъём датчика положения.", repairResult: "",
      history: [
        { at: iso("2026-10-08T09:12:00+03:00"), actor: specialists[0].name, action: "Работа начата", detail: "Статус изменён на «В работе»" },
        { at: iso("2026-10-08T08:20:00+03:00"), actor: roles.dispatcher.name, action: "Назначен исполнитель", detail: specialists[0].name },
        { at: iso("2026-10-08T08:03:00+03:00"), actor: "Павел Котов", action: "Заявка зарегистрирована", detail: "Обычный приоритет" },
      ],
    },
    {
      id: "REQ-2026-1040", equipmentId: "EQ-108", equipmentName: "Насос охлаждающего контура НЦ-80", area: "Линия термообработки",
      description: "Резкое падение расхода охлаждающей жидкости. Линия остановлена до устранения причины.", category: "Механика", priority: "critical", proposedPriority: "critical", status: "assigned", assignee: specialists[2],
      createdBy: { id: "u-operator-3", name: "Сергей Астахов" }, detectedAt: iso("2026-10-08T06:38:00+03:00"), createdAt: iso("2026-10-08T06:43:00+03:00"), updatedAt: iso("2026-10-08T07:02:00+03:00"), diagnosis: "", repairResult: "",
      history: [
        { at: iso("2026-10-08T07:02:00+03:00"), actor: roles.dispatcher.name, action: "Назначен исполнитель", detail: specialists[2].name },
        { at: iso("2026-10-08T06:43:00+03:00"), actor: "Сергей Астахов", action: "Заявка зарегистрирована", detail: "Критический приоритет" },
      ],
    },
    {
      id: "REQ-2026-1039", equipmentId: "EQ-205", equipmentName: "Конвейер сборочной линии КЛ-7", area: "Сборочный цех № 1",
      description: "Проскальзывание приводного ремня на запуске конвейера.", category: "Механика", priority: "low", proposedPriority: "low", status: "closed", assignee: specialists[0],
      createdBy: { id: operator.userId, name: operator.name }, detectedAt: iso("2026-10-07T13:15:00+03:00"), createdAt: iso("2026-10-07T13:24:00+03:00"), updatedAt: iso("2026-10-07T16:40:00+03:00"), diagnosis: "Ослаблено натяжение приводного ремня.", repairResult: "Натяжение отрегулировано, выполнен пробный запуск без замечаний.",
      history: [
        { at: iso("2026-10-07T16:40:00+03:00"), actor: roles.dispatcher.name, action: "Заявка закрыта", detail: "Результат ремонта подтверждён" },
        { at: iso("2026-10-07T16:25:00+03:00"), actor: specialists[0].name, action: "Ремонт завершён", detail: "Натяжение ремня отрегулировано" },
        { at: iso("2026-10-07T13:24:00+03:00"), actor: operator.name, action: "Заявка зарегистрирована", detail: "Низкий приоритет" },
      ],
    },
    {
      id: "REQ-2026-1038", equipmentId: "EQ-311", equipmentName: "Компрессор Atlas Copco GA 37", area: "Компрессорная станция",
      description: "Повышенная температура масла после двух часов непрерывной работы.", category: "Механика", priority: "normal", proposedPriority: "normal", status: "completed", assignee: specialists[2],
      createdBy: { id: "u-operator-4", name: "Антон Жуков" }, detectedAt: iso("2026-10-07T10:05:00+03:00"), createdAt: iso("2026-10-07T10:11:00+03:00"), updatedAt: iso("2026-10-07T14:50:00+03:00"), diagnosis: "Загрязнён масляный радиатор.", repairResult: "Радиатор очищен, температура после часового прогона в пределах нормы.",
      history: [
        { at: iso("2026-10-07T14:50:00+03:00"), actor: specialists[2].name, action: "Ремонт завершён", detail: "Ожидает закрытия диспетчером" },
        { at: iso("2026-10-07T10:11:00+03:00"), actor: "Антон Жуков", action: "Заявка зарегистрирована", detail: "Обычный приоритет" },
      ],
    },
  ];
}

function ensureSeed() {
  if (localStorage.getItem(STORAGE_VERSION)) return;
  server.write({ requests: seedRequests(), operations: {} });
  localStorage.setItem(STORAGE_VERSION, "1");
  engine.writeQueue([]);
}

function resetDemo() {
  server.write({ requests: seedRequests(), operations: {} });
  engine.writeQueue([]);
  ui = {
    role: "operator", online: true, noSpecialists: false, emptyList: false, faultNext: false, listLoadError: false,
    filters: { search: "", status: "", priority: "", area: "", assignee: "" },
  };
  saveUI();
}

function currentUser() {
  return roles[ui.role];
}

function getRequests() {
  return server.read().requests;
}

function updateRequest(id, mutate) {
  const state = server.read();
  const index = state.requests.findIndex((item) => item.id === id);
  if (index < 0) return null;
  mutate(state.requests[index]);
  state.requests[index].updatedAt = new Date().toISOString();
  server.write(state);
  return state.requests[index];
}

function fmtDate(value, includeTime = true) {
  const date = new Date(value);
  const options = { day: "2-digit", month: "short", year: "numeric", ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}) };
  return new Intl.DateTimeFormat("ru-RU", options).format(date).replace(" г.", "");
}

function statusBadge(status) {
  const meta = statusMeta[status] || statusMeta.new;
  return `<span class="badge ${meta.className}">${meta.label}</span>`;
}

function priorityBadge(priority) {
  return `<span class="priority priority-${priority}">${priorityMeta[priority] || priority}</span>`;
}

function initials(name = "") {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function toast(title, message, type = "success", timeout = 4800) {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = `
    <div class="toast-icon">${type === "error" ? icons.alert : type === "warning" ? icons.cloud : icons.check}</div>
    <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>
    <button type="button" aria-label="Закрыть уведомление">${icons.x}</button>`;
  node.querySelector("button").addEventListener("click", () => node.remove());
  toastRegion.append(node);
  window.setTimeout(() => node.remove(), timeout);
}

function routeInfo() {
  const raw = (location.hash || "#/requests").slice(1);
  const [path, queryString = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { path, parts, query: new URLSearchParams(queryString) };
}

function setActiveNav() {
  const { path, query } = routeInfo();
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.remove("active"));
  const key = path === "/requests/new" ? "new" : query.get("mine") === "1" ? "mine" : "requests";
  document.querySelector(`[data-nav="${key}"]`)?.classList.add("active");
}

function syncChrome() {
  const user = currentUser();
  document.querySelector("#role-select").value = ui.role;
  document.querySelector("#user-name").textContent = user.name;
  document.querySelector("#user-role").textContent = user.label;
  document.querySelector("#user-avatar").textContent = user.short;
  document.querySelector("#network-toggle").checked = ui.online;
  document.querySelector("#specialists-toggle").checked = ui.noSpecialists;
  document.querySelector("#empty-toggle").checked = ui.emptyList;
  document.querySelector("#network-copy").textContent = ui.online ? "Система онлайн" : "Связь отсутствует";

  const queue = engine.readQueue();
  const pill = document.querySelector("#connection-pill");
  pill.classList.toggle("offline", !ui.online);
  pill.querySelector("strong").textContent = ui.online ? "Онлайн" : "Офлайн";
  document.querySelector("#queue-count").textContent = queue.length ? `${queue.length} ${plural(queue.length, "событие", "события", "событий")} в очереди` : "Нет событий в очереди";
  document.querySelector("#nav-request-count").textContent = getRequests().filter((item) => item.status !== "closed").length + queue.length;
  document.querySelector("#nav-create-link").style.display = ui.role === "operator" ? "flex" : "none";
  setActiveNav();
}

function plural(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

function consumeFault() {
  if (!ui.faultNext) return false;
  ui.faultNext = false;
  saveUI();
  return true;
}

async function simulatedSend(operation) {
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  if (consumeFault()) throw new Error("Сервис временно недоступен. Операция сохранена для повтора.");
  return server.accept(operation);
}

async function syncPending({ quiet = false } = {}) {
  const before = engine.readQueue().length;
  if (!ui.online || before === 0) {
    syncChrome();
    return [];
  }
  const results = await engine.sync({ online: ui.online, send: simulatedSend });
  const synced = results.filter((item) => item.state === "synced");
  const failed = results.filter((item) => item.state !== "synced");
  if (!quiet && synced.length) toast("Синхронизация завершена", `${synced.length} ${plural(synced.length, "заявка зарегистрирована", "заявки зарегистрированы", "заявок зарегистрировано")} без дубликатов.`);
  if (failed.length) toast("Синхронизация отложена", failed[0].error || "Повторите после восстановления сервиса.", "warning", 6500);
  syncChrome();
  return results;
}

function renderRoute({ loading = true } = {}) {
  syncChrome();
  if (loading) {
    app.innerHTML = '<div class="page-loader" aria-label="Загрузка"><span></span><span></span><span></span></div>';
  }
  window.setTimeout(() => {
    const { parts } = routeInfo();
    if (parts[0] !== "requests") {
      location.hash = "#/requests";
      return;
    }
    if (parts[1] === "new") renderCreate();
    else if (parts.length === 3 && parts[2] === "assign") renderAssign(parts[1]);
    else if (parts[1]) renderDetail(parts[1]);
    else renderList();
    syncChrome();
    app.focus({ preventScroll: true });
  }, loading ? 150 : 0);
}

function pageHead({ title, description, breadcrumbs = [], actions = "" }) {
  const crumbs = breadcrumbs.length ? `<div class="breadcrumbs">${breadcrumbs.map((item, index) => `${item.href ? `<a href="${item.href}">${escapeHtml(item.label)}</a>` : `<span>${escapeHtml(item.label)}</span>`}${index < breadcrumbs.length - 1 ? `<span>›</span>` : ""}`).join("")}</div>` : "";
  return `<div class="page-head"><div>${crumbs}<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><div class="page-actions">${actions}</div></div>`;
}

function pendingRows() {
  return engine.readQueue().map((item) => ({
    ...item.payload,
    id: `LOCAL-${item.operationId.slice(0, 6).toUpperCase()}`,
    status: "pending",
    pending: true,
    operationId: item.operationId,
    createdAt: item.createdAt,
  }));
}

function renderList() {
  if (ui.listLoadError) {
    app.innerHTML = `<section class="page">${pageHead({ title: "Заявки", description: "Единая очередь ремонтных работ и текущее состояние оборудования." })}<div class="card error-state"><div class="state-icon">${icons.alert}</div><h2>Не удалось загрузить заявки</h2><p>Сервис вернул временную ошибку. Фильтры сохранены — попробуйте ещё раз.</p><button class="button button-primary" id="retry-list">${icons.refresh} Повторить</button></div></section>`;
    document.querySelector("#retry-list").addEventListener("click", () => { ui.listLoadError = false; ui.faultNext = false; saveUI(); renderRoute(); });
    return;
  }

  const { query } = routeInfo();
  const mine = query.get("mine") === "1";
  const all = ui.emptyList ? [] : [...pendingRows(), ...getRequests()];
  const user = currentUser();
  const filtered = all.filter((item) => {
    if (mine && item.createdBy?.id !== user.userId && item.assignee?.name !== user.name) return false;
    const needle = ui.filters.search.toLowerCase().trim();
    if (needle && !`${item.id} ${item.equipmentName} ${item.description}`.toLowerCase().includes(needle)) return false;
    if (ui.filters.status && item.status !== ui.filters.status) return false;
    if (ui.filters.priority && item.priority !== ui.filters.priority) return false;
    if (ui.filters.area && item.area !== ui.filters.area) return false;
    if (ui.filters.assignee === "assigned" && !item.assignee) return false;
    if (ui.filters.assignee === "unassigned" && item.assignee) return false;
    return true;
  });

  const requests = getRequests();
  const stats = {
    active: requests.filter((item) => !["closed", "completed"].includes(item.status)).length,
    new: requests.filter((item) => item.status === "new").length,
    critical: requests.filter((item) => item.priority === "critical" && item.status !== "closed").length,
    completed: requests.filter((item) => item.status === "completed").length,
  };
  const createAction = ui.role === "operator" ? `<a href="#/requests/new" class="button button-primary">${icons.plus} Создать заявку</a>` : "";
  const queue = engine.readQueue();
  app.innerHTML = `<section class="page">
    ${pageHead({ title: mine ? "Мои заявки" : "Заявки", description: mine ? "Заявки, созданные вами или назначенные вам в текущей тестовой роли." : "Единая очередь ремонтных работ и текущее состояние оборудования.", actions: createAction })}
    ${queue.length ? `<div class="sync-banner"><div>${icons.cloud}<p><strong>${queue.length} ${plural(queue.length, "операция ожидает", "операции ожидают", "операций ожидают")} синхронизации</strong><span>${ui.online ? "Синхронизация выполняется автоматически" : "Включите соединение — повтор будет безопасным"}</span></p></div>${ui.online ? `<button class="button button-secondary" id="sync-now">${icons.refresh} Синхронизировать</button>` : ""}</div>` : ""}
    <div class="stats">
      ${statCard(icons.list, stats.active, "Активных заявок")}
      ${statCard(icons.clock, stats.new, "Ожидают назначения", "amber")}
      ${statCard(icons.alert, stats.critical, "Критический приоритет", "red")}
      ${statCard(icons.check, stats.completed, "Ожидают закрытия", "green")}
    </div>
    <div class="card filter-card">
      <div class="filters">
        <div class="field"><label for="filter-search">Поиск</label><div class="search-control">${icons.search}<input class="control" id="filter-search" value="${escapeHtml(ui.filters.search)}" placeholder="ID, оборудование или описание"></div></div>
        ${selectField("filter-status", "Статус", [["", "Все статусы"], ...Object.entries(statusMeta).filter(([key]) => key !== "pending").map(([key, value]) => [key, value.label])], ui.filters.status)}
        ${selectField("filter-priority", "Приоритет", [["", "Все приоритеты"], ...Object.entries(priorityMeta)], ui.filters.priority)}
        ${selectField("filter-area", "Участок", [["", "Все участки"], ...areas.map((area) => [area, area])], ui.filters.area)}
        ${selectField("filter-assignee", "Исполнитель", [["", "Все"], ["assigned", "Назначен"], ["unassigned", "Не назначен"]], ui.filters.assignee)}
        <button class="button button-secondary filter-reset" id="reset-filters" type="button">Сбросить</button>
      </div>
      <div class="filter-summary"><span class="filter-dot"></span><span>Показано <strong>${filtered.length}</strong> из ${all.length}; фильтры применяются сразу</span></div>
    </div>
    <div class="card table-card">
      <div class="table-toolbar"><strong>Реестр заявок</strong><span>Обновлено: только что</span></div>
      ${renderRequestTable(filtered)}
    </div>
  </section>`;

  document.querySelector("#sync-now")?.addEventListener("click", async () => { await syncPending(); renderRoute({ loading: false }); });
  ["search", "status", "priority", "area", "assignee"].forEach((name) => {
    const element = document.querySelector(`#filter-${name}`);
    element?.addEventListener(name === "search" ? "input" : "change", () => {
      ui.filters[name] = element.value;
      saveUI();
      renderList();
    });
  });
  document.querySelector("#reset-filters")?.addEventListener("click", () => {
    ui.filters = { search: "", status: "", priority: "", area: "", assignee: "" };
    saveUI();
    renderList();
  });
  document.querySelector("#empty-reset")?.addEventListener("click", () => {
    ui.filters = { search: "", status: "", priority: "", area: "", assignee: "" };
    ui.emptyList = false;
    saveUI();
    renderList();
    syncChrome();
  });
  document.querySelectorAll("tr[data-request-id]").forEach((row) => row.addEventListener("click", () => { location.hash = `#/requests/${row.dataset.requestId}`; }));
}

function statCard(icon, value, label, tone = "") {
  return `<div class="stat-card"><div class="stat-icon ${tone}">${icon}</div><div><strong>${value}</strong><small>${label}</small></div></div>`;
}

function selectField(id, label, options, selected = "") {
  return `<div class="field"><label for="${id}">${label}</label><select class="control" id="${id}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></div>`;
}

function renderRequestTable(items) {
  if (!items.length) {
    return `<div class="empty-state"><div class="state-icon">${icons.inbox}</div><h2>Заявки не найдены</h2><p>${ui.emptyList ? "Демо-режим пустого списка включён. Отключите его в боковой панели или создайте новую заявку." : "Измените условия поиска или сбросьте фильтры."}</p>${ui.role === "operator" ? `<a class="button button-primary" href="#/requests/new">${icons.plus} Создать заявку</a>` : `<button class="button button-secondary" id="empty-reset">Сбросить фильтры</button>`}</div>`;
  }
  return `<table class="data-table">
    <thead><tr><th style="width:11%">ID</th><th style="width:24%">Оборудование</th><th style="width:14%">Участок</th><th style="width:10%">Приоритет</th><th style="width:14%">Статус</th><th style="width:15%">Исполнитель</th><th style="width:12%">Создана</th></tr></thead>
    <tbody>${items.map((item) => `<tr ${item.pending ? 'class="pending-row"' : `data-request-id="${escapeHtml(item.id)}"`}>
      <td><span class="request-id">${escapeHtml(item.id)}</span></td>
      <td class="equipment-cell"><strong>${escapeHtml(item.equipmentName)}</strong><span>${escapeHtml(item.description)}</span></td>
      <td class="equipment-cell"><strong>${escapeHtml(item.area)}</strong><span>${escapeHtml(item.category || "—")}</span></td>
      <td>${priorityBadge(item.priority)}</td>
      <td>${statusBadge(item.status)}</td>
      <td>${item.assignee ? `<div class="assignee"><span class="mini-avatar">${initials(item.assignee.name)}</span><span>${escapeHtml(item.assignee.name)}</span></div>` : `<span class="muted">Не назначен</span>`}</td>
      <td class="date-cell"><strong>${fmtDate(item.createdAt, false)}</strong><span>${fmtDate(item.createdAt).split(", ")[1] || ""}</span></td>
    </tr>`).join("")}</tbody></table>`;
}

function renderCreate() {
  if (ui.role !== "operator") {
    renderAccessDenied("Создание заявки доступно роли «Сотрудник цеха».");
    return;
  }
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  app.innerHTML = `<section class="page">
    ${pageHead({ title: "Новая заявка", description: "Зафиксируйте неисправность. Поля со звёздочкой обязательны для регистрации.", breadcrumbs: [{ label: "Заявки", href: "#/requests" }, { label: "Создание" }] })}
    <form id="create-form" novalidate>
      <div class="form-layout">
        <div class="card form-card">
          <div class="section-title"><div><h2>Информация о неисправности</h2><p>Данные попадут в единую очередь технической службы.</p></div><span class="required-note"><b>*</b> обязательное поле</span></div>
          <div id="form-notice"></div>
          <div class="form-grid">
            <div class="field span-2"><label for="equipment">Оборудование <small>*</small></label><select class="control" id="equipment" name="equipment"><option value="">Выберите оборудование</option>${equipment.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.id)}</option>`).join("")}</select><p class="field-error" data-error="equipment"></p></div>
            <div class="field"><label for="area">Производственный участок <small>*</small></label><select class="control" id="area" name="area"><option value="">Выберите участок</option>${areas.map((area) => `<option>${escapeHtml(area)}</option>`).join("")}</select><p class="field-error" data-error="area"></p></div>
            <div class="field"><label for="category">Категория <small>*</small></label><select class="control" id="category" name="category"><option value="">Выберите категорию</option>${categories.map((item) => `<option>${item}</option>`).join("")}</select><p class="field-error" data-error="category"></p></div>
            <div class="field"><label for="priority">Предлагаемый приоритет <small>*</small></label><select class="control" id="priority" name="priority"><option value="normal">Обычный</option><option value="low">Низкий</option><option value="high">Высокий</option><option value="critical">Критический</option></select><p class="helper">Окончательный приоритет подтверждает диспетчер по влиянию на производство.</p><p class="field-error" data-error="priority"></p></div>
            <div class="field"><label for="detectedAt">Дата и время обнаружения <small>*</small></label><input class="control" id="detectedAt" name="detectedAt" type="datetime-local" value="${now}"><p class="field-error" data-error="detectedAt"></p></div>
            <div class="field span-2"><label for="description">Описание неисправности <small>*</small></label><textarea class="control" id="description" name="description" maxlength="600" placeholder="Что произошло, как проявляется неисправность и влияет ли она на работу участка"></textarea><p class="helper">Минимум 10 символов. Не указывайте персональные данные.</p><p class="field-error" data-error="description"></p></div>
          </div>
          <div class="form-actions"><a class="button button-secondary" href="#/requests">Отмена</a><button class="button button-primary" type="submit" id="create-submit">${icons.plus} Создать заявку</button></div>
        </div>
        <aside>
          <div class="card context-card"><h3>Как заполнить быстрее</h3><div class="context-list">
            <div class="context-item"><span class="context-number">1</span><span>Выберите оборудование из справочника — участок подставится автоматически.</span></div>
            <div class="context-item"><span class="context-number">2</span><span>Опишите наблюдаемый симптом, а не предполагаемую причину.</span></div>
            <div class="context-item"><span class="context-number">3</span><span>При отсутствии связи заявка сохранится локально, но не будет считаться зарегистрированной.</span></div>
          </div></div>
          <div class="card context-card"><h3>Статус соединения</h3><div class="notice ${ui.online ? "success" : "warning"}">${ui.online ? icons.check : icons.cloud}<div><strong>${ui.online ? "Связь доступна" : "Офлайн-режим"}</strong><br>${ui.online ? "Заявка будет зарегистрирована сразу." : "Данные попадут в локальную очередь и синхронизируются после восстановления."}</div></div></div>
        </aside>
      </div>
    </form>
  </section>`;

  const equipmentControl = document.querySelector("#equipment");
  equipmentControl.addEventListener("change", () => {
    const item = equipment.find((entry) => entry.id === equipmentControl.value);
    if (item) document.querySelector("#area").value = item.area;
    renderDuplicateNotice(item?.id);
  });
  document.querySelector("#create-form").addEventListener("submit", handleCreate);
}

function renderDuplicateNotice(equipmentId) {
  const target = document.querySelector("#form-notice");
  if (!target) return;
  const matches = getRequests().filter((item) => item.equipmentId === equipmentId && !["closed", "completed"].includes(item.status));
  target.innerHTML = matches.length ? `<div class="notice warning">${icons.alert}<div><strong>Есть открытая заявка по этому оборудованию</strong><div class="duplicate-list">${matches.map((item) => `<a class="duplicate-link" href="#/requests/${item.id}" target="_blank"><span>${item.id} · ${escapeHtml(item.description.slice(0, 54))}${item.description.length > 54 ? "…" : ""}</span><b>Открыть</b></a>`).join("")}</div><p>Это предупреждение не блокирует создание новой заявки.</p></div></div>` : "";
}

function validateCreate(values) {
  const errors = {};
  if (!values.equipment) errors.equipment = "Выберите оборудование из справочника";
  if (!values.area) errors.area = "Выберите производственный участок";
  if (!values.category) errors.category = "Выберите категорию неисправности";
  if (!values.priority) errors.priority = "Укажите предлагаемый приоритет";
  if (!values.detectedAt) errors.detectedAt = "Укажите дату и время обнаружения";
  if (values.detectedAt && new Date(values.detectedAt).getTime() > Date.now() + 60000) errors.detectedAt = "Время обнаружения не может быть в будущем";
  if (values.description.trim().length < 10) errors.description = "Опишите неисправность минимум десятью символами";
  return errors;
}

async function handleCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const errors = validateCreate(values);
  form.querySelectorAll(".field-error").forEach((node) => { node.textContent = errors[node.dataset.error] || ""; });
  form.querySelectorAll(".control").forEach((node) => node.classList.toggle("invalid", Boolean(errors[node.name])));
  if (Object.keys(errors).length) {
    form.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
    toast("Проверьте форму", "Исправьте отмеченные поля — введённые данные сохранены.", "error");
    return;
  }

  const selected = equipment.find((item) => item.id === values.equipment);
  const user = currentUser();
  const payload = {
    equipmentId: selected.id,
    equipmentName: selected.name,
    area: values.area,
    description: values.description.trim(),
    category: values.category,
    priority: values.priority,
    proposedPriority: values.priority,
    status: "new",
    assignee: null,
    createdBy: { id: user.userId, name: user.name },
    detectedAt: new Date(values.detectedAt).toISOString(),
    createdAt: new Date().toISOString(),
    diagnosis: "",
    repairResult: "",
    history: [{ at: new Date().toISOString(), actor: user.name, action: "Заявка зарегистрирована", detail: `Предлагаемый приоритет: ${priorityMeta[values.priority].toLowerCase()}` }],
  };
  const operation = engine.enqueue(payload);
  const button = document.querySelector("#create-submit");
  button.disabled = true;
  button.textContent = ui.online ? "Сохраняем…" : "Сохраняем локально…";

  if (!ui.online) {
    toast("Сохранено локально — ещё не зарегистрировано", "Заявка будет безопасно отправлена после восстановления связи.", "warning", 7000);
    location.hash = "#/requests";
    return;
  }

  const results = await syncPending({ quiet: true });
  const result = results.find((item) => item.operationId === operation.operationId);
  if (result?.state === "synced") {
    toast("Заявка успешно создана", `${result.response.requestId} зарегистрирована и добавлена в очередь технической службы.`, "success", 7000);
    location.hash = `#/requests/${result.response.requestId}`;
  } else {
    button.disabled = false;
    button.innerHTML = `${icons.refresh} Повторить сохранение`;
    toast("Сохранение не подтверждено", result?.error || "Операция остаётся в очереди. Повторите позже.", "error", 7000);
  }
}

function renderDetail(id) {
  const request = getRequests().find((item) => item.id === id);
  if (!request) {
    renderNotFound();
    return;
  }
  const user = currentUser();
  const canDispatch = ui.role === "dispatcher";
  const canEngineer = ui.role === "engineer";
  const assignedToCurrentEngineer = request.assignee?.name === user.name;
  const actionButtons = [];
  if (canDispatch && request.status !== "closed") actionButtons.push(`<a class="button button-primary" href="#/requests/${request.id}/assign">${icons.user} ${request.assignee ? "Переназначить" : "Назначить исполнителя"}</a>`);
  if (canEngineer && assignedToCurrentEngineer && request.status === "assigned") actionButtons.push(`<button class="button button-primary" id="start-work">${icons.wrench} Начать работу</button>`);
  if (canDispatch && request.status === "completed") actionButtons.push(`<button class="button button-primary" id="close-request">${icons.check} Закрыть заявку</button>`);
  if (!ui.online && actionButtons.length) actionButtons.push(`<p class="action-note">Изменения доступны после восстановления связи.</p>`);

  app.innerHTML = `<section class="page">
    ${pageHead({ title: request.id, description: "Карточка неисправности, ответственные и полная история изменений.", breadcrumbs: [{ label: "Заявки", href: "#/requests" }, { label: request.id }], actions: `<a href="#/requests" class="button button-secondary">${icons.back} К списку</a>` })}
    ${!ui.online ? `<div class="notice warning">${icons.cloud}<div><strong>Нет соединения</strong><br>Карточка показана из локального кэша. Изменяющие операции временно недоступны.</div></div>` : ""}
    <div class="detail-layout">
      <div class="detail-main">
        <article class="card detail-card">
          <div class="request-hero"><div><h2>${escapeHtml(request.equipmentName)}</h2><p>${escapeHtml(request.equipmentId)} · ${escapeHtml(request.area)}</p></div><div class="hero-badges">${priorityBadge(request.priority)}${statusBadge(request.status)}</div></div>
          <div class="info-grid">
            ${infoItem("Категория", request.category)}
            ${infoItem("Обнаружено", fmtDate(request.detectedAt))}
            ${infoItem("Зарегистрировано", fmtDate(request.createdAt))}
            ${infoItem("Инициатор", request.createdBy.name)}
            ${infoItem("Исполнитель", request.assignee?.name || "Не назначен")}
            ${infoItem("Обновлено", fmtDate(request.updatedAt || request.createdAt))}
          </div>
          <div class="description-box"><span>Описание неисправности</span><p>${escapeHtml(request.description)}</p></div>
        </article>
        <article class="card detail-card">
          <div class="section-title"><div><h2>Диагностика и результат ремонта</h2><p>Заполняет назначенный инженер; результат обязателен перед закрытием.</p></div></div>
          ${canEngineer && assignedToCurrentEngineer && ["in_progress", "completed"].includes(request.status) ? `<form class="repair-form" id="repair-form">
            <div class="field"><label for="diagnosis">Диагностика</label><textarea class="control" id="diagnosis" ${request.status === "completed" ? "disabled" : ""} placeholder="Установленная причина неисправности">${escapeHtml(request.diagnosis || "")}</textarea></div>
            <div class="field"><label for="repair-result">Выполненные работы</label><textarea class="control" id="repair-result" ${request.status === "completed" ? "disabled" : ""} placeholder="Что сделано и как проверен результат">${escapeHtml(request.repairResult || "")}</textarea><p class="field-error" id="repair-error"></p></div>
            ${request.status !== "completed" ? `<div class="form-actions"><button class="button button-secondary" id="save-repair" type="button">Сохранить черновик</button><button class="button button-primary" type="submit">${icons.check} Завершить ремонт</button></div>` : ""}
          </form>` : `<div class="info-grid"><div class="info-item span-2"><span>Диагностика</span><strong>${escapeHtml(request.diagnosis || "Ещё не заполнена")}</strong></div><div class="info-item span-2"><span>Выполненные работы</span><strong>${escapeHtml(request.repairResult || "Ещё не заполнены")}</strong></div></div>`}
        </article>
        <article class="card detail-card"><div class="section-title"><div><h2>История изменений</h2><p>События сохраняются с автором и временем.</p></div></div>${renderTimeline(request.history)}</article>
      </div>
      <aside class="detail-side">
        <div class="card detail-card"><h3 style="margin:0 0 13px;font-size:12px">Доступные действия</h3><div class="action-stack">${actionButtons.join("") || `<div class="notice">${icons.user}<div>Для текущей роли изменяющих действий нет. Карточка доступна только для просмотра.</div></div>`}</div></div>
        <div class="card detail-card"><h3 style="margin:0 0 13px;font-size:12px">Ответственный</h3>${request.assignee ? `<div class="person-row"><span class="person-avatar">${initials(request.assignee.name)}</span><div><strong>${escapeHtml(request.assignee.name)}</strong><span>${escapeHtml(request.assignee.specialty || "Техническая служба")}</span></div></div>` : `<div class="notice warning">${icons.clock}<div><strong>Исполнитель не назначен</strong><br>Заявка ожидает действия диспетчера.</div></div>`}</div>
        ${canDispatch && request.status !== "closed" ? `<div class="card detail-card"><h3 style="margin:0 0 13px;font-size:12px">Окончательный приоритет</h3><form id="priority-form"><div class="field"><select class="control" id="detail-priority">${Object.entries(priorityMeta).map(([key, label]) => `<option value="${key}" ${request.priority === key ? "selected" : ""}>${label}</option>`).join("")}</select></div><button class="button button-secondary" style="width:100%;margin-top:9px" ${!ui.online ? "disabled" : ""}>Сохранить приоритет</button></form></div>` : ""}
      </aside>
    </div>
  </section>`;

  document.querySelector("#start-work")?.addEventListener("click", () => changeStatus(request, "in_progress", "Работа начата"));
  document.querySelector("#close-request")?.addEventListener("click", () => closeRequest(request));
  document.querySelector("#priority-form")?.addEventListener("submit", (event) => changePriority(event, request));
  document.querySelector("#save-repair")?.addEventListener("click", () => saveRepair(request, false));
  document.querySelector("#repair-form")?.addEventListener("submit", (event) => { event.preventDefault(); saveRepair(request, true); });
}

function infoItem(label, value) {
  return `<div class="info-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderTimeline(history = []) {
  if (!history.length) return `<div class="empty-state" style="min-height:160px"><p>История пока пуста.</p></div>`;
  return `<div class="timeline">${history.map((item) => `<div class="timeline-item"><span class="timeline-dot">${icons.check}</span><div class="timeline-copy"><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.detail || "")}</p><time>${fmtDate(item.at)} · ${escapeHtml(item.actor)}</time></div></div>`).join("")}</div>`;
}

function requireOnline() {
  if (ui.online) return true;
  toast("Действие недоступно офлайн", "В проектном допущении без связи разрешено только локальное создание заявки.", "warning");
  return false;
}

function failIfRequested() {
  if (!consumeFault()) return false;
  toast("Операция не сохранена", "Сервис вернул тестовую ошибку. Данные заявки не изменились.", "error");
  return true;
}

function changeStatus(request, status, action) {
  if (!requireOnline() || failIfRequested()) return;
  updateRequest(request.id, (item) => {
    item.status = status;
    item.history.unshift({ at: new Date().toISOString(), actor: currentUser().name, action, detail: `Статус: ${statusMeta[status].label}` });
  });
  toast(action, `Статус ${request.id} обновлён.`);
  renderDetail(request.id);
}

function closeRequest(request) {
  if (!requireOnline() || failIfRequested()) return;
  if (!request.repairResult?.trim()) {
    toast("Закрытие запрещено", "Сначала инженер должен зафиксировать результат выполненных работ.", "error");
    return;
  }
  changeStatus(request, "closed", "Заявка закрыта");
}

function changePriority(event, request) {
  event.preventDefault();
  if (!requireOnline() || failIfRequested()) return;
  const value = document.querySelector("#detail-priority").value;
  if (value === request.priority) {
    toast("Изменений нет", "Выбран текущий приоритет заявки.", "warning");
    return;
  }
  updateRequest(request.id, (item) => {
    const previous = item.priority;
    item.priority = value;
    item.history.unshift({ at: new Date().toISOString(), actor: currentUser().name, action: "Приоритет изменён", detail: `${priorityMeta[previous]} → ${priorityMeta[value]}` });
  });
  toast("Приоритет обновлён", `${request.id}: установлен приоритет «${priorityMeta[value]}».`);
  renderDetail(request.id);
}

function saveRepair(request, complete) {
  if (!requireOnline() || failIfRequested()) return;
  const diagnosis = document.querySelector("#diagnosis").value.trim();
  const result = document.querySelector("#repair-result").value.trim();
  if (complete && (diagnosis.length < 5 || result.length < 10)) {
    document.querySelector("#repair-error").textContent = "Для завершения укажите диагностику и выполненные работы (не менее 10 символов)";
    toast("Результат не заполнен", "Заявку нельзя завершить без описания диагностики и ремонта.", "error");
    return;
  }
  updateRequest(request.id, (item) => {
    item.diagnosis = diagnosis;
    item.repairResult = result;
    if (complete) item.status = "completed";
    item.history.unshift({ at: new Date().toISOString(), actor: currentUser().name, action: complete ? "Ремонт завершён" : "Сведения о ремонте обновлены", detail: complete ? "Результат зафиксирован; заявка ожидает закрытия" : "Сохранён черновик диагностики" });
  });
  toast(complete ? "Ремонт зафиксирован" : "Черновик сохранён", complete ? "Карточка обновлена и передана на закрытие." : "Сведения добавлены в историю заявки.");
  renderDetail(request.id);
}

function renderAssign(id) {
  const request = getRequests().find((item) => item.id === id);
  if (!request) { renderNotFound(); return; }
  if (ui.role !== "dispatcher") { renderAccessDenied("Назначение исполнителя доступно только диспетчеру."); return; }
  const available = ui.noSpecialists ? [] : specialists;
  app.innerHTML = `<section class="page">
    ${pageHead({ title: "Назначить исполнителя", description: `Выберите специалиста для ${request.id}. Назначение изменит статус и появится в истории.`, breadcrumbs: [{ label: "Заявки", href: "#/requests" }, { label: request.id, href: `#/requests/${request.id}` }, { label: "Назначение" }], actions: `<a href="#/requests/${request.id}" class="button button-secondary">${icons.back} К карточке</a>` })}
    ${!ui.online ? `<div class="notice warning">${icons.cloud}<div><strong>Назначение недоступно без связи</strong><br>Вернитесь к операции после восстановления соединения.</div></div>` : ""}
    <div class="assign-layout">
      <form class="card form-card" id="assign-form">
        <div class="section-title"><div><h2>Специалисты технической службы</h2><p>Доступность в прототипе — демонстрационные данные справочника.</p></div></div>
        ${available.length ? `<div class="specialists">${available.map((person) => `<label class="specialist-card ${request.assignee?.id === person.id ? "selected" : ""}"><input type="radio" name="specialist" value="${person.id}" ${request.assignee?.id === person.id ? "checked" : ""} ${!person.available ? "disabled" : ""}><span class="specialist-avatar">${person.short}</span><span class="specialist-info"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.specialty)}</span><span class="availability ${person.available ? "" : "busy"}">${person.available ? "Доступен" : person.workload}</span></span></label>`).join("")}</div><p class="field-error" id="assign-error"></p><div class="form-actions"><a class="button button-secondary" href="#/requests/${request.id}">Отмена</a><button class="button button-primary" type="submit" ${!ui.online ? "disabled" : ""}>${icons.check} Подтвердить назначение</button></div>` : `<div class="empty-state"><div class="state-icon">${icons.user}</div><h2>Нет доступных специалистов</h2><p>Сейчас назначение невозможно. Вернитесь в карточку и используйте согласованный путь эскалации.</p><a class="button button-secondary" href="#/requests/${request.id}">${icons.back} Вернуться к заявке</a></div>`}
      </form>
      <aside class="card detail-card"><h3 style="margin:0 0 14px;font-size:12px">Заявка</h3><div class="summary-list">
        <div class="summary-row"><span>ID</span><strong>${request.id}</strong></div>
        <div class="summary-row"><span>Оборудование</span><strong>${escapeHtml(request.equipmentName)}</strong></div>
        <div class="summary-row"><span>Участок</span><strong>${escapeHtml(request.area)}</strong></div>
        <div class="summary-row"><span>Приоритет</span><strong>${priorityMeta[request.priority]}</strong></div>
        <div class="summary-row"><span>Текущий исполнитель</span><strong>${escapeHtml(request.assignee?.name || "Не назначен")}</strong></div>
      </div><div class="description-box"><span>Описание</span><p>${escapeHtml(request.description)}</p></div></aside>
    </div>
  </section>`;
  document.querySelectorAll(".specialist-card input").forEach((input) => input.addEventListener("change", () => {
    document.querySelectorAll(".specialist-card").forEach((card) => card.classList.remove("selected"));
    input.closest(".specialist-card").classList.add("selected");
  }));
  document.querySelector("#assign-form")?.addEventListener("submit", (event) => assignSpecialist(event, request));
}

function assignSpecialist(event, request) {
  event.preventDefault();
  if (!requireOnline() || failIfRequested()) return;
  const form = new FormData(event.currentTarget);
  const person = specialists.find((item) => item.id === form.get("specialist"));
  if (!person || !person.available) {
    document.querySelector("#assign-error").textContent = "Выберите доступного специалиста";
    return;
  }
  updateRequest(request.id, (item) => {
    item.assignee = person;
    if (item.status === "new") item.status = "assigned";
    item.history.unshift({ at: new Date().toISOString(), actor: currentUser().name, action: "Назначен исполнитель", detail: person.name });
  });
  toast("Исполнитель назначен", `${person.name} назначен на ${request.id}. Изменение добавлено в историю.`, "success", 7500);
  location.hash = `#/requests/${request.id}`;
}

function renderAccessDenied(message) {
  app.innerHTML = `<section class="page">${pageHead({ title: "Действие недоступно", description: "Интерфейс учитывает матрицу прав тестовой роли.", breadcrumbs: [{ label: "Заявки", href: "#/requests" }, { label: "Нет доступа" }] })}<div class="card error-state"><div class="state-icon">${icons.user}</div><h2>Недостаточно прав</h2><p>${escapeHtml(message)} Попытка не изменяет данные.</p><a class="button button-secondary" href="#/requests">${icons.back} Вернуться к заявкам</a></div></section>`;
}

function renderNotFound() {
  app.innerHTML = `<section class="page">${pageHead({ title: "Заявка не найдена", description: "Возможно, она была удалена при сбросе демонстрационных данных." })}<div class="card empty-state"><div class="state-icon">${icons.inbox}</div><h2>Нет данных для отображения</h2><p>Вернитесь к реестру и выберите существующую заявку.</p><a class="button button-primary" href="#/requests">К списку заявок</a></div></section>`;
}

function bindChrome() {
  document.querySelector("#role-select").addEventListener("change", (event) => {
    ui.role = event.target.value;
    saveUI();
    toast("Роль переключена", `Активна роль «${currentUser().label}». Доступные действия обновлены.`, "success", 3200);
    renderRoute();
  });
  document.querySelector("#network-toggle").addEventListener("change", async (event) => {
    ui.online = event.target.checked;
    saveUI();
    syncChrome();
    if (ui.online) {
      toast("Соединение восстановлено", "Запускаем безопасную синхронизацию локальной очереди.");
      await syncPending();
    } else {
      toast("Соединение отключено", "Создание заявки доступно локально; остальные изменения приостановлены.", "warning");
    }
    renderRoute({ loading: false });
  });
  document.querySelector("#specialists-toggle").addEventListener("change", (event) => { ui.noSpecialists = event.target.checked; saveUI(); renderRoute({ loading: false }); });
  document.querySelector("#empty-toggle").addEventListener("change", (event) => { ui.emptyList = event.target.checked; saveUI(); location.hash = "#/requests"; renderRoute({ loading: false }); });
  document.querySelector("#simulate-error").addEventListener("click", () => {
    ui.faultNext = true;
    const { parts } = routeInfo();
    if (parts.length === 1) ui.listLoadError = true;
    saveUI();
    toast("Тестовая ошибка подготовлена", parts.length === 1 ? "Реестр покажет состояние ошибки загрузки." : "Следующая операция сохранения завершится контролируемой ошибкой.", "warning");
    renderRoute({ loading: false });
  });
  document.querySelector("#reset-demo").addEventListener("click", () => {
    if (!window.confirm("Сбросить созданные заявки, очередь и настройки демонстрации?")) return;
    resetDemo();
    toast("Демо-данные восстановлены", "Реестр и сценарии возвращены в исходное состояние.");
    location.hash = "#/requests";
    renderRoute();
  });
}

ensureSeed();
engine.recoverInterrupted();
bindChrome();
window.addEventListener("hashchange", () => renderRoute());
window.addEventListener("storage", () => renderRoute({ loading: false }));
syncChrome();
if (ui.online) syncPending({ quiet: true }).finally(() => renderRoute());
else renderRoute();
