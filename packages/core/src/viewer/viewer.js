// 3D 展示の土台：描画・シーン・光・カメラを作り、ラック・入力・描画ループを始める（index.js の createKitArchive から使う）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ctx, items, state, listen, track, clearListeners } from './context.js';
import { setView } from './view.js';
import { initRack, updateFog } from './rack.js';
import { initInput } from './input.js';
import { updateItems } from './display-items.js';
import { stepSim, swayRack, updateSpin, runPendingRebuild, restoreRest, resetSim } from './cloth.js';
import { removeKitItem, texCache } from './kits.js';
import { modelCache } from './models.js';

export function initViewer(stage) {
  const renderer = ctx.renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // 表示先の要素いっぱいに広げる（使う側の CSS に頼らない）
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
  stage.prepend(renderer.domElement);

  const scene = ctx.scene = new THREE.Scene();
  function syncTheme() { scene.background = new THREE.Color(ctx.options.background() || '#dfe3e8'); }
  syncTheme();
  listen(matchMedia('(prefers-color-scheme: dark)'), 'change', syncTheme);
  const mo = new MutationObserver(syncTheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });   // class：ML_MyTeam のダークモード（.dark） track(() => mo.disconnect());

  scene.add(new THREE.HemisphereLight(0xffffff, 0x50545c, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.2, 1.5, 2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(-1.5, 0.5, -2); scene.add(rim);

  const camera = ctx.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  const controls = ctx.controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxDistance = 25;   // 遠くからバーの端が見えないように
  ctx.canvas = renderer.domElement; ctx.stage = stage;
  setView('angle');
  initRack();
  initInput();

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(stage); track(() => ro.disconnect());
  resize();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    runPendingRebuild();
    updateItems(dt);
    updateSpin(dt);
    stepSim(dt); swayRack();
    controls.update(); updateFog(); renderer.render(scene, camera);
  });
}
// 片付け：描画ループを止め、展示アイテム・読み込んだモデル・イベントの登録を外して、描画先から canvas を取り除く
// （同じページで createKitArchive をもう一度呼べる状態に戻す）
export function destroyViewer() {
  const { renderer } = ctx;
  if (!renderer) return;
  renderer.setAnimationLoop(null);
  for (const fn of ctx.cleanups.splice(0)) fn();
  restoreRest();
  for (const it of [...items]) removeKitItem(it);
  ctx.controls.dispose();
  ctx.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  modelCache.clear(); texCache.clear();
  renderer.dispose(); renderer.domElement.remove();
  resetSim();
  clearListeners();   // on で登録した通知も外す（作り直したら登録し直す）
  Object.assign(state, { selectedItem: null, simItem: null, grab: null, lastCollar: 2, autoRotateWanted: false, showHanger: true, showAxes: false, rackLayout: null, userSource: null });
  Object.assign(ctx, { renderer: null, scene: null, camera: null, controls: null, canvas: null, stage: null, options: null });
}
