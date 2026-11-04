// GLB の読み込み：パスごとに1回だけ読み、肩の形の測定とハンガーの形もそのとき1回だけ作る
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { isStoredUrl } from '../data/sources/kit-storage.js';
import { ctx, state } from './context.js';
import { fitHanger, buildHanger, HANGER_BAR_GEO, HOOK_END_GEO } from './hanger.js';

export async function fetchModel(url) {
  if (isStoredUrl(url)) {   // 追加したユニフォームの GLB（IndexedDB / claude.ai に保存した本体）
    if (!state.userSource) throw new Error('保存先を開けないため読み込めません: ' + url);
    return state.userSource.readModel(url);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': ' + res.status);
  if (!url.endsWith('.b64.txt')) return res.arrayBuffer();
  const bin = atob((await res.text()).trim());
  const buf = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
  return buf.buffer;
}
// 試す URL はアプリが決める（options.resolveModelUrls）。保存先に入れた GLB（idb: / asset:）はそのまま
// 例：アーティファクトでは GLB を配信できないため、同じ名前の base64 テキスト（*.glb.b64.txt）を返す
const modelUrls = path => isStoredUrl(path) ? [path] : ctx.options.resolveModelUrls(path);
export const modelCache = new Map();   // GLB のパス → Promise<モデル>（同じ GLB は二度読まない）
export function loadModelRecord(path) {
  if (!modelCache.has(path)) modelCache.set(path, (async () => {
    let last;
    for (const url of modelUrls(path)) {
      try {
        return prepareModel(path, (await parseGlb(await fetchModel(url))).scene);
      } catch (e) { last = e; }
    }
    throw last;
  })());
  return modelCache.get(path);
}
export const parseGlb = buf => new Promise((ok, ng) => new GLTFLoader().parse(buf, '', ok, ng));
// 読み込んだ GLB から、肩の形の測定とハンガーの形を1回だけ作る
export function prepareModel(path, scene) {
  scene.traverse(o => { if (o.isMesh) o.material.side = THREE.DoubleSide; });
  const foreign = !scene.getObjectByName('kit_root');
  if (foreign) fitForeignModel(scene);
  const kitRoot = scene.getObjectByName('kit_root') || scene;
  const fit = fitHanger(kitRoot);
  return { path, scene, fit, foreign, ...buildHanger(fit) };
}
// このプロジェクトの書き出し（kit_root がある GLB）以外は、大きさと位置をこのプロジェクトの吊り下げ形に合わせる
// （丈 0.72m・上端 y=1.59m・左右と前後の中央。単位が cm などで極端な大きさのときだけ縮尺を変える）
function fitForeignModel(scene) {
  const root = new THREE.Group(); root.name = 'kit_root';
  root.add(...scene.children); scene.add(root);
  scene.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root), size = b.getSize(new THREE.Vector3());
  if (size.y > 0 && (size.y < 0.3 || size.y > 2.5)) root.scale.setScalar(0.72 / size.y);
  scene.updateMatrixWorld(true);
  b.setFromObject(root);
  const c = b.getCenter(new THREE.Vector3());
  root.position.add(new THREE.Vector3(-c.x, 1.59 - b.max.y, -0.045 - c.z));
  scene.updateMatrixWorld(true);
}
// 袖は半袖に統一（GLB に含まれる長袖パーツは表示しない）
export function showShortSleeves(r) {
  r.traverse(o => { if (o.userData.sleeve_type) o.visible = o.userData.sleeve_type === 'short'; });
}
// 展示に使わなかったモデルを片付ける（共有のハンガー部品は残す）
export function disposeModel(model) {
  const geos = new Set();
  model.scene.traverse(o => { if (o.isMesh) geos.add(o.geometry); });
  model.hanger.traverse(o => { if (o.isMesh && o.geometry !== HANGER_BAR_GEO && o.geometry !== HOOK_END_GEO) geos.add(o.geometry); });
  geos.forEach(g => g.dispose());
}
