// 3D 展示の入口：描画・シーン・光・カメラを作り、ラック・入力・描画ループを始める
// 使い方：initViewer(container) のあと、kits.js の connectStore(store) でデータとつなぐ
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ctx, css } from './context.js';
import { setView } from './view.js';
import { initRack, updateFog } from './rack.js';
import { initInput } from './input.js';
import { updateItems } from './display-items.js';
import { sim, stepSim, updateSpin, runPendingRebuild } from './cloth.js';

export function initViewer(stage) {
  const renderer = ctx.renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  stage.prepend(renderer.domElement);

  const scene = ctx.scene = new THREE.Scene();
  function syncTheme() { scene.background = new THREE.Color(css('--stage') || '#dfe3e8'); }
  syncTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

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
  new ResizeObserver(resize).observe(stage);
  resize();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    runPendingRebuild();
    updateItems(dt);
    updateSpin(dt);
    if (sim.built) stepSim(dt);
    controls.update(); updateFog(); renderer.render(scene, camera);
  });
}
