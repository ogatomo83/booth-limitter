// キャラクターを描く (avatar.html の中。BOOTH のページに埋め込まれる拡張機能の枠)。
// 動きのデータは使わず、呼吸・まばたき・視線・表情・口をプログラムで動かす。
// 表情は今月の予算の残りで決める: 余裕 → にこにこ / 3 割を切った → 困り顔 / こえた → むっ。
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { getFile, META_KEY } from "./files.js";

const S = globalThis.Suki;
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(0.5, 1.5, 2);
scene.add(sun);
const lookTarget = new THREE.Object3D();
scene.add(lookTarget);

let vrm = null;
let hipsBaseY = 0;
let headY = 1.4, dist = 2;
let mood = "ok";
let talkUntil = 0, talkMood = null;
let nextBlink = 2, blinkT = -1;
const expr = { happy: 0, sad: 0, angry: 0, surprised: 0, aa: 0, blink: 0 };
const clock = new THREE.Clock();

function resize() {
  const w = innerWidth, h = innerHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (vrm) frame();
}
addEventListener("resize", resize);

/** 胸から上が枠に収まるようにカメラを置く */
function frame() {
  vrm.scene.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  const head = vrm.humanoid.getNormalizedBoneNode("head");
  const hips = vrm.humanoid.getNormalizedBoneNode("hips");
  head.getWorldPosition(p); headY = p.y;
  hips.getWorldPosition(p); const hipsY = p.y;
  // 胸から上 (表情が読める大きさに)
  const top = headY + (headY - hipsY) * 0.38;
  const bottom = hipsY + (headY - hipsY) * 0.3;
  const cy = (top + bottom) / 2, half = (top - bottom) / 2;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const byH = half / Math.tan(fov / 2);
  const byW = (half * 0.9) / (Math.tan(fov / 2) * camera.aspect);
  dist = Math.max(byH, byW) * 1.05;
  camera.position.set(0, cy, dist);
  camera.lookAt(0, cy, 0);
  lookTarget.position.set(0, headY, dist);
}

async function load() {
  const meta = (await chrome.storage.local.get(META_KEY))[META_KEY];
  const file = meta?.enabled === false ? null : await getFile("vrm");
  if (vrm) { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); vrm = null; }
  if (!file) { parent.postMessage({ type: "suki-avatar", ready: false }, "*"); return; }
  const loader = new GLTFLoader();
  loader.register(p => new VRMLoaderPlugin(p));
  try {
    const gltf = await loader.parseAsync(await file.arrayBuffer(), "");
    const v = gltf.userData.vrm;
    if (!v) throw new Error("VRM ではありません");
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(v);
    v.scene.traverse(o => { o.frustumCulled = false; });
    vrm = v;
    if (vrm.lookAt) vrm.lookAt.target = lookTarget;
    scene.add(vrm.scene);
    hipsBaseY = bone("hips")?.position.y ?? 0;
    restPose();
    resize();
    parent.postMessage({ type: "suki-avatar", ready: true }, "*");
  } catch (e) {
    console.error("[スキ値札] キャラクターを読めません", e);
    parent.postMessage({ type: "suki-avatar", ready: false, error: String(e.message || e) }, "*");
  }
}

const bone = n => vrm?.humanoid.getNormalizedBoneNode(n);
/** T ポーズから腕を下ろす */
function restPose() {
  bone("leftUpperArm")?.rotation.set(0, 0, -1.3);
  bone("rightUpperArm")?.rotation.set(0, 0, 1.3);
  bone("leftLowerArm")?.rotation.set(0, -0.25, 0);
  bone("rightLowerArm")?.rotation.set(0, 0.25, 0);
}

async function refreshMood() {
  const st = await S.load();
  const sm = S.summary(st);
  mood = S.mood(sm.remaining, sm.budget);
}

function setTargets(t) {
  const m = t < talkUntil && talkMood ? talkMood : mood;
  const want = { happy: 0, sad: 0, angry: 0, surprised: 0 };
  if (m === "ok") want.happy = t < talkUntil ? 0.8 : 0.35;
  if (m === "low") want.sad = 0.65;
  if (m === "over") { want.angry = 0.85; want.surprised = t < talkUntil ? 0.3 : 0; }
  return want;
}

function animate() {
  requestAnimationFrame(animate);
  if (!vrm) return;
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  const talking = t < talkUntil;

  // 呼吸と、ゆらゆら
  bone("spine")?.rotation.set(Math.sin(t * 1.6) * 0.025, 0, 0);
  bone("chest")?.rotation.set(Math.sin(t * 1.6 + 0.6) * 0.02, 0, 0);
  // 予算をこえていると、うつむき気味
  const down = (t < talkUntil && talkMood ? talkMood : mood) === "over" ? 0.12 : 0;
  bone("head")?.rotation.set(down, 0, Math.sin(t * 0.7) * 0.04 + (talking ? Math.sin(t * 6) * 0.05 : 0));
  // 囁くときはぴょこっと跳ねる
  const hips = bone("hips");
  if (hips) hips.position.y = hipsBaseY + (talking ? Math.abs(Math.sin(t * 7)) * 0.025 * Math.min(1, talkUntil - t) : 0);

  // まばたき
  if (blinkT < 0 && t > nextBlink) blinkT = 0;
  if (blinkT >= 0) {
    blinkT += dt;
    expr.blink = blinkT < 0.07 ? blinkT / 0.07 : Math.max(0, 1 - (blinkT - 0.07) / 0.1);
    if (blinkT > 0.17) { blinkT = -1; expr.blink = 0; nextBlink = t + 2 + Math.random() * 3.5; }
  }
  // 表情はなめらかに寄せる
  const want = setTargets(t);
  for (const k of ["happy", "sad", "angry", "surprised"]) expr[k] += (want[k] - expr[k]) * Math.min(1, dt * 6);
  expr.aa = talking ? Math.abs(Math.sin(t * 17)) * 0.7 : expr.aa * 0.8;
  const em = vrm.expressionManager;
  if (em) {
    for (const [k, v] of Object.entries(expr)) em.setValue(k, k === "blink" ? Math.max(v, 0) * (1 - expr.happy * 0.6) : v);
  }
  vrm.update(dt);
  renderer.render(scene, camera);
}

// BOOTH のページ (content.js) から: 囁く / マウスの位置
addEventListener("message", e => {
  if (e.source !== parent || !e.data || typeof e.data !== "object") return;
  if (e.data.type === "talk") {
    talkUntil = clock.elapsedTime + Math.min(5, (e.data.ms || 2200) / 1000);
    talkMood = ["ok", "low", "over"].includes(e.data.mood) ? e.data.mood : null;
  } else if (e.data.type === "look") {
    const x = Math.max(-1, Math.min(1, +e.data.x || 0)), y = Math.max(-1, Math.min(1, +e.data.y || 0));
    lookTarget.position.set(x * dist * 0.9, headY + y * dist * 0.5, dist);
  }
});

chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c[S.KEY]) refreshMood();
  if (c[META_KEY]) load();
});

refreshMood();
load();
animate();
