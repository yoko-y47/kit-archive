// 追加画面のプレビュー：展示とは別のシーン・カメラ・描画で、標準の GLB に選んだ PNG を貼って見せる
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ctx, state, css, showShortSleeves } from 'kit-archive-core';
import { $ } from './util.js';

export const pv = { renderer: null, scene: null, camera: null, controls: null, obj: null, materials: [], tex: null };
export const setPreviewMsg = msg => { const el = $('previewMsg'); el.hidden = !msg; el.innerHTML = msg || ''; };
export function startPreview() {
  if (!pv.renderer) {
    const cv = $('previewCanvas');
    pv.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    pv.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    pv.renderer.outputColorSpace = THREE.SRGBColorSpace;
    pv.renderer.toneMapping = ctx.renderer.toneMapping; pv.renderer.toneMappingExposure = ctx.renderer.toneMappingExposure;
    pv.scene = new THREE.Scene();
    pv.scene.add(new THREE.HemisphereLight(0xffffff, 0x50545c, 1.6));
    const k = new THREE.DirectionalLight(0xffffff, 2.2); k.position.set(1.2, 1.5, 2); pv.scene.add(k);
    const r = new THREE.DirectionalLight(0xffffff, 0.8); r.position.set(-1.5, 0.5, -2); pv.scene.add(r);
    pv.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
    pv.controls = new OrbitControls(pv.camera, cv);
    pv.controls.enableDamping = true; pv.controls.enablePan = false; pv.controls.minDistance = 0.6; pv.controls.maxDistance = 5;
    pv.controls.autoRotate = true; pv.controls.autoRotateSpeed = 1.2;
    cv.addEventListener('pointerdown', () => { pv.controls.autoRotate = false; });
    new ResizeObserver(sizePreview).observe($('preview'));
  }
  pv.scene.background = new THREE.Color(css('--stage') || '#dfe3e8');
  sizePreview();
  pv.renderer.setAnimationLoop(() => { pv.controls.update(); pv.renderer.render(pv.scene, pv.camera); });
}
export function stopPreview() { pv.renderer?.setAnimationLoop(null); }
function sizePreview() {
  if (!pv.renderer) return;
  const el = $('preview'), w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  pv.renderer.setSize(w, h, false); pv.camera.aspect = w / h; pv.camera.updateProjectionMatrix();
}
// 展示と同じ組み立て（GLB の複製＋ハンガー。半袖・襟は展示と同じ規則）。生地の材質は複製して、展示中のアイテムには触れない
export function showPreviewModel(model) {
  if (!pv.renderer) startPreview();
  const g = new THREE.Group(), kit = model.scene.clone(true), kitRoot = kit.getObjectByName('kit_root') || kit;
  const mats = new Map();
  kit.traverse(o => {
    if (!o.isMesh || o.material.name !== 'Kit') return;
    if (!mats.has(o.material)) { const c = o.material.clone(); c.userData.orig = { map: o.material.map, color: o.material.color.clone() }; mats.set(o.material, c); }
    o.material = mats.get(o.material);
  });
  pv.materials = [...mats.values()];
  showShortSleeves(kitRoot);
  for (let i = 1; i <= 13; i++) { const n = kitRoot.getObjectByName('collar_' + i); if (n) n.visible = (i === state.lastCollar); }
  const hanger = model.hanger.clone(true); hanger.visible = state.showHanger;
  g.add(kit, hanger); pv.scene.add(g); pv.obj = g;
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.y, size.x / Math.max(pv.camera.aspect, 0.5)) * 0.62 / Math.tan(THREE.MathUtils.degToRad(pv.camera.fov) / 2);
  pv.controls.target.copy(c);
  pv.camera.position.set(c.x + r * Math.sin(0.5), c.y + r * 0.08, c.z + r * Math.cos(0.5));
  pv.controls.autoRotate = true; pv.controls.update();
  applyPreviewTexture();
}
// 選んだ PNG を貼る（null なら外す）。まだ選んでいなければ、GLB にもともと付いている見た目のまま
export function setPreviewTexture(tex) { pv.tex = tex; applyPreviewTexture(); }
function applyPreviewTexture() {
  const tex = pv.tex;
  for (const m of pv.materials) {
    if (tex) { m.map = tex; m.color.set(0xffffff); }
    else { m.map = m.userData.orig.map; m.color.copy(m.userData.orig.color); }
    m.needsUpdate = true;
  }
  if (pv.obj) setPreviewMsg(tex ? '' : 'キット画像（PNG）を選ぶと、標準のユニフォームに貼って表示します<br>（ドラッグで回転・ホイールで拡大）');
}
