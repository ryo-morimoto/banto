const DEFAULT_BUFFER_LIMIT = 1024 * 1024; // 1MB

type Subscriber = (data: Uint8Array) => void;

type EndListener = () => void;

interface TaskPty {
  buffer: Uint8Array[];
  bufferSize: number;
  subscribers: Set<Subscriber>;
  endListeners: Set<EndListener>;
  stdinWriter: ((data: string) => void) | null;
}

const store = new Map<string, TaskPty>();

function getOrCreate(taskId: string): TaskPty {
  let entry = store.get(taskId);
  if (!entry) {
    entry = {
      buffer: [],
      bufferSize: 0,
      subscribers: new Set(),
      endListeners: new Set(),
      stdinWriter: null,
    };
    store.set(taskId, entry);
  }
  return entry;
}

export const ptyStore = {
  push(taskId: string, data: Uint8Array) {
    const entry = getOrCreate(taskId);
    entry.buffer.push(data);
    entry.bufferSize += data.byteLength;

    // Trim oldest chunks if over limit
    while (entry.bufferSize > DEFAULT_BUFFER_LIMIT && entry.buffer.length > 1) {
      const removed = entry.buffer.shift()!;
      entry.bufferSize -= removed.byteLength;
    }

    for (const fn of entry.subscribers) {
      fn(data);
    }
  },

  getBuffer(taskId: string): Uint8Array[] {
    return store.get(taskId)?.buffer ?? [];
  },

  subscribe(taskId: string, fn: Subscriber): () => void {
    const entry = getOrCreate(taskId);
    entry.subscribers.add(fn);
    return () => {
      entry.subscribers.delete(fn);
    };
  },

  setStdinWriter(taskId: string, writer: (data: string) => void) {
    const entry = getOrCreate(taskId);
    entry.stdinWriter = writer;
  },

  writeStdin(taskId: string, data: string) {
    const entry = store.get(taskId);
    if (entry?.stdinWriter) {
      entry.stdinWriter(data);
    }
  },

  clear(taskId: string) {
    store.delete(taskId);
  },

  onEnd(taskId: string, fn: EndListener): () => void {
    const entry = getOrCreate(taskId);
    entry.endListeners.add(fn);
    return () => {
      entry.endListeners.delete(fn);
    };
  },

  notifyEnd(taskId: string) {
    const entry = store.get(taskId);
    if (!entry) return;
    for (const fn of entry.endListeners) {
      fn();
    }
  },

  hasSubscribers(taskId: string): boolean {
    return (store.get(taskId)?.subscribers.size ?? 0) > 0;
  },
};
