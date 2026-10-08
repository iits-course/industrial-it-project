import { expect, test } from "@playwright/test";

async function fresh(page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Заявки", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await fresh(page);
});

test("реестр, фильтры и карточка заявки доступны", async ({ page }) => {
  await expect(page.getByText("REQ-2026-1042")).toBeVisible();
  await page.locator("#filter-search").fill("гидравлический пресс");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByText("REQ-2026-1042").click();
  await expect(page.getByRole("heading", { name: "REQ-2026-1042" })).toBeVisible();
  await expect(page.getByText("Гидравлический пресс П6324")).toBeVisible();
});

test("форма показывает ошибки и создаёт заявку", async ({ page }) => {
  await page.getByRole("link", { name: "Создать заявку", exact: true }).first().click();
  await page.getByRole("button", { name: "Создать заявку" }).click();
  await expect(page.getByText("Выберите оборудование из справочника", { exact: true })).toBeVisible();
  await page.locator("#equipment").selectOption("EQ-017");
  await page.locator("#category").selectOption("Механика");
  await page.locator("#description").fill("Посторонняя вибрация шпинделя при запуске станка.");
  await page.getByRole("button", { name: "Создать заявку" }).click();
  await expect(page.getByText("Заявка успешно создана")).toBeVisible();
  await expect(page.getByRole("heading", { name: /REQ-2026-1043/ })).toBeVisible();
});

test("диспетчер назначает исполнителя и видит подтверждение", async ({ page }) => {
  await page.locator("#role-select").selectOption("dispatcher");
  await expect(page.getByText("Никита Орлов")).toBeVisible();
  await page.getByText("REQ-2026-1042").click();
  await page.getByRole("link", { name: "Назначить исполнителя" }).click();
  await expect(page.getByRole("heading", { name: "Назначить исполнителя" })).toBeVisible();
  await page.getByText("Алексей Воронов", { exact: true }).first().click();
  await page.getByRole("button", { name: "Подтвердить назначение" }).click();
  await expect(page.getByText("Исполнитель назначен")).toBeVisible();
  await expect(page.getByText("Алексей Воронов", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Назначен исполнитель", { exact: true })).toBeVisible();
});

test("офлайн-заявка переживает перезагрузку и синхронизируется без дубля", async ({ page }) => {
  await page.locator("#network-toggle").uncheck({ force: true });
  await page.getByRole("link", { name: "Создать заявку", exact: true }).first().click();
  await page.locator("#equipment").selectOption("EQ-205");
  await page.locator("#category").selectOption("Механика");
  await page.locator("#description").fill("Конвейер остановился после повторного запуска линии.");
  await page.getByRole("button", { name: "Создать заявку" }).click();
  await expect(page.getByText("Ожидает синхронизации", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ожидает синхронизации", { exact: true })).toBeVisible();
  await page.locator("#network-toggle").check({ force: true });
  await expect(page.getByText("Синхронизация завершена")).toBeVisible();
  await expect(page.getByText("Ожидает синхронизации", { exact: true })).toHaveCount(0);
  const matching = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("repair.prototype.server.v1"));
    return state.requests.filter((item) => item.description === "Конвейер остановился после повторного запуска линии.").length;
  });
  expect(matching).toBe(1);
});

test("демонстрационные error, empty и no-specialists состояния работают", async ({ page }) => {
  await page.locator("#empty-toggle").check({ force: true });
  await expect(page.getByRole("heading", { name: "Заявки не найдены" })).toBeVisible();
  await page.locator("#empty-toggle").uncheck({ force: true });
  await page.getByRole("button", { name: "Ошибка следующей операции" }).click();
  await expect(page.getByRole("heading", { name: "Не удалось загрузить заявки" })).toBeVisible();
  await page.getByRole("button", { name: "Повторить" }).click();
  await page.locator("#role-select").selectOption("dispatcher");
  await page.locator("#specialists-toggle").check({ force: true });
  await page.getByText("REQ-2026-1042").click();
  await page.getByRole("link", { name: "Назначить исполнителя" }).click();
  await expect(page.getByRole("heading", { name: "Нет доступных специалистов" })).toBeVisible();
});

test("полный ролевой путь: назначение, ремонт и закрытие", async ({ page }) => {
  await page.locator("#role-select").selectOption("dispatcher");
  await page.getByText("REQ-2026-1042").click();
  await page.getByRole("link", { name: "Назначить исполнителя" }).click();
  await page.getByText("Алексей Воронов", { exact: true }).first().click();
  await page.getByRole("button", { name: "Подтвердить назначение" }).click();
  await page.locator("#role-select").selectOption("engineer");
  await page.getByRole("button", { name: "Начать работу" }).click();
  await expect(page.getByText("В работе", { exact: true })).toBeVisible();
  await page.locator("#diagnosis").fill("Ослаблено крепление гидравлической магистрали.");
  await page.locator("#repair-result").fill("Крепление восстановлено, давление проверено под нагрузкой.");
  await page.getByRole("button", { name: "Завершить ремонт" }).click();
  await expect(page.getByText("Выполнена", { exact: true })).toBeVisible();
  await page.locator("#role-select").selectOption("dispatcher");
  await page.getByRole("button", { name: "Закрыть заявку" }).click();
  await expect(page.getByText("Закрыта", { exact: true })).toBeVisible();
});

test("ошибка изменения не меняет приоритет, повтор выполняется", async ({ page }) => {
  await page.locator("#role-select").selectOption("dispatcher");
  await page.getByText("REQ-2026-1042").click();
  await page.locator("#detail-priority").selectOption("critical");
  await page.getByRole("button", { name: "Ошибка следующей операции" }).click();
  await page.getByRole("button", { name: "Сохранить приоритет" }).click();
  await expect(page.getByText("Операция не сохранена")).toBeVisible();
  let priority = await page.evaluate(() => JSON.parse(localStorage.getItem("repair.prototype.server.v1")).requests.find((item) => item.id === "REQ-2026-1042").priority);
  expect(priority).toBe("high");
  await page.locator("#detail-priority").selectOption("critical");
  await page.getByRole("button", { name: "Сохранить приоритет" }).click();
  await expect(page.getByText("Приоритет обновлён")).toBeVisible();
  priority = await page.evaluate(() => JSON.parse(localStorage.getItem("repair.prototype.server.v1")).requests.find((item) => item.id === "REQ-2026-1042").priority);
  expect(priority).toBe("critical");
});

test("прямой переход к назначению отклоняется для оператора", async ({ page }) => {
  await page.goto("/#/requests/REQ-2026-1042/assign");
  await expect(page.getByRole("heading", { name: "Действие недоступно" })).toBeVisible();
  await expect(page.getByText("Недостаточно прав")).toBeVisible();
});
