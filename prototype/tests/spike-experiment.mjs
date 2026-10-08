import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { IdempotentRequestStore, PermanentSyncError, SyncEngine } from "../sync-engine.mjs";

class FileStorage {
  constructor(file) { this.file = file; if (!fs.existsSync(file)) fs.writeFileSync(file, "{}", "utf8"); }
  read() { return JSON.parse(fs.readFileSync(this.file, "utf8")); }
  getItem(key) { const data = this.read(); return Object.hasOwn(data, key) ? data[key] : null; }
  setItem(key, value) { const data = this.read(); data[key] = String(value); fs.writeFileSync(this.file, JSON.stringify(data), "utf8"); }
}

const RUNS = 50;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repair-spike-"));
const summary = {
  timestamp: new Date().toISOString(),
  runtime: process.version,
  runsPerScenario: RUNS,
  scenarios: {},
  totals: { checks: 0, lostOperations: 0, duplicates: 0, failures: 0 },
  syncLatencyMs: { min: Infinity, max: 0, average: 0 },
};
const latencies = [];

function payload(index) {
  return { equipmentId: "EQ-017", equipmentName: "Станок", description: `Spike operation ${index}`, status: "new", createdAt: new Date().toISOString() };
}

function record(name, ok, detail = "") {
  summary.scenarios[name] ??= { checks: 0, passed: 0, failed: 0, detail };
  summary.scenarios[name].checks += 1;
  summary.totals.checks += 1;
  if (ok) summary.scenarios[name].passed += 1;
  else { summary.scenarios[name].failed += 1; summary.totals.failures += 1; }
}

for (let index = 0; index < RUNS; index += 1) {
  const file = path.join(tempRoot, `s01-${index}.json`);
  const storage = new FileStorage(file);
  const engine = new SyncEngine(storage, { idFactory: () => `s01-${index}` });
  engine.enqueue(payload(index));
  await engine.sync({ online: false, send: () => { throw new Error("unexpected send"); } });
  const ok = engine.readQueue().length === 1 && engine.readQueue()[0].payload.description === `Spike operation ${index}`;
  record("S-01 offline local save", ok, "Данные и операция сохранены, отправка без сети не выполняется");
  if (!ok) summary.totals.lostOperations += 1;
}

for (let index = 0; index < RUNS; index += 1) {
  const file = path.join(tempRoot, `s02-${index}.json`);
  const storage = new FileStorage(file);
  const engine = new SyncEngine(storage, { idFactory: () => `s02-${index}` });
  const server = new IdempotentRequestStore(storage, { idFactory: () => `REQ-S02-${index}` });
  engine.enqueue(payload(index));
  await engine.sync({ online: true, send: (operation) => { server.accept(operation); throw new Error("response lost"); } });
  await engine.sync({ online: true, send: (operation) => server.accept(operation) });
  const count = server.read().requests.length;
  record("S-02 response lost after server accept", count === 1 && engine.readQueue().length === 0, "Повтор после неизвестного исхода использует тот же operationId");
  if (count > 1) summary.totals.duplicates += count - 1;
  if (count === 0) summary.totals.lostOperations += 1;
}

for (let index = 0; index < RUNS; index += 1) {
  const file = path.join(tempRoot, `s03-${index}.json`);
  const firstStorage = new FileStorage(file);
  new SyncEngine(firstStorage, { idFactory: () => `s03-${index}` }).enqueue(payload(index));
  const restarted = new SyncEngine(new FileStorage(file));
  const restored = restarted.readQueue();
  const ok = restored.length === 1 && restored[0].operationId === `s03-${index}`;
  record("S-03 application restart", ok, "Новый экземпляр восстанавливает очередь из файла");
  if (!ok) summary.totals.lostOperations += 1;
}

for (let index = 0; index < RUNS; index += 1) {
  const file = path.join(tempRoot, `s04-${index}.json`);
  const storage = new FileStorage(file);
  const server = new IdempotentRequestStore(storage, { idFactory: () => `REQ-S04-${index}` });
  const operation = { operationId: `s04-${index}`, payload: payload(index) };
  for (let repeat = 0; repeat < 5; repeat += 1) server.accept(operation);
  const count = server.read().requests.length;
  record("S-04 repeated send", count === 1, "Пять одинаковых отправок создают одну серверную запись");
  if (count > 1) summary.totals.duplicates += count - 1;
}

for (let index = 0; index < RUNS; index += 1) {
  const file = path.join(tempRoot, `s05-${index}.json`);
  const storage = new FileStorage(file);
  const engine = new SyncEngine(storage, { idFactory: () => `s05-${index}` });
  const server = new IdempotentRequestStore(storage, { idFactory: () => `REQ-S05-${index}` });
  engine.enqueue(payload(index));
  const start = performance.now();
  await engine.sync({ online: true, send: (operation) => server.accept(operation) });
  const duration = performance.now() - start;
  latencies.push(duration);
  const ok = engine.readQueue().length === 0 && server.read().requests.length === 1;
  record("S-05 synchronization after restore", ok, "Очередь очищается только после подтверждённого ответа");
  if (!ok) summary.totals.lostOperations += 1;
}

for (let index = 0; index < RUNS; index += 1) {
  const file = path.join(tempRoot, `s06-${index}.json`);
  const storage = new FileStorage(file);
  const engine = new SyncEngine(storage, { idFactory: () => `s06-${index}` });
  const server = new IdempotentRequestStore(storage, { idFactory: () => `REQ-S06-${index}` });
  engine.enqueue(payload(index));
  await engine.sync({ online: true, send: (operation) => { server.accept(operation); throw new Error("second interruption"); } });
  const restarted = new SyncEngine(new FileStorage(file));
  await restarted.sync({ online: true, send: (operation) => server.accept(operation) });
  const count = server.read().requests.length;
  record("S-06 repeated interruption and restart", count === 1 && restarted.readQueue().length === 0, "Повторный обрыв и перезапуск не создают дубль");
  if (count > 1) summary.totals.duplicates += count - 1;
  if (count === 0) summary.totals.lostOperations += 1;
}

for (let index = 0; index < RUNS; index += 1) {
  const file = path.join(tempRoot, `s07-${index}.json`);
  const storage = new FileStorage(file);
  const engine = new SyncEngine(storage, { idFactory: (() => { let id = 0; return () => `s07-${index}-${++id}`; })() });
  engine.enqueue({ ...payload(index), invalid: true });
  engine.enqueue(payload(index + 1000));
  const results = await engine.sync({ online: true, send: (operation) => {
    if (operation.payload.invalid) throw new PermanentSyncError("Справочник изменён; требуется ручная проверка");
    return { requestId: `REQ-S07-${index}` };
  }});
  const queue = engine.readQueue();
  const ok = results[0].state === "failed" && results[1].state === "synced" && queue.length === 1 && queue[0].state === "failed";
  record("S-07 invalid operation isolation", ok, "Невалидная запись требует разбора, но не блокирует следующую");
}

summary.syncLatencyMs.min = Number(Math.min(...latencies).toFixed(3));
summary.syncLatencyMs.max = Number(Math.max(...latencies).toFixed(3));
summary.syncLatencyMs.average = Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(3));
summary.verdict = summary.totals.failures === 0 && summary.totals.lostOperations === 0 && summary.totals.duplicates === 0 ? "SUPPORTED_ON_MINIMAL_STAND" : "NOT_SUPPORTED";

console.log(JSON.stringify(summary, null, 2));
fs.rmSync(tempRoot, { recursive: true, force: true });
if (summary.verdict !== "SUPPORTED_ON_MINIMAL_STAND") process.exitCode = 1;
