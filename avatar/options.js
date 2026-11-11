// 設定画面: キャラクター (VRM) を選ぶ・消す・表示を切り替える
import { getFile, putFile, deleteFile, META_KEY } from "./files.js";

const $ = s => document.querySelector(s);
const MAX = 100 << 20;

/** VRM (glTF バイナリ) の頭から、名前・作者・ライセンスだけ読む */
async function readMeta(file) {
  const head = new DataView(await file.slice(0, 20).arrayBuffer());
  if (head.getUint32(0, true) !== 0x46546c67) throw new Error("VRM (glTF バイナリ) ではありません");
  const len = head.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(await file.slice(20, 20 + len).arrayBuffer()));
  const ext = json.extensions || {};
  const m1 = ext.VRMC_vrm?.meta, m0 = ext.VRM?.meta;
  if (!m1 && !m0) throw new Error("VRM の情報がありません (ただの glTF かもしれません)");
  return m1
    ? { version: "1.0", title: m1.name, author: (m1.authors || []).join(", "), license: m1.licenseUrl || "" }
    : { version: "0.x", title: m0.title, author: m0.author, license: m0.otherPermissionUrl || m0.licenseName || "" };
}

async function render() {
  const meta = (await chrome.storage.local.get(META_KEY))[META_KEY];
  const has = !!(meta && (await getFile("vrm")));
  $("#current").hidden = !has;
  $("#empty").hidden = has;
  if (has) {
    $("#name").textContent = meta.title || meta.fileName;
    $("#detail").textContent = [`VRM ${meta.version}`, meta.author && `作者: ${meta.author}`, `${(meta.size / 1048576).toFixed(1)}MB`].filter(Boolean).join(" · ");
    $("#license").hidden = !meta.license;
    if (meta.license) { $("#license").href = /^https?:/.test(meta.license) ? meta.license : "#"; $("#license").textContent = "利用規約: " + meta.license; }
    $("#enabled").checked = meta.enabled !== false;
  }
}

$("#file").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const msg = $("#msg");
  try {
    if (file.size > MAX) throw new Error("100MB より大きいファイルは入れられません");
    const meta = await readMeta(file);
    msg.textContent = "読み込んでいます…";
    await putFile("vrm", file);
    await chrome.storage.local.set({ [META_KEY]: { ...meta, fileName: file.name, size: file.size, enabled: true, at: Date.now() } });
    msg.textContent = `「${meta.title || file.name}」を設定しました。`;
  } catch (err) {
    msg.textContent = "入れられませんでした: " + err.message;
  }
  render();
});
$("#enabled").addEventListener("change", async e => {
  const meta = (await chrome.storage.local.get(META_KEY))[META_KEY];
  await chrome.storage.local.set({ [META_KEY]: { ...meta, enabled: e.target.checked, at: Date.now() } });
});
$("#remove").addEventListener("click", async () => {
  await deleteFile("vrm");
  await chrome.storage.local.remove(META_KEY);
  $("#msg").textContent = "キャラクターを外しました。";
  render();
});
chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && c[META_KEY]) render(); });
render();
