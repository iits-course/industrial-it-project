import assert from "node:assert/strict";
import test from "node:test";
import { IdempotentRequestStore, PermanentSyncError, SyncEngine } from "../sync-engine.mjs";

class MemoryStorage {
  constructor(seed = {}) { this.data = { ...seed }; }
  getItem(key) { return Object.hasOwn(this.data, key) ? this.data[key] : null; }
  setItem(key, value) { this.data[key] = String(value); }
  snapshot() { return { ...this.data }; }
}

const payload = { equipmentId: "EQ-017", equipmentName: "Станок", description: "Проверка сохранения", status: "new" };

test("операция сохраняется локально без сети", async () => {
  const storage = new MemoryStorage();
  const engine = new SyncEngine(storage, { idFactory: () => "op-1" });
  engine.enqueue(payload);
  const result = await engine.sync({ online: false, send: () => assert.fail("send must not be called") });
  assert.equal(result.length, 0);
  assert.equal(engine.readQueue().length, 1);
  assert.deepEqual(engine.readQueue()[0].payload, payload);
});

test("очередь восстанавливается новым экземпляром после перезапуска", () => {
  const firstStorage = new MemoryStorage();
  new SyncEngine(firstStorage, { idFactory: () => "op-restart" }).enqueue(payload);
  const restartedStorage = new MemoryStorage(firstStorage.snapshot());
  const restarted = new SyncEngine(restartedStorage);
  assert.equal(restarted.readQueue()[0].operationId, "op-restart");
});

test("прерванная синхронизация возвращается в pending", () => {
  const storage = new MemoryStorage({
    "repair.prototype.outbox.v1": JSON.stringify([{ operationId: "op-sync", payload, state: "syncing", attempts: 1 }])
  });
  const queue = new SyncEngine(storage).recoverInterrupted();
  assert.equal(queue[0].state, "pending");
});

test("сервер предотвращает дубликат по operationId", () => {
  const storage = new MemoryStorage();
  const server = new IdempotentRequestStore(storage, { idFactory: () => "REQ-1" });
  const operation = { operationId: "same-op", payload };
  const first = server.accept(operation);
  const second = server.accept(operation);
  assert.equal(first.requestId, second.requestId);
  assert.equal(second.duplicatePrevented, true);
  assert.equal(server.read().requests.length, 1);
});

test("потерянный ответ безопасно повторяется без дубля", async () => {
  const storage = new MemoryStorage();
  const engine = new SyncEngine(storage, { idFactory: () => "op-lost-response" });
  const server = new IdempotentRequestStore(storage, { idFactory: () => "REQ-2" });
  engine.enqueue(payload);
  let firstAttempt = true;
  await engine.sync({ online: true, send: async (operation) => {
    const result = server.accept(operation);
    if (firstAttempt) { firstAttempt = false; throw new Error("response lost"); }
    return result;
  }});
  assert.equal(engine.readQueue().length, 1);
  const result = await engine.sync({ online: true, send: (operation) => server.accept(operation) });
  assert.equal(result[0].state, "synced");
  assert.equal(result[0].response.duplicatePrevented, true);
  assert.equal(server.read().requests.length, 1);
});

test("невалидная операция не блокирует следующую", async () => {
  const storage = new MemoryStorage();
  const engine = new SyncEngine(storage, { idFactory: (() => { let id = 0; return () => `op-${++id}`; })() });
  engine.enqueue({ ...payload, invalid: true });
  engine.enqueue(payload);
  const results = await engine.sync({ online: true, send: (operation) => {
    if (operation.payload.invalid) throw new PermanentSyncError("invalid data");
    return { requestId: "REQ-OK" };
  }});
  assert.deepEqual(results.map((item) => item.state), ["failed", "synced"]);
  assert.equal(engine.readQueue().length, 1);
  assert.equal(engine.readQueue()[0].state, "failed");
});
