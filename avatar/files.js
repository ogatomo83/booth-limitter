// キャラクターのファイル (VRM) の置き場。拡張機能のオリジンの IndexedDB。
// VRM は 10〜50MB あるので chrome.storage ではなくこちら。設定画面と表示用の枠 (どちらも拡張機能のページ) から使う。
const DB = "suki", STORE = "files";
let dbp;
function open() {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
const done = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
export async function getFile(key) {
  return done((await open()).transaction(STORE).objectStore(STORE).get(key));
}
export async function putFile(key, blob) {
  return done((await open()).transaction(STORE, "readwrite").objectStore(STORE).put(blob, key));
}
export async function deleteFile(key) {
  return done((await open()).transaction(STORE, "readwrite").objectStore(STORE).delete(key));
}
/** 表示の設定 (chrome.storage にも置いて、BOOTH のページ側が枠を出すかどうか決められるようにする) */
export const META_KEY = "sukiAvatar";
