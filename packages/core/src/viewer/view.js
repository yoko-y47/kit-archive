// 視点：「正面」「斜め」「横」「背面」と、ドラッグで回す方向（自由／左右だけ）
import * as THREE from 'three';
import { ctx, emit } from './context.js';

// 注視点と距離はラックの大きさから決める（layoutRack で更新）
export const TARGET = new THREE.Vector3(0, 1.1, 0);
export const LEVEL_POLAR = Math.atan2(1.9, 0.15);   // 視点の仰角（わずかに見下ろす。「左右だけ回転」ではこの高さに固定）
const VIEW_AZ = { front: 0, angle: Math.PI / 4.5, side: Math.PI / 2, back: Math.PI };
export const view = { dist: 3 };   // 視点の距離（ラックの大きさから決める）
export function setView(dir) {
  ctx.controls.target.copy(TARGET);
  ctx.camera.position.setFromSpherical(new THREE.Spherical(view.dist, LEVEL_POLAR, VIEW_AZ[dir])).add(TARGET);
  ctx.controls.update();
}
// ドラッグで回す方向：自由（上下左右）か、左右だけ
export function setOrbit(mode) {
  const yaw = mode === 'yaw';
  ctx.controls.minPolarAngle = yaw ? LEVEL_POLAR : 0;
  ctx.controls.maxPolarAngle = yaw ? LEVEL_POLAR : Math.PI;
  ctx.controls.update();
  emit('orbit', mode);
}
