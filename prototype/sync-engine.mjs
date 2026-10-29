export class PermanentSyncError extends Error {
  constructor(message, code = "PERMANENT_ERROR") {
    super(message);
    this.name = "PermanentSyncError";
    this.code = code;
  }
}

function parse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export class SyncEngine {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.queueKey = options.queueKey || "repair.prototype.outbox.v1";
    this.clock = options.clock || (() => new Date().toISOString());
    this.idFactory = options.idFactory || (() => globalThis.crypto?.randomUUID?.() || `op-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  readQueue() {
    return parse(this.storage.getItem(this.queueKey), []);
  }

  writeQueue(queue) {
    this.storage.setItem(this.queueKey, JSON.stringify(queue));
    return queue;
  }

  enqueue(payload, operationId = this.idFactory()) {
    const queue = this.readQueue();
    const existing = queue.find((item) => item.operationId === operationId);
    if (existing) return existing;
    const item = {
      operationId,
      payload,
      state: "pending",
      attempts: 0,
      createdAt: this.clock(),
      updatedAt: this.clock(),
      lastError: null,
    };
    queue.push(item);
    this.writeQueue(queue);
    return item;
  }

  recoverInterrupted() {
    const queue = this.readQueue();
    let changed = false;
    for (const item of queue) {
      if (item.state === "syncing") {
        item.state = "pending";
        item.updatedAt = this.clock();
        item.lastError = "Синхронизация была прервана; операция готова к безопасному повтору";
        changed = true;
      }
    }
    if (changed) this.writeQueue(queue);
    return queue;
  }

  retry(operationId) {
    const queue = this.readQueue();
    const item = queue.find((entry) => entry.operationId === operationId);
    if (!item) return null;
    item.state = "pending";
    item.updatedAt = this.clock();
    item.lastError = null;
    this.writeQueue(queue);
    return item;
  }

  async sync({ online, send }) {
    if (!online) return [];
    this.recoverInterrupted();
    const results = [];
    let queue = this.readQueue();
    const candidates = queue.filter((item) => item.state === "pending");

    for (const candidate of candidates) {
      queue = this.readQueue();
      const index = queue.findIndex((item) => item.operationId === candidate.operationId);
      if (index < 0) continue;
      queue[index].state = "syncing";
      queue[index].attempts += 1;
      queue[index].updatedAt = this.clock();
      this.writeQueue(queue);

      try {
        const response = await send({ ...queue[index] });
        queue = this.readQueue().filter((item) => item.operationId !== candidate.operationId);
        this.writeQueue(queue);
        results.push({ operationId: candidate.operationId, state: "synced", response });
      } catch (error) {
        queue = this.readQueue();
        const failedIndex = queue.findIndex((item) => item.operationId === candidate.operationId);
        if (failedIndex < 0) continue;
        queue[failedIndex].state = error instanceof PermanentSyncError ? "failed" : "pending";
        queue[failedIndex].lastError = error.message || "Ошибка синхронизации";
        queue[failedIndex].updatedAt = this.clock();
        this.writeQueue(queue);
        results.push({
          operationId: candidate.operationId,
          state: queue[failedIndex].state,
          error: queue[failedIndex].lastError,
        });
      }
    }
    return results;
  }
}

export class IdempotentRequestStore {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.key = options.key || "repair.prototype.server.v1";
    this.idFactory = options.idFactory || (() => `REQ-${String(Date.now()).slice(-6)}`);
    this.clock = options.clock || (() => new Date().toISOString());
  }

  read() {
    return parse(this.storage.getItem(this.key), { requests: [], operations: {} });
  }

  write(state) {
    this.storage.setItem(this.key, JSON.stringify(state));
  }

  accept(operation) {
    const state = this.read();
    if (state.operations[operation.operationId]) {
      return { ...state.operations[operation.operationId], duplicatePrevented: true };
    }
    const request = {
      ...operation.payload,
      id: this.idFactory(state),
      operationId: operation.operationId,
      createdAt: operation.payload.createdAt || this.clock(),
      updatedAt: this.clock(),
    };
    state.requests.unshift(request);
    const response = { requestId: request.id, request, duplicatePrevented: false };
    state.operations[operation.operationId] = response;
    this.write(state);
    return response;
  }
}
