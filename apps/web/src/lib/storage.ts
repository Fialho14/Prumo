import { normalizePortfolio, type WebPortfolio } from "./data-model";

export const PORTFOLIO_DATABASE_NAME = "prumo-web";
export const PORTFOLIO_DATABASE_VERSION = 1;
const PORTFOLIO_STORE = "portfolio";
const ACTIVE_PORTFOLIO_KEY = "active";

export class PortfolioStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PortfolioStorageError";
  }
}

function browserIndexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new PortfolioStorageError("Browser storage is not available in this environment.");
  }
  return indexedDB;
}

export function isPortfolioStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(PORTFOLIO_DATABASE_NAME, PORTFOLIO_DATABASE_VERSION);
    } catch (error) {
      reject(new PortfolioStorageError("Prumo could not open browser storage.", { cause: error }));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PORTFOLIO_STORE)) {
        database.createObjectStore(PORTFOLIO_STORE);
      }
    };
    request.onerror = () => reject(new PortfolioStorageError(
      "Prumo could not open browser storage.",
      { cause: request.error },
    ));
    request.onblocked = () => reject(new PortfolioStorageError(
      "Browser storage is open in another Prumo tab. Close it and try again.",
    ));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function requestResult<T>(request: IDBRequest<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new PortfolioStorageError(message, { cause: request.error }));
  });
}

function transactionComplete(transaction: IDBTransaction, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new PortfolioStorageError(message, {
      cause: transaction.error,
    }));
    transaction.onabort = () => reject(new PortfolioStorageError(message, {
      cause: transaction.error,
    }));
  });
}

/**
 * Persists financial data in IndexedDB. localStorage is deliberately not used
 * anywhere in this module.
 */
export async function savePortfolio(
  input: WebPortfolio,
  factory: IDBFactory = browserIndexedDb(),
): Promise<void> {
  const portfolio = normalizePortfolio(input);
  const database = await openDatabase(factory);
  try {
    const transaction = database.transaction(PORTFOLIO_STORE, "readwrite");
    transaction.objectStore(PORTFOLIO_STORE).put(portfolio, ACTIVE_PORTFOLIO_KEY);
    await transactionComplete(transaction, "Prumo could not save data in this browser.");
  } finally {
    database.close();
  }
}

export async function loadPortfolio(
  factory: IDBFactory = browserIndexedDb(),
): Promise<WebPortfolio | null> {
  const database = await openDatabase(factory);
  try {
    const transaction = database.transaction(PORTFOLIO_STORE, "readonly");
    const request = transaction.objectStore(PORTFOLIO_STORE).get(ACTIVE_PORTFOLIO_KEY);
    const stored = await requestResult<unknown>(request, "Prumo could not read browser storage.");
    await transactionComplete(transaction, "Prumo could not finish reading browser storage.");
    if (stored == null) return null;
    try {
      return normalizePortfolio(stored as WebPortfolio);
    } catch (error) {
      throw new PortfolioStorageError(
        "The saved browser data is invalid. Export or clear it before continuing.",
        { cause: error },
      );
    }
  } finally {
    database.close();
  }
}

/** Deletes the stored portfolio while keeping the empty IndexedDB schema. */
export async function clearPortfolio(
  factory: IDBFactory = browserIndexedDb(),
): Promise<void> {
  const database = await openDatabase(factory);
  try {
    const transaction = database.transaction(PORTFOLIO_STORE, "readwrite");
    transaction.objectStore(PORTFOLIO_STORE).delete(ACTIVE_PORTFOLIO_KEY);
    await transactionComplete(transaction, "Prumo could not clear browser data.");
  } finally {
    database.close();
  }
}

/** Removes Prumo Web's complete database, including the empty schema itself. */
export async function deletePortfolioDatabase(
  factory: IDBFactory = browserIndexedDb(),
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.deleteDatabase(PORTFOLIO_DATABASE_NAME);
    } catch (error) {
      reject(new PortfolioStorageError("Prumo could not delete browser data.", { cause: error }));
      return;
    }
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new PortfolioStorageError(
      "Prumo could not delete browser data.",
      { cause: request.error },
    ));
    request.onblocked = () => reject(new PortfolioStorageError(
      "Browser storage is open in another Prumo tab. Close it and try again.",
    ));
  });
}
