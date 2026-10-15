// ─────────────────────────────────────────────────────────────────────────────
// STORAGE  (sync for small synced prefs, local for bulky / sensitive data)
// ─────────────────────────────────────────────────────────────────────────────

function mkStore(area) {
  const chromeArea = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) ? chrome.storage[area] : null;
  if (chromeArea) {
    return {
      get: keys => new Promise(res => chromeArea.get(keys, res)),
      // Reject on quota or other errors so callers don't lose writes silently.
      set: obj  => new Promise((res, rej) => chromeArea.set(obj, () => {
        const err = chrome.runtime.lastError;
        if (err) { console.error(`Crowsnest: ${area} storage write failed`, err.message); rej(new Error(err.message)); }
        else res();
      })),
      remove: keys => new Promise(res => chromeArea.remove(keys, () => res())),
      getAll: () => new Promise(res => chromeArea.get(null, res))
    };
  }
  const prefix = `crowsnest:${area}:`;
  return {
    get: keys => new Promise(res => {
      const arr = Array.isArray(keys) ? keys : [keys];
      const out = {};
      arr.forEach(k => { const v = localStorage.getItem(prefix + k); out[k] = v == null ? undefined : JSON.parse(v); });
      res(out);
    }),
    set: obj => new Promise((res, rej) => {
      try { Object.entries(obj).forEach(([k, v]) => localStorage.setItem(prefix + k, JSON.stringify(v))); res(); }
      catch (e) { rej(e); }
    }),
    remove: keys => new Promise(res => {
      (Array.isArray(keys) ? keys : [keys]).forEach(k => localStorage.removeItem(prefix + k));
      res();
    }),
    getAll: () => new Promise(res => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) { try { out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch {} }
      }
      res(out);
    })
  };
}

export const syncStore  = mkStore('sync');
export const localStore = mkStore('local');

export const syncGet  = k => syncStore.get(k);
export const syncSet  = o => syncStore.set(o);
export const localGet = k => localStore.get(k);
export const localSet = o => localStore.set(o);
