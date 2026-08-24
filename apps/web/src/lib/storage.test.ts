import { describe, expect, it } from "vitest";
import {
  clearPortfolio,
  deletePortfolioDatabase,
  isPortfolioStorageAvailable,
  loadPortfolio,
  PortfolioStorageError,
  savePortfolio,
} from "./storage";
import { createDemoPortfolio } from "./demo";

function createMemoryIndexedDb(): IDBFactory {
  let exists = false;
  const records = new Map<IDBValidKey, unknown>();

  const makeDatabase = (): IDBDatabase => ({
    close() {},
    createObjectStore() {
      return {} as IDBObjectStore;
    },
    objectStoreNames: {
      contains: () => exists,
    } as unknown as DOMStringList,
    transaction() {
      const transaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore() {
          return {
            put(value: unknown, key: IDBValidKey) {
              records.set(key, structuredClone(value));
              setTimeout(() => transaction.oncomplete?.(new Event("complete")), 0);
              return {} as IDBRequest;
            },
            get(key: IDBValidKey) {
              const request = { result: undefined, error: null, onsuccess: null, onerror: null } as unknown as IDBRequest;
              setTimeout(() => {
                (request as { result: unknown }).result = structuredClone(records.get(key));
                request.onsuccess?.(new Event("success"));
                setTimeout(() => transaction.oncomplete?.(new Event("complete")), 0);
              }, 0);
              return request;
            },
            delete(key: IDBValidKey) {
              records.delete(key);
              setTimeout(() => transaction.oncomplete?.(new Event("complete")), 0);
              return {} as IDBRequest;
            },
          } as IDBObjectStore;
        },
      } as unknown as IDBTransaction;
      return transaction;
    },
  } as unknown as IDBDatabase);

  return {
    open() {
      const request = {
        result: undefined,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      } as unknown as IDBOpenDBRequest;
      setTimeout(() => {
        (request as { result: IDBDatabase }).result = makeDatabase();
        if (!exists) {
          request.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent);
          exists = true;
        }
        request.onsuccess?.(new Event("success"));
      }, 0);
      return request;
    },
    deleteDatabase() {
      const request = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      } as unknown as IDBOpenDBRequest;
      setTimeout(() => {
        records.clear();
        exists = false;
        request.onsuccess?.(new Event("success"));
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
}

describe("browser storage boundary", () => {
  it("fails clearly outside a browser instead of falling back to localStorage", async () => {
    expect(isPortfolioStorageAvailable()).toBe(false);
    await expect(loadPortfolio()).rejects.toBeInstanceOf(PortfolioStorageError);
  });

  it("persists across loads and supports both clean deletion paths", async () => {
    const indexedDb = createMemoryIndexedDb();
    const portfolio = createDemoPortfolio();
    portfolio.title = "Stored in this browser";

    await savePortfolio(portfolio, indexedDb);
    const reloaded = await loadPortfolio(indexedDb);
    expect(reloaded).toEqual(portfolio);
    expect(reloaded).not.toBe(portfolio);

    await clearPortfolio(indexedDb);
    expect(await loadPortfolio(indexedDb)).toBeNull();

    await savePortfolio(portfolio, indexedDb);
    await deletePortfolioDatabase(indexedDb);
    expect(await loadPortfolio(indexedDb)).toBeNull();
  });
});
