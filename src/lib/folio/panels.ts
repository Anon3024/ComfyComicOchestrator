const memory = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("folio-panels", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("panels")) db.createObjectStore("panels");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putPanel(shotId: string, dataUrl: string): Promise<void> {
  memory.set(shotId, dataUrl);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("panels", "readwrite");
      tx.objectStore("panels").put(dataUrl, shotId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* memory copy still serves this session */
  }
}

export async function getPanel(shotId: string): Promise<string | null> {
  const cached = memory.get(shotId);
  if (cached) return cached;
  try {
    const db = await openDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction("panels", "readonly");
      const request = tx.objectStore("panels").get(shotId);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (value) memory.set(shotId, value);
    return value;
  } catch {
    return null;
  }
}

export function forgetPanel(shotId: string) {
  memory.delete(shotId);
  void openDb()
    .then(
      (db) =>
        new Promise<void>((resolve) => {
          const tx = db.transaction("panels", "readwrite");
          tx.objectStore("panels").delete(shotId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        }).finally(() => db.close()),
    )
    .catch(() => undefined);
}
