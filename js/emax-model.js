/**
 * /emax/model · 3D concept-car specimen (same chrome as /emax/pages, no reader)
 */
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function ap(path) {
  return window.assetPath(String(path).replace(/^\//, ''));
}

const HDR_URL =
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr';
const modelCfg = window.CVA_MODEL || {};
const MODEL_URL = modelCfg.url || 'models/ConceptCar_emax.glb?v=242';
const SPECIMEN = !!modelCfg.specimen;
const DRACO_PATH = 'vendor/three/examples/jsm/libs/draco/gltf/';

const VIEW_MARGIN = 1.12;
const DEFAULT_ROT_X = 0;
const DEFAULT_ROT_Y = 0;
const DEFAULT_ROT_Z = 0;
const MIN_ROT_X = -1.15;
const MAX_ROT_X = 1.15;
const CLOSED_FOV = 36;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2.4;
const LANDSCAPE_ZOOM_MAX = 3.05;
const ZOOM_STEP = 0.22;
const ZOOM_HOLD_DELAY = 320;
const ZOOM_HOLD_PER_SEC = 0.85;
const LANDSCAPE_ZOOM = 1.34;
const PHONE_MQ = window.CVA_MQ?.phone
  || '(max-width: 900px), (pointer: coarse) and (hover: none) and (max-height: 600px), (pointer: coarse) and (hover: none) and (orientation: landscape) and (max-width: 1100px), (max-width: 1100px) and (max-height: 600px) and (orientation: landscape)';
const PORTRAIT_MQ = window.CVA_MQ?.phonePortrait
  || '(max-width: 900px) and (orientation: portrait), (pointer: coarse) and (hover: none) and (orientation: portrait) and (max-width: 500px)';
const PHONE_LANDSCAPE_MQ = window.CVA_MQ?.phoneLandscape
  || '(max-width: 900px) and (orientation: landscape), (pointer: coarse) and (hover: none) and (orientation: landscape) and (max-width: 1100px), (max-width: 1100px) and (max-height: 600px) and (orientation: landscape)';
const DRAG_THRESHOLD = 6;
const LIGHT_MAT_NAMES = new Set([
  '材质.001',
  '材质.002',
  '材质.007',
  '材质.011',
  '材质.012',
]);
const BODY_MAT_NAMES = new Set(['Material.001', '材质.004']);
const PAINT = {
  black: null,
  silver: {
    color: 0xa3a8b0,
    metalness: 0.94,
    roughness: 0.22,
    envMapIntensity: 2.2,
  },
  white: {
    color: 0xdde3ea,
    metalness: 0.14,
    roughness: 0.34,
    envMapIntensity: 0.58,
  },
};

function emaxUrl() {
  return ap(modelCfg.home || 'emax/');
}

function emaxPagesUrl() {
  return ap(modelCfg.pages || 'emax/pages/');
}

const EmaxModel = (() => {
  let canvas = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let carGroup = null;
  let viewSphere = null;
  let pmrem = null;
  let rafId = 0;
  let active = false;
  let clock = null;

  let rotX = DEFAULT_ROT_X;
  let rotY = DEFAULT_ROT_Y;
  let rotZ = DEFAULT_ROT_Z;
  let targetRotX = DEFAULT_ROT_X;
  let targetRotY = DEFAULT_ROT_Y;
  let targetRotZ = DEFAULT_ROT_Z;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerMoved = false;
  let pointerCaptured = false;
  let pointers = new Map();
  let pinch = null;
  let gestureBase = 0;
  let lightMats = [];
  let lightsOn = true;
  let studioEnv = null;
  let configKey = 'default';
  let configToken = 0;
  let axleTarget = null;
  let defaultViewSphere = null;
  let bodyMats = [];
  let canopyMats = [];
  let seatMats = [];
  let ninebotMats = [];
  let gripMats = [];
  let bodyPaint = 'black';
  let viewZoom = 1;
  let zoomHold = null;
  let lastLandscape = null;
  let lastDrawW = 0;
  let lastDrawH = 0;
  let fitRaf = 0;

  function isPhoneLandscape() {
    return window.matchMedia(PHONE_LANDSCAPE_MQ).matches;
  }

  function isLandscapeLayout() {
    if (isPhoneLandscape()) return true;
    const vv = window.visualViewport;
    if (vv?.width && vv?.height) return vv.width > vv.height;
    return window.innerWidth > window.innerHeight;
  }

  function defaultZoom() {
    return isPhone() && isLandscapeLayout() ? LANDSCAPE_ZOOM : 1;
  }

  function zoomMax() {
    return isPhone() && isLandscapeLayout() ? LANDSCAPE_ZOOM_MAX : ZOOM_MAX;
  }

  function syncDefaultZoom() {
    const { w, h } = getDisplaySize();
    const landscape = isPhone() && w > h;
    if (lastLandscape === landscape) return false;
    lastLandscape = landscape;
    viewZoom = landscape ? LANDSCAPE_ZOOM : 1;
    return true;
  }

  function visualFrame() {
    const root = getComputedStyle(document.documentElement);
    const cssW = parseFloat(root.getPropertyValue('--reader-vvw'));
    const cssH = parseFloat(root.getPropertyValue('--reader-vvh'));
    const vv = window.visualViewport;
    const w = Number.isFinite(cssW) && cssW > 40
      ? cssW
      : Math.round(vv?.width || window.innerWidth || 0);
    const h = Number.isFinite(cssH) && cssH > 40
      ? cssH
      : Math.round(vv?.height || window.innerHeight || 0);
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  function getDisplaySize() {
    if (!canvas) return { w: 1, h: 1 };
    const r = canvas.getBoundingClientRect();
    let w = canvas.clientWidth || r.width;
    let h = canvas.clientHeight || r.height;
    if (w < 40 || h < 40) {
      const slot = canvas.closest('.detail-visual--book') || canvas.parentElement;
      const sr = slot?.getBoundingClientRect();
      w = Math.max(w, sr?.width || 0, 1);
      h = Math.max(h, sr?.height || 0, 1);
    }
    if (isPhone()) {
      const frame = visualFrame();
      if (h > frame.h + 1) h = frame.h;
      if (w > frame.w + 1) w = frame.w;
    }
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  function fitRenderer() {
    if (!renderer || !camera || !canvas) return false;
    const { w, h } = getDisplaySize();
    const bw = Math.round(w);
    const bh = Math.round(h);
    camera.aspect = bw / Math.max(1, bh);
    if (bw === lastDrawW && bh === lastDrawH) {
      camera.updateProjectionMatrix();
      return false;
    }
    lastDrawW = bw;
    lastDrawH = bh;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(bw, bh, false);
    camera.updateProjectionMatrix();
    return true;
  }

  function syncZoomButtons() {
    const wrap = document.getElementById('model-zoom');
    if (!wrap) return;
    const inn = wrap.querySelector('[data-zoom="in"]');
    const out = wrap.querySelector('[data-zoom="out"]');
    if (inn) inn.disabled = viewZoom >= zoomMax() - 1e-6;
    if (out) out.disabled = viewZoom <= ZOOM_MIN + 1e-6;
  }

  function fitCarToView() {
    if (!camera || !viewSphere) return;
    camera.fov = CLOSED_FOV;
    fitRenderer();
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * camera.aspect);
    const radius = viewSphere.radius * VIEW_MARGIN;
    const fitDist = Math.max(
      radius / Math.sin(vFov * 0.5),
      radius / Math.sin(hFov * 0.5),
    );
    const dist = fitDist / viewZoom;
    camera.near = Math.max(0.05, dist / 120);
    camera.far = Math.max(80, dist * 8);
    const deskDrop = SPECIMEN && !isPhone() ? radius * 0.22 : 0;
    camera.position.set(
      viewSphere.center.x,
      viewSphere.center.y - radius * 0.08 + deskDrop,
      viewSphere.center.z + dist,
    );
    camera.lookAt(
      viewSphere.center.x,
      viewSphere.center.y - radius * 0.07 + deskDrop,
      viewSphere.center.z,
    );
    camera.updateProjectionMatrix();
    syncZoomButtons();
    paintNow();
  }

  function paintNow() {
    if (!active || !renderer || !scene || !camera) return;
    if (carGroup) carGroup.rotation.set(rotX, rotY, rotZ);
    renderer.render(scene, camera);
  }

  function applyZoom(next) {
    const clamped = THREE.MathUtils.clamp(next, ZOOM_MIN, zoomMax());
    if (Math.abs(clamped - viewZoom) < 1e-6) {
      syncZoomButtons();
      return;
    }
    viewZoom = clamped;
    fitCarToView();
  }

  function nudgeZoom(dir) {
    applyZoom(viewZoom + dir * ZOOM_STEP);
  }

  function stopZoomHold(applyClick) {
    if (!zoomHold) return;
    const { dir, btn, holding, pointerId, timer } = zoomHold;
    if (timer) clearTimeout(timer);
    if (pointerId != null && btn) {
      try {
        btn.releasePointerCapture(pointerId);
      } catch (_) {}
    }
    btn?.classList.remove('is-pressed');
    zoomHold = null;
    if (applyClick && !holding) nudgeZoom(dir);
  }

  function tickZoomHold(dt) {
    if (!zoomHold?.holding) return;
    applyZoom(viewZoom + zoomHold.dir * ZOOM_HOLD_PER_SEC * dt);
  }

  function bindZoom() {
    const wrap = document.getElementById('model-zoom');
    if (!wrap || wrap.dataset.bound) return;
    wrap.dataset.bound = '1';
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    wrap.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('[data-zoom]');
      if (!btn || btn.disabled) return;
      if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
      e.preventDefault();
      stopZoomHold(false);
      btn.classList.add('is-pressed');
      btn.setPointerCapture?.(e.pointerId);
      zoomHold = {
        dir: btn.dataset.zoom === 'in' ? 1 : -1,
        btn,
        holding: false,
        pointerId: e.pointerId,
        timer: window.setTimeout(() => {
          if (!zoomHold) return;
          zoomHold.holding = true;
          zoomHold.timer = 0;
        }, ZOOM_HOLD_DELAY),
      };
    });
    wrap.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      stopZoomHold(true);
    });
    wrap.addEventListener('pointercancel', (e) => {
      e.stopPropagation();
      stopZoomHold(false);
    });
    wrap.querySelector('[data-reset-angle]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      targetRotX = DEFAULT_ROT_X;
      targetRotY = DEFAULT_ROT_Y;
      targetRotZ = DEFAULT_ROT_Z;
    });
  }

  function scheduleFit() {
    if (!active) return;
    if (fitRaf) return;
    fitRaf = requestAnimationFrame(() => {
      fitRaf = 0;
      if (!active) return;
      syncDefaultZoom();
      fitCarToView();
    });
  }

  function onResize() {
    scheduleFit();
  }

  function isPhone() {
    return window.matchMedia(PHONE_MQ).matches;
  }

  const portraitMq = window.matchMedia(PORTRAIT_MQ);

  function syncRotateHint() {
    const hint = document.getElementById('reader-rotate-hint');
    if (!hint) return;
    hint.hidden = !portraitMq.matches;
  }

  function onPortraitMqChange() {
    syncRotateHint();
    scheduleFit();
  }

  function applyReaderViewportHeight() {
    const vv = window.visualViewport;
    const h = Math.round(vv?.height || window.innerHeight || 0);
    const w = Math.round(vv?.width || window.innerWidth || 0);
    const root = document.documentElement;
    root.style.setProperty('--reader-vvh', `${h}px`);
    root.style.setProperty('--reader-vvw', `${w}px`);
  }

  function concealMobileBrowserChrome() {
    const land = window.matchMedia(PHONE_LANDSCAPE_MQ).matches;
    const phone = window.matchMedia(PHONE_MQ).matches;
    const html = document.documentElement;
    const body = document.body;
    html.classList.toggle('is-reader-landscape', land);
    if (!phone) {
      html.style.removeProperty('--reader-vvh');
      html.style.removeProperty('--reader-vvw');
      return;
    }
    applyReaderViewportHeight();
    if (!land) return;
    const lock = () => {
      window.scrollTo(0, 0);
      html.scrollTop = 0;
      body.scrollTop = 0;
      body.style.height = '';
      body.style.minHeight = '';
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      applyReaderViewportHeight();
    };
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    body.style.minHeight = 'calc(100lvh + 80px)';
    window.scrollTo(0, 1);
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      requestAnimationFrame(lock);
    });
    window.setTimeout(lock, 280);
    window.setTimeout(lock, 800);
  }

  function onViewportChrome() {
    if (isPhone()) applyReaderViewportHeight();
    scheduleFit();
  }

  function onOrientationChange() {
    syncRotateHint();
    concealMobileBrowserChrome();
    scheduleFit();
  }

  function bindBarLink(id, urlFn) {
    const el = document.getElementById(id);
    if (!el || el.dataset.pressBound) return;
    el.dataset.pressBound = '1';
    const pressOn = (e) => {
      if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
      el.classList.add('is-pressed');
    };
    const pressOff = () => el.classList.remove('is-pressed');
    el.addEventListener('pointerdown', pressOn);
    el.addEventListener('pointerup', pressOff);
    el.addEventListener('pointercancel', pressOff);
    el.addEventListener('pointerleave', pressOff);
    el.addEventListener('click', (e) => {
      e.preventDefault();
      el.classList.remove('is-pressed');
      const url = urlFn();
      if (window.Motion?.pageExit) Motion.pageExit(url, 0);
      else location.assign(url);
    });
  }

  function bindBack() {
    bindBarLink('book-reader-back', emaxUrl);
    bindBarLink('model-pages-open', emaxPagesUrl);
  }

  function isNinebotMat(m) {
    return !!m && m.name === 'ninebot';
  }

  function isSeatMat(m) {
    return !!m && m.name === '材质.006';
  }

  function prepareSeatSilver(m, envMap) {
    if (!isSeatMat(m) || m.userData.seatSilver) return;
    m.userData.seatSilver = true;
    m.color.setHex(0xd6dae0);
    m.metalness = 0.52;
    m.roughness = 0.40;
    m.metalnessMap = null;
    m.roughnessMap = null;
    if (envMap && 'envMap' in m) {
      m.envMap = envMap;
      m.envMapIntensity = 0.42;
    }
    m.needsUpdate = true;
  }

  function prepareNinebotLight(m) {
    if (!isNinebotMat(m) || m.userData.ninebotLight) return;
    m.userData.ninebotLight = true;
    /* The word lives in the texture alpha. RGB is black, so the letters
       only show through emissive. The sheet also intersects the side shell. */
    m.color.setHex(0x000000);
    m.metalness = 0;
    m.roughness = 1;
    m.metalnessMap = null;
    m.roughnessMap = null;
    m.emissive.set(0xffffff);
    m.emissiveIntensity = 1;
    m.transparent = true;
    m.alphaTest = 0.45;
    m.depthWrite = true;
    m.side = THREE.DoubleSide;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -4;
    m.envMapIntensity = 0;
    m.toneMapped = false;
    m.needsUpdate = true;
  }

  function tuneBodyFlake(m) {
    /* Blender scales the flake 30× and keeps the normal at 0.1.
       The export left both at 1, so a close, glancing view turns the
       E MAX mark into a few huge sparkles. */
    if (!m || m.name !== '材质.004' || m.userData.flakeTuned) return;
    m.userData.flakeTuned = true;
    const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8;
    const repeatTex = (tex) => {
      if (!tex || tex.userData.flakeRepeat) return;
      tex.userData.flakeRepeat = true;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(30, 30);
      tex.anisotropy = Math.min(8, maxAniso);
      tex.needsUpdate = true;
    };
    repeatTex(m.normalMap);
    repeatTex(m.roughnessMap);
    repeatTex(m.metalnessMap);
    if (m.normalScale) m.normalScale.set(0.1, 0.1);
  }

  function liftNinebotDecals(root) {
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (!mats.some(isNinebotMat)) return;
      const center = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      const dir = Math.sign(center.z) || 1;
      const origin = obj.getWorldPosition(new THREE.Vector3());
      origin.z += dir * 0.008;
      obj.parent?.worldToLocal(origin);
      obj.position.copy(origin);
    });
  }

  function isCarLightMaterial(m) {
    if (!m || isNinebotMat(m)) return false;
    if (LIGHT_MAT_NAMES.has(m.name)) return true;
    if (!m.emissive) return false;
    const glow = m.emissive.r + m.emissive.g + m.emissive.b;
    return glow > 0.05 && (m.emissiveIntensity || 0) > 0.5;
  }

  function collectCarLights(root) {
    const seen = new Set();
    lightMats = [];
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || seen.has(m) || !isCarLightMaterial(m)) continue;
        seen.add(m);
        lightMats.push({
          mat: m,
          intensity: m.emissiveIntensity,
          color: m.emissive.clone(),
        });
      }
    });
  }

  function paintKeepsNinebotBlack() {
    return bodyPaint === 'silver' || bodyPaint === 'white';
  }

  function applyNinebotMark() {
    const forceBlack = paintKeepsNinebotBlack();
    for (const item of ninebotMats) {
      const m = item.mat;
      if (forceBlack) {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
        if (m.color) m.color.setHex(0x000000);
      } else {
        m.emissive.copy(item.color);
        m.emissiveIntensity = item.intensity;
        if (item.baseColor) m.color.copy(item.baseColor);
      }
      m.needsUpdate = true;
    }
  }

  function applySeats() {
    const dark = bodyPaint === 'white' || bodyPaint === 'silver';
    for (const item of seatMats) {
      const m = item.mat;
      if (dark) {
        m.color.setHex(0x0b0b0d);
        m.metalness = 0.08;
        m.roughness = 0.62;
        m.envMapIntensity = 0.16;
        m.map = null;
        m.metalnessMap = null;
        m.roughnessMap = null;
      } else {
        m.color.copy(item.color);
        m.metalness = item.metalness;
        m.roughness = item.roughness;
        m.envMapIntensity = item.envMapIntensity;
        m.map = item.map;
        m.metalnessMap = item.metalnessMap;
        m.roughnessMap = item.roughnessMap;
      }
      m.needsUpdate = true;
    }
  }

  function applyGrips() {
    const silver = bodyPaint === 'silver';
    for (const m of gripMats) {
      if (silver) {
        m.color.setHex(PAINT.silver.color);
        m.metalness = 0.94;
        m.roughness = 0.22;
        m.envMapIntensity = 2.2;
        if ('clearcoat' in m) {
          m.clearcoat = 0.22;
          m.clearcoatRoughness = 0.16;
        }
      } else {
        m.color.setHex(0x0c0c0c);
        m.metalness = 0.15;
        m.roughness = 0.28;
        m.envMapIntensity = 0.26;
        if ('clearcoat' in m) {
          m.clearcoat = 0.35;
          m.clearcoatRoughness = 0.22;
        }
      }
      m.needsUpdate = true;
    }
  }

  function applyLights(on) {
    lightsOn = on;
    for (const item of lightMats) {
      if (on) {
        item.mat.emissive.copy(item.color);
        item.mat.emissiveIntensity = item.intensity;
        if (item.onColor) item.mat.color.copy(item.onColor);
        for (const bulb of item.bulbs || []) bulb.intensity = item.bulbIntensity || 0;
      } else if (item.offIntensity > 0) {
        item.mat.emissive.copy(item.offGlow || item.color);
        item.mat.emissiveIntensity = item.offIntensity;
        if (item.offColor) item.mat.color.copy(item.offColor);
        for (const bulb of item.bulbs || []) bulb.intensity = 0;
      } else {
        item.mat.emissive.setHex(0x000000);
        item.mat.emissiveIntensity = 0;
        if (item.offColor) item.mat.color.copy(item.offColor);
        for (const bulb of item.bulbs || []) bulb.intensity = 0;
      }
      item.mat.needsUpdate = true;
    }
    if (!SPECIMEN) applyNinebotMark();
    const root = document.getElementById('model-lights');
    if (root) {
      root.querySelectorAll('[data-lights]').forEach((btn) => {
        const active = btn.dataset.lights === (on ? 'on' : 'off');
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }

  function snapshotMat(m) {
    return {
      mat: m,
      color: m.color.clone(),
      metalness: m.metalness,
      roughness: m.roughness,
      envMapIntensity: m.envMapIntensity,
      map: m.map || null,
      metalnessMap: m.metalnessMap || null,
      roughnessMap: m.roughnessMap || null,
    };
  }

  function collectNamedMats(root, test, bucket) {
    const seen = new Set();
    bucket.length = 0;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || seen.has(m) || !test(m)) continue;
        seen.add(m);
        bucket.push(snapshotMat(m));
      }
    });
  }

  function collectBodyPaint(root) {
    collectNamedMats(root, (m) => BODY_MAT_NAMES.has(m.name), bodyMats);
  }

  function collectSeats(root) {
    collectNamedMats(root, isSeatMat, seatMats);
  }

  function collectNinebot(root) {
    const seen = new Set();
    ninebotMats = [];
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || seen.has(m) || !isNinebotMat(m)) continue;
        seen.add(m);
        ninebotMats.push({
          mat: m,
          intensity: m.emissiveIntensity,
          color: m.emissive ? m.emissive.clone() : new THREE.Color(0xffffff),
          baseColor: m.color ? m.color.clone() : new THREE.Color(0xffffff),
        });
      }
    });
  }

  function applyCanopy(paint) {
    const clear = paint === 'silver';
    for (const m of canopyMats) {
      if (clear) {
        m.color.setHex(0x6d7884);
        m.opacity = 0.26;
        m.roughness = 0.07;
        m.clearcoat = 1;
        m.clearcoatRoughness = 0.06;
        m.envMapIntensity = 1.15;
        m.transparent = true;
        m.transmission = 0;
      } else {
        m.color.setHex(0x000000);
        m.opacity = 0.46;
        m.roughness = 0.14;
        m.clearcoat = 0.85;
        m.clearcoatRoughness = 0.12;
        m.envMapIntensity = 0.32;
        m.transparent = true;
        m.transmission = 0;
      }
      m.needsUpdate = true;
    }
  }

  function applyBodyPaint(paint) {
    bodyPaint = PAINT[paint] ? paint : 'black';
    const preset = PAINT[bodyPaint];
    for (const item of bodyMats) {
      const m = item.mat;
      if (!preset) {
        m.color.copy(item.color);
        m.metalness = item.metalness;
        m.roughness = item.roughness;
        m.envMapIntensity = item.envMapIntensity;
        m.map = item.map;
        m.metalnessMap = item.metalnessMap;
        m.roughnessMap = item.roughnessMap;
        if ('clearcoat' in m) m.clearcoat = 0;
      } else {
        m.color.setHex(preset.color);
        m.metalness = preset.metalness;
        m.roughness = preset.roughness;
        m.envMapIntensity = preset.envMapIntensity;
        m.map = null;
        m.metalnessMap = null;
        m.roughnessMap = null;
        if ('clearcoat' in m) {
          m.clearcoat = bodyPaint === 'silver' ? 0.22 : 0;
          m.clearcoatRoughness = bodyPaint === 'silver' ? 0.16 : 0.4;
        }
      }
      if (m.name === '材质.004' && m.normalScale) {
        m.normalScale.set(0.1, 0.1);
      }
      m.needsUpdate = true;
    }
    applyCanopy(bodyPaint);
    applySeats();
    applyGrips();
    applyNinebotMark();
    const root = document.getElementById('model-paint');
    if (!root) return;
    root.querySelectorAll('[data-paint]').forEach((btn) => {
      const active = btn.dataset.paint === bodyPaint;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function bindGroupToggle(id, attr, apply) {
    const root = document.getElementById(id);
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    root.addEventListener('click', (e) => {
      const btn = e.target.closest(`[data-${attr}]`);
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      apply(btn.dataset[attr]);
    });
  }

  function bindLightsToggle() {
    lightsOn = true;
    bindGroupToggle('model-lights', 'lights', (value) => applyLights(value === 'on'));
    applyLights(true);
  }

  function bindPaintToggle() {
    bodyPaint = 'black';
    bindGroupToggle('model-paint', 'paint', (value) => applyBodyPaint(value));
    applyBodyPaint('black');
  }

  const CONFIG_URL = {
    default: 'models/ConceptCar_next_SH.glb?v=286',
    paris: 'alternative1/ConceptCar_next_PR.glb?v=290',
    newyork: 'alternative2/ConceptCar_next_TK.glb?v=241',
    newzealand: 'alternative2/ConceptCar_next_LA.glb',
  };

  function syncConfigButtons(key) {
    const root = document.getElementById('model-config');
    if (!root) return;
    root.querySelectorAll('[data-config]').forEach((btn) => {
      const active = btn.dataset.config === key;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function bindConfigToggle() {
    const root = document.getElementById('model-config');
    if (!root) return;
    const current = root.querySelector('[data-config].is-active');
    configKey = current?.dataset.config || 'default';
    syncConfigButtons(configKey);
    bindGroupToggle('model-config', 'config', (value) => applyConfig(value));
  }

  function disposeHierarchy(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
          const tex = m[key];
          if (tex && tex !== studioEnv) tex.dispose?.();
        }
        m.dispose?.();
      }
    });
  }

  /* The cargo trapezoid is a smoked sheet. One side was exported on the
     seat material, so it has to leave that material before the seat color. */
  /* Shanghai and Paris keep the materials exported from the blend. */
  function usesSourceMaterials(key) {
    return SPECIMEN && (key === 'default' || key === 'paris');
  }

  function tuneCargoWindow(obj) {
    if (usesSourceMaterials(configKey)) return;
    if (configKey !== 'paris') return;
    const id = (obj.name || '').replace(/\./g, '');
    if (id !== 'shell#1539' && id !== 'shell#1542') return;
    const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setRGB(0.407, 0.223, 0.223),
      metalness: 0,
      roughness: 0.32,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      clearcoat: 0.55,
      clearcoatRoughness: 0.2,
      envMap: studioEnv || src?.envMap || null,
      envMapIntensity: 0.28,
      transmission: 0,
    });
    m.name = 'cargo-window';
    obj.material = m;
    obj.renderOrder = 6;
  }

  /* City blacks sit on a black page. Lift only the near-black, neutral
     materials so the body paint and decals stay as exported. */
  function liftCityBlack(m) {
    if (!m.color || m.map || m.userData.cityBlack) return;
    const max = Math.max(m.color.r, m.color.g, m.color.b);
    const min = Math.min(m.color.r, m.color.g, m.color.b);
    if (max > 0.02 || max - min > 0.02) return;
    const floor = 0.036;
    if (max < 1e-4) m.color.setRGB(floor, floor, floor);
    else m.color.multiplyScalar(floor / max);
    if (m.metalness > 0.8) {
      m.metalness = 0.62;
      if (m.roughness < 0.4) m.roughness = 0.4;
    }
    m.userData.cityBlack = true;
  }

  function hideOversized(root) {
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      if (Math.max(size.x, size.y, size.z) > 8) obj.visible = false;
    });
  }

  /* The rear lens is a zero-thickness, fully transmissive sheet that cuts
     through the LED bar. A slope-scaled polygon offset pulls the beads back
     through that glass as the car turns, so the bar crawls. Keep a fixed
     gap instead, and draw only the outward face of each pill. */
  function settleTailLamp(obj, m) {
    m.side = THREE.FrontSide;
    m.metalness = 0;
    m.roughness = 1;
    m.depthWrite = true;
    m.depthTest = true;
    m.polygonOffset = false;
    m.transparent = false;
    m.envMapIntensity = 0;
    if ((m.emissiveIntensity || 0) > 8) m.emissiveIntensity = 4.2;
    if (obj.userData.tailLifted) return;
    obj.userData.tailLifted = true;
    obj.updateWorldMatrix(true, false);
    const origin = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    origin.z += 0.0045;
    obj.parent?.worldToLocal(origin);
    obj.position.copy(origin);
  }

  /* Same sheet is double-sided, so both skins share one depth and the
     transmission pass redraws the inner skin every frame. Normals on the
     rear face already point outward. */
  function settleTailLens(obj, m) {
    m.side = THREE.FrontSide;
    m.polygonOffset = false;
    m.depthWrite = true;
    m.transparent = false;
    obj.renderOrder = 1;
  }

  function faceOutward(obj, m) {
    obj.updateWorldMatrix(true, false);
    const normalAttr = obj.geometry?.getAttribute('normal');
    const n = new THREE.Vector3(0, 0, 1);
    if (normalAttr) n.fromBufferAttribute(normalAttr, 0).transformDirection(obj.matrixWorld);
    const pos = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    const outward = pos.sub(new THREE.Vector3(0, 0.5, 0));
    if (outward.lengthSq() < 1e-8) outward.set(0, 0, 1);
    m.side = n.dot(outward) >= 0 ? THREE.FrontSide : THREE.BackSide;
  }

  function ownMaterial(obj) {
    const src = obj.material;
    if (!src || Array.isArray(src)) return null;
    if (src.userData.flickerSettled) return src;
    const m = src.clone();
    m.userData.flickerSettled = true;
    obj.material = m;
    return m;
  }

  /* The shipped WebPs crushed the lattice, the white stroke, and the
     signature into broken dashes. Swap in art resampled from the source
     plates, and pull each sheet off the red shell so the two don't fight. */
  function liftParisDecal(obj, distance) {
    if (obj.userData.parisLifted) return;
    obj.userData.parisLifted = true;
    const geo = obj.geometry?.clone();
    const pos = geo?.getAttribute('position');
    const nor = geo?.getAttribute('normal');
    if (!pos || !nor) return;
    obj.updateWorldMatrix(true, false);
    const worldScale = new THREE.Vector3().setFromMatrixColumn(obj.matrixWorld, 0).length() || 1;
    const local = distance / worldScale;
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      n.fromBufferAttribute(nor, i);
      if (n.lengthSq() < 1e-8) continue;
      n.normalize().multiplyScalar(local);
      pos.setXYZ(i, pos.getX(i) + n.x, pos.getY(i) + n.y, pos.getZ(i) + n.z);
    }
    pos.needsUpdate = true;
    obj.geometry = geo;
  }

  function sharpenParisDecals(root) {
    const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8;
    const token = configToken;
    const jobs = [
      ['1', 'alternative1/paris-panel-pattern.webp?v=1', true, 3, 0.0012],
      ['2', 'alternative1/paris-panel-stroke.webp?v=1', false, 3, 0.0012],
      ['_隔离模式', 'alternative1/paris-panel-sign.webp?v=1', false, 6, 0.004],
      ['_隔离模式2', 'alternative1/paris-panel-sign2.webp?v=1', false, 6, 0.004],
    ];
    for (const [name, url, mips, order, lift] of jobs) {
      const tex = new THREE.TextureLoader().load(ap(url), (loaded) => {
        if (token !== configToken) {
          loaded.dispose();
          return;
        }
        loaded.needsUpdate = true;
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = maxAniso;
      tex.generateMipmaps = mips;
      tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      root.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        let changed = false;
        const next = list.map((src) => {
          if (!src || (src.name || '') !== name) return src;
          changed = true;
          const m = src.clone();
          m.name = name;
          m.map = tex;
          m.metalness = 0;
          m.roughness = 1;
          m.metalnessMap = null;
          m.roughnessMap = null;
          m.envMapIntensity = 0;
          m.transparent = true;
          m.depthWrite = false;
          const sign = name.startsWith('_隔离模式');
          m.polygonOffset = sign;
          m.polygonOffsetFactor = sign ? -6 : 0;
          m.polygonOffsetUnits = sign ? -6 : 0;
          if ('clearcoat' in m) m.clearcoat = 0;
          return m;
        });
        if (!changed) return;
        obj.material = Array.isArray(obj.material) ? next : next[0];
        obj.renderOrder = order;
        liftParisDecal(obj, lift);
      });
    }
  }

  /* The tire rubber is already black. A stain map was exported into the
     metalness slot, which turns the tread into chrome. Drop that map only. */
  function settleSourceTires(root) {
    const settled = new Map();
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material || Array.isArray(obj.material)) return;
      const src = obj.material;
      if (!/轮胎/.test(src.name || '')) return;
      let m = settled.get(src);
      if (!m) {
        m = src.clone();
        m.metalness = 0;
        m.roughness = 0.86;
        const normalName = m.normalMap?.name || '';
        if (m.normalMap && m.metalnessMap && (m.normalMap.image === m.metalnessMap.image || /Stain|OVERLAY/i.test(normalName))) {
          m.normalMap = null;
        }
        m.metalnessMap = null;
        m.roughnessMap = null;
        if ('clearcoat' in m) m.clearcoat = 0;
        if ('transmission' in m) m.transmission = 0;
        m.envMapIntensity = 0.14;
        m.needsUpdate = true;
        settled.set(src, m);
      }
      obj.material = m;
    });
  }

  /* Metal009 is the silver side rail. The loader strips dots, so
     shell#42.001 is shell#42001 (rear fender cover) and shell#43.001 is
     shell#43001 (the brushed grille bar in front of it, Metal013). */
  function paintBlack(obj, roughness) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((src) => {
      if (!src) return src;
      const m = src.clone();
      m.name = `${obj.name}-black`;
      applyCharcoal(m, roughness, 0);
      m.normalMap = null;
      m.envMapIntensity = 0;
      return m;
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
  }

  function settleSourceRail(root) {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (obj.name === 'shell#42001' || obj.name === 'shell#43001') {
        paintBlack(obj, 1);
        return;
      }
      if (Array.isArray(obj.material)) return;
      if ((obj.material.name || '') !== 'Metal009') return;
      const m = obj.material.clone();
      m.name = 'Metal009';
      applyCharcoal(m, 0.46, 0.1);
      obj.material = m;
    });
  }

  /* The suede averages about 34/255. A short lift keeps the grain and
     takes the cushion one step off black. */
  function liftSeatGrain(tex) {
    if (!tex?.image || tex.userData.seatLifted) return;
    const img = tex.image;
    const w = img.width;
    const h = img.height;
    if (!w || !h) return;
    tex.userData.seatLifted = true;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] * 1.22 + 6);
      d[i + 1] = Math.min(255, d[i + 1] * 1.22 + 6);
      d[i + 2] = Math.min(255, d[i + 2] * 1.22 + 6);
    }
    ctx.putImageData(imageData, 0, 0);
    tex.image = canvas;
    tex.needsUpdate = true;
  }

  /* 坐垫 翻毛皮 is a dark suede map, but the normal slot holds a grayscale
     roughness image. That tilt turns the whole cushion into a silver highlight. */
  function settleShanghaiSeat(root) {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      let hit = false;
      const next = mats.map((src) => {
        if (!src || (src.name || '') !== '坐垫 翻毛皮') return src;
        hit = true;
        const m = src.clone();
        m.name = '坐垫 翻毛皮';
        m.normalMap = null;
        m.metalness = 0;
        m.roughness = 0.92;
        m.metalnessMap = null;
        m.roughnessMap = null;
        m.envMapIntensity = 0.05;
        if ('specularIntensity' in m) m.specularIntensity = 0.04;
        if ('clearcoat' in m) m.clearcoat = 0;
        liftSeatGrain(m.map);
        return m;
      });
      if (hit) obj.material = Array.isArray(obj.material) ? next : next[0];
    });
  }

  /* The front console lid is FILLET_PIECE#2872. It shares a lamp material,
     so the cover renders solid white. It should be dark glass. */
  function makeShanghaiCoverGlass(envMap) {
    /* Neutral gray. The old 0x262a30 plus the cool studio light read as blue. */
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x3a3a3a,
      metalness: 0,
      roughness: 0.14,
      transmission: 0,
      transparent: true,
      opacity: 0.8,
      depthWrite: true,
      clearcoat: 0.4,
      clearcoatRoughness: 0.16,
      envMap: envMap || null,
      envMapIntensity: 0.28,
      specularIntensity: 0.4,
      side: THREE.DoubleSide,
    });
    mat.name = 'shanghai-cover-glass';
    return mat;
  }

  /* The rear lip of the deck tray sits on the seat and the body shell.
     At some angles those faces trade depth and the lip breaks into slivers. */
  function settleShanghaiDeckLip(root) {
    const world = new THREE.Vector3();
    const back = new THREE.Matrix4();
    root.traverse((obj) => {
      if (!obj.isMesh || obj.name !== 'shell#60.001') return;
      const geo = obj.geometry?.clone();
      const pos = geo?.getAttribute('position');
      if (!pos) return;
      obj.updateWorldMatrix(true, false);
      back.copy(obj.matrixWorld).invert();
      for (let i = 0; i < pos.count; i += 1) {
        world.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        const t = Math.min(1, Math.max(0, (world.z - 0.62) / 0.05));
        if (t <= 0) continue;
        world.z -= 0.0008 * t;
        world.applyMatrix4(back);
        pos.setXYZ(i, world.x, world.y, world.z);
      }
      pos.needsUpdate = true;
      obj.geometry = geo;
    });
  }

  function settleShanghaiCover(root) {
    root.traverse((obj) => {
      if (!obj.isMesh || obj.name !== 'FILLET_PIECE#2872') return;
      obj.material = makeShanghaiCoverGlass(studioEnv);
    });
  }

  /* Polished titanium is the bright silver. Both shades share one softer metal. */
  function settleShanghaiSilver(root) {
    const tuned = new Map();
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      let changed = false;
      const next = list.map((src) => {
        if (!src || !/^0钛抛光/.test(src.name || '')) return src;
        changed = true;
        let m = tuned.get(src);
        if (!m) {
          m = src.clone();
          m.name = src.name;
          m.color.setRGB(0.8, 0.8, 0.74, THREE.LinearSRGBColorSpace);
          m.roughness = 0.22;
          m.metalness = 0.84;
          m.envMapIntensity = 0.72;
          if ('clearcoat' in m) m.clearcoat = 0;
          tuned.set(src, m);
        }
        return m;
      });
      if (changed) obj.material = Array.isArray(obj.material) ? next : next[0];
    });
  }

  /* The harness export is one red run and one blue run. Both read as black cable. */
  function settleShanghaiWires(root) {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material || Array.isArray(obj.material)) return;
      const name = obj.material.name || '';
      if (name !== '线束' && name !== '线束.001') return;
      const m = obj.material.clone();
      m.name = name;
      m.color.setRGB(0.02, 0.02, 0.02, THREE.LinearSRGBColorSpace);
      m.metalness = 0;
      m.roughness = 0.5;
      m.metalnessMap = null;
      m.roughnessMap = null;
      if (m.emissive) m.emissive.setHex(0x000000);
      if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
      obj.material = m;
    });
  }

  /* Flat ink of 概念车-侧板丝印04, the side print. sRGB 40,80,144. */
  const SHANGHAI_SIDE_BLUE = [40, 80, 144];

  function isShanghaiBlue(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 0.12 || max < 0.15 || max !== b) return false;
    let hue = ((r - g) / delta + 4) * 60;
    if (hue < 0) hue += 360;
    return hue >= 190 && hue <= 270;
  }

  function paintSideBlue(color) {
    if (!color || !color.getHSL) return;
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    if (hsl.s < 0.18) return;
    const deg = hsl.h * 360;
    if (deg < 190 || deg > 270) return;
    color.setRGB(0.021, 0.080, 0.279, THREE.LinearSRGBColorSpace);
  }

  function rehueShanghaiInk(tex) {
    if (!tex?.image) return 0;
    if (tex.userData.shanghaiBlue) return tex.userData.shanghaiInk || 0;
    const img = tex.image;
    const w = img.width;
    const h = img.height;
    if (!w || !h) return 0;
    tex.userData.shanghaiBlue = true;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    const [tr, tg, tb] = SHANGHAI_SIDE_BLUE;
    let changed = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 16) continue;
      if (!isShanghaiBlue(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255)) continue;
      d[i] = tr;
      d[i + 1] = tg;
      d[i + 2] = tb;
      changed += 1;
    }
    tex.userData.shanghaiInk = changed;
    if (!changed) return 0;
    ctx.putImageData(imageData, 0, 0);
    tex.image = canvas;
    tex.needsUpdate = true;
    return changed;
  }

  function settleShanghaiBlue(root) {
    const seen = new Set();
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        const name = m.name || '';
        if (name === '线束' || name === '线束.001') continue;
        if (name === '蓝色丝印' || name.startsWith('高亮蓝')) {
          /* These solids sit in shade, so a lit color never matches the print.
             Paint the side-ink pigment flat. */
          m.color.setRGB(0, 0, 0);
          m.emissive = m.emissive || new THREE.Color();
          m.emissive.setRGB(40 / 255, 80 / 255, 144 / 255, THREE.SRGBColorSpace);
          m.emissiveIntensity = 1;
          m.metalness = 0;
          m.roughness = 1;
          m.metalnessMap = null;
          m.roughnessMap = null;
          if ('clearcoat' in m) m.clearcoat = 0;
          m.envMapIntensity = 0;
        } else {
          paintSideBlue(m.color);
        }
        if (m.map) rehueShanghaiInk(m.map);
        if (m.emissiveMap && m.emissiveMap !== m.map) rehueShanghaiInk(m.emissiveMap);
        m.needsUpdate = true;
      }
    });
  }

  /* The hub print is a second file, so it used to start downloading only
     after the car was already on screen. Load it with the car. */
  let hubDecalScene = null;
  let hubDecalPromise = null;
  let hubTicksTex = null;
  let hubTicksPromise = null;

  function preloadShanghaiHub() {
    if (!hubDecalPromise) {
      hubDecalPromise = loadGltf(ap('alternative1/sh-hub-decal.glb?v=1')).then((gltf) => {
        prepareHubDecal(gltf.scene);
        hubDecalScene = gltf.scene;
        return gltf.scene;
      }).catch((err) => {
        hubDecalPromise = null;
        throw err;
      });
    }
    if (!hubTicksPromise) {
      hubTicksPromise = new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(
          ap('alternative1/sh-hub-ticks.webp?v=1'),
          (tex) => {
            tex.flipY = false;
            tex.colorSpace = THREE.SRGBColorSpace;
            hubTicksTex = tex;
            resolve(tex);
          },
          undefined,
          (err) => {
            hubTicksPromise = null;
            reject(err);
          },
        );
      });
    }
  }

  function prepareHubDecal(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const map = src?.map || null;
      if (map) {
        map.flipY = false;
        map.colorSpace = THREE.SRGBColorSpace;
        rehueShanghaiInk(map);
        map.needsUpdate = true;
      }
      /* Ink sits on the titanium. A basic pass keeps the print from
         picking up the chrome, and a hair of normal offset clears the
         coplanar metal that polygon offset alone still loses. */
      obj.material = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
      });
      obj.renderOrder = 8;
      const geo = obj.geometry?.clone();
      const pos = geo?.attributes?.position;
      const nor = geo?.attributes?.normal;
      if (!pos || !nor) return;
      for (let i = 0; i < pos.count; i += 1) {
        pos.setXYZ(
          i,
          pos.getX(i) + nor.getX(i) * 0.0012,
          pos.getY(i) + nor.getY(i) * 0.0012,
          pos.getZ(i) + nor.getZ(i) * 0.0012,
        );
      }
      pos.needsUpdate = true;
      obj.geometry = geo;
    });
  }

  function spawnHubDecal(source) {
    const decal = source.clone(true);
    const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8;
    decal.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry = obj.geometry.clone();
      const m = obj.material.clone();
      if (m.map) {
        m.map = m.map.clone();
        m.map.anisotropy = maxAniso;
        m.map.needsUpdate = true;
      }
      obj.material = m;
    });
    return decal;
  }

  function mountShanghaiHub(root) {
    const token = configToken;
    let anchor = null;
    root.traverse((obj) => {
      if (!anchor && obj.name === '概念车') anchor = obj;
    });
    if (!anchor) anchor = root;
    preloadShanghaiHub();
    const takeDecal = (source) => {
      if (token !== configToken || !source) return;
      anchor.add(spawnHubDecal(source));
    };
    const takeTicks = (tex) => {
      if (token !== configToken || !tex) return;
      const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8;
      const map = tex.clone();
      map.anisotropy = maxAniso;
      map.needsUpdate = true;
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m || (m.name || '') !== '塑料-黑色-细磨砂.013') continue;
          m.map = map;
          m.color.set(0xffffff);
          m.needsUpdate = true;
        }
      });
    };
    if (hubDecalScene) takeDecal(hubDecalScene);
    else hubDecalPromise.then(takeDecal).catch((err) => console.error('[EmaxModel] hub decal', err));
    if (hubTicksTex) takeTicks(hubTicksTex);
    else hubTicksPromise.then(takeTicks).catch((err) => console.error('[EmaxModel] hub ticks', err));
  }

  /* The limited-edition line and the square above it sit in the curved side
     shell, so a turn puts the shell in front and the marks vanish. Move each
     face out along its own normal. Both sides live in one mesh, so keep
     front faces instead of picking a single side. */
  function pinDecalMap(map) {
    if (!map || map.userData.markPinned) return;
    map.userData.markPinned = true;
    /* The print is a few texels tall. Mips average it with the clear
       texels, so the bar and the square fade out as the panel turns. */
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.needsUpdate = true;
  }

  function liftPaintedMark(obj, m, distance) {
    m.side = THREE.FrontSide;
    m.polygonOffset = false;
    m.depthWrite = false;
    m.depthTest = true;
    m.transparent = true;
    pinDecalMap(m.map);
    pinDecalMap(m.alphaMap);
    obj.renderOrder = 3;
    if (obj.userData.markLifted) return;
    obj.userData.markLifted = true;
    const geo = obj.geometry.clone();
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    if (!pos || !nor) return;
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      n.fromBufferAttribute(nor, i);
      if (n.lengthSq() < 1e-8) continue;
      n.normalize().multiplyScalar(distance);
      pos.setXYZ(i, pos.getX(i) + n.x, pos.getY(i) + n.y, pos.getZ(i) + n.z);
    }
    pos.needsUpdate = true;
    obj.geometry = geo;
  }

  /* The blend paints the running mark on both grip caps. The metal export
     kept the black plastic and dropped the print. */
  function mountShanghaiGrips(root) {
    const token = configToken;
    const tex = new THREE.TextureLoader().load(ap('alternative1/sh-grip-logo.webp?v=2'), (loaded) => {
      if (token !== configToken) {
        loaded.dispose();
        return;
      }
      loaded.needsUpdate = true;
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = true;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const outward = new THREE.Vector3();
    const world = new THREE.Vector3();
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || Array.isArray(obj.material)) return;
      if ((obj.material.name || '') !== '高亮黑-把手') return;
      const geo = obj.geometry.clone();
      const pos = geo.getAttribute('position');
      const nor = geo.getAttribute('normal');
      if (!pos || !nor) return;
      obj.updateWorldMatrix(true, false);
      geo.computeBoundingBox();
      world.copy(geo.boundingBox.getCenter(new THREE.Vector3())).applyMatrix4(obj.matrixWorld);
      const side = Math.sign(world.x) || 1;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      const cap = [];
      for (let i = 0; i < pos.count; i += 1) {
        outward.fromBufferAttribute(nor, i).transformDirection(obj.matrixWorld);
        if (outward.x * side < 0.4) continue;
        world.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        cap.push(i);
        if (world.y < minY) minY = world.y;
        if (world.y > maxY) maxY = world.y;
        if (world.z < minZ) minZ = world.z;
        if (world.z > maxZ) maxZ = world.z;
      }
      if (!cap.length) return;
      const cy = (minY + maxY) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      /* The cap maps through this radius. A smaller factor keeps the mark
         inside the face and leaves the black ring shown in the reference. */
      const rad = (Math.max(maxY - minY, maxZ - minZ) * 0.5 || 0.02) * 0.5;
      const uv = new Float32Array(pos.count * 2);
      for (const i of cap) {
        world.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        const nz = (world.z - cz) / (rad * 2);
        const ny = (world.y - cy) / (rad * 2);
        uv[i * 2] = side > 0 ? 0.5 - nz : 0.5 + nz;
        uv[i * 2 + 1] = 0.5 + ny;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const m = obj.material.clone();
      m.name = '高亮黑-把手';
      m.emissiveMap = tex;
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 1;
      obj.geometry = geo;
      obj.material = m;
    });
  }

  /* Coplanar decals and the taillight share a depth, so they crawl while rotating. */
  function settleSourceFlicker(root) {
    const hubs = [new THREE.Vector3(0, 0.33, 0.96), new THREE.Vector3(0, 0.33, -0.99)];
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      box.getSize(size);
      box.getCenter(center);
      const thin = Math.min(size.x, size.y, size.z);
      const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!src) return;
      const matName = src.name || '';
      if (matName === '图层 114' || matName === '图层 114 拷贝 2') {
        const painted = ownMaterial(obj);
        if (painted) liftPaintedMark(obj, painted, matName === '图层 114' ? 0.0024 : 0.0045);
        return;
      }
      const nearHub = hubs.some((hub) => center.distanceTo(hub) < 0.22);
      const decal = thin < 0.0012 || /丝印|白色|logo/.test(matName);
      const lamp = /灯/.test(matName);
      const hubOverlay = nearHub && !/轮胎/.test(matName) && (
        thin < 0.008 || /钛抛光/.test(matName)
      );
      if (matName === '灯-转向灯' && center.z > 0.5) {
        const lens = ownMaterial(obj);
        if (lens) settleTailLens(obj, lens);
        return;
      }
      if (lamp && thin >= 0.02) return;
      if (!decal && !lamp && !hubOverlay) return;
      const m = ownMaterial(obj);
      if (!m) return;
      m.polygonOffset = true;
      if (lamp) {
        obj.renderOrder = 4;
        if (matName === '灯-大灯灯珠.002') settleTailLamp(obj, m);
        else {
          m.polygonOffsetFactor = -4;
          m.polygonOffsetUnits = -4;
          if (m.side === THREE.DoubleSide) faceOutward(obj, m);
        }
        return;
      }
      m.polygonOffsetFactor = hubOverlay && !decal ? -2 : -4;
      m.polygonOffsetUnits = hubOverlay && !decal ? -2 : -4;
      obj.renderOrder = 2;
      if (thin < 0.0012 && m.side === THREE.DoubleSide) faceOutward(obj, m);
      if (matName === '蓝色丝印') settleBlueMark(obj, m);
    });
  }

  function prepareCar(gltf, preserveMaterials) {
    if (preserveMaterials && usesSourceMaterials(configKey)) hideSpecimenHelpers(gltf.scene);
    else if (preserveMaterials) hideOversized(gltf.scene);
    else if (SPECIMEN) hideSpecimenHelpers(gltf.scene);
    else hideStudioContainer(gltf.scene);
    canopyMats = [];
    gripMats = [];
    lightMats = [];
    bodyMats = [];
    seatMats = [];
    ninebotMats = [];
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.frustumCulled = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (preserveMaterials) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        const bare = (obj.name || '').replace(/\./g, '');
        if (bare === 'c51314553726bade818e51ab865a6c17') obj.visible = false;
        /* NZ: unmaterialed helper box. The side shells stay; they are in the source. */
        if (configKey === 'newzealand' && bare === 'Cube') obj.visible = false;
        if (!usesSourceMaterials(configKey)) tuneCargoWindow(obj);
        const liveMats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const keepSource = usesSourceMaterials(configKey);
        for (const m of liveMats) {
          if (!m) continue;
          if (!keepSource) liftCityBlack(m);
          if (studioEnv && 'envMap' in m && !m.envMap) m.envMap = studioEnv;
          m.needsUpdate = true;
        }
        return;
      }
      obj.castShadow = SPECIMEN;
      obj.receiveShadow = SPECIMEN;
      if (SPECIMEN) {
        for (const m of mats) {
          if (!m) continue;
          tuneSpecimenMaterial(m);
          stabilizeSpecimenLight(obj, m);
          settleBlueMark(obj, m);
          if (
            m.name === '塑料-黑色-细磨砂.001'
            || m.name === 'Material.001'
            || m.name === 'Material.031'
          ) {
            rehueBlueInk(m.map);
          }
          if (studioEnv && 'envMap' in m && !m.envMap) {
            m.envMap = studioEnv;
            if (m.envMapIntensity == null) m.envMapIntensity = 0.22;
          }
          m.needsUpdate = true;
        }
        const nid = (obj.name || '').replace(/\./g, '');
        if (nid === 'FILLET_PIECE#2872') {
          obj.material = makeSmokedCover(studioEnv);
        } else if (
          nid === 'shell#62001'
          || nid === 'shell#63001'
          || nid === 'shell#63001_1'
          || nid === 'shell#64001'
        ) {
          obj.material = makeMatteBlack(studioEnv);
        } else if (nid === 'shell#875001') {
          obj.material = makeScreenGlass(studioEnv);
        } else if (
          nid === 'shell#175002_1'
          || nid === 'shell#43001'
          || nid === 'shell#124001'
          || nid === 'shell#130001'
        ) {
          obj.material = makeDarkGrayMetal(studioEnv);
        }
        if (nid === 'shell#609001') {
          obj.material = makeSidePanelBlack(studioEnv);
        }
        return;
      }
      if (
        obj.name === 'LOGO' ||
        obj.userData?.name === 'LOGO' ||
        mats.some((m) => m && m.name === 'LOGO')
      ) {
        obj.visible = false;
        return;
      }
      if (isCanopyMesh(obj)) {
        const prev = obj.material;
        obj.material = makeBlackGlass(prev, studioEnv);
        if (prev && prev !== obj.material) prev.dispose?.();
        return;
      }
      if (isGripMesh(obj)) {
        const prev = obj.material;
        obj.material = makeBlackGrip(prev, studioEnv);
        gripMats.push(obj.material);
        if (prev && prev !== obj.material) {
          if (Array.isArray(prev)) prev.forEach((m) => m?.dispose?.());
          else prev.dispose?.();
        }
        return;
      }
      for (const m of mats) {
        if (!m) continue;
        if (isNinebotMat(m)) prepareNinebotLight(m);
        if (isSeatMat(m)) prepareSeatSilver(m, studioEnv);
        tuneBodyFlake(m);
        if (studioEnv && 'envMap' in m) bindCarEnv(m, studioEnv);
        m.needsUpdate = true;
      }
    });
    if (preserveMaterials && configKey === 'default') {
      settleSourceFlicker(gltf.scene);
      settleSourceTires(gltf.scene);
      settleSourceRail(gltf.scene);
      settleShanghaiSeat(gltf.scene);
      settleShanghaiCover(gltf.scene);
      settleShanghaiWires(gltf.scene);
      settleShanghaiSilver(gltf.scene);
      settleShanghaiBlue(gltf.scene);
      settleShanghaiDeckLip(gltf.scene);
      mountShanghaiHub(gltf.scene);
      mountShanghaiGrips(gltf.scene);
    }
    if (preserveMaterials && configKey === 'paris') sharpenParisDecals(gltf.scene);
    if (!preserveMaterials && SPECIMEN) {
      collectSpecimenLamps(gltf.scene);
      applyLights(lightsOn);
    } else if (!preserveMaterials) {
      fillSidePanels(gltf.scene, studioEnv);
      liftNinebotDecals(gltf.scene);
      collectCarLights(gltf.scene);
      collectBodyPaint(gltf.scene);
      collectSeats(gltf.scene);
      collectNinebot(gltf.scene);
      applyLights(lightsOn);
      applyBodyPaint(bodyPaint);
    }
  }

  function measureAxles(root) {
    const samples = [];
    const v = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.visible || !obj.geometry) return;
      const attr = obj.geometry.attributes?.position;
      if (!attr) return;
      const step = Math.max(1, Math.floor(attr.count / 7000));
      for (let i = 0; i < attr.count; i += step) {
        v.fromBufferAttribute(attr, i);
        obj.localToWorld(v);
        samples.push(v.x, v.y, v.z);
      }
    });
    if (samples.length < 48) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < samples.length; i += 3) {
      const x = samples[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    const mid = (minX + maxX) * 0.5;
    const rear = axleInRange(samples, minX - 0.01, mid);
    const front = axleInRange(samples, mid, maxX + 0.01);
    if (!rear || !front || front.x - rear.x < 0.4) return null;
    return { front, rear };
  }

  function axleInRange(samples, x0, x1) {
    let minY = Infinity;
    for (let i = 0; i < samples.length; i += 3) {
      const x = samples[i];
      const y = samples[i + 1];
      const z = samples[i + 2];
      if (x < x0 || x >= x1 || Math.abs(z) > 0.28) continue;
      if (y < minY) minY = y;
    }
    if (!Number.isFinite(minY)) return null;
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < samples.length; i += 3) {
      const x = samples[i];
      const y = samples[i + 1];
      const z = samples[i + 2];
      if (x < x0 || x >= x1 || Math.abs(z) > 0.22 || y > minY + 0.03) continue;
      sx += x;
      sz += z;
      n += 1;
    }
    if (n < 6) return null;
    const cx = sx / n;
    const cz = sz / n;
    let bestR = 0.33;
    let bestHit = -1;
    for (let r = 0.28; r <= 0.345; r += 0.005) {
      const cy = minY + r;
      let hit = 0;
      for (let i = 0; i < samples.length; i += 3) {
        const x = samples[i];
        const y = samples[i + 1];
        const z = samples[i + 2];
        if (Math.abs(z) > 0.22 || Math.abs(x - cx) > 0.5 || y > minY + 0.8) continue;
        if (Math.abs(Math.hypot(x - cx, y - cy) - r) < 0.018) hit += 1;
      }
      if (hit > bestHit) {
        bestHit = hit;
        bestR = r;
      }
    }
    const point = new THREE.Vector3(cx, minY + bestR, cz);
    let patchY = 0;
    let patchN = 0;
    for (let i = 0; i < samples.length; i += 3) {
      const x = samples[i];
      const y = samples[i + 1];
      const z = samples[i + 2];
      if (x < x0 || x >= x1 || Math.abs(z) > 0.22 || Math.abs(x - cx) > 0.18) continue;
      if (y > minY + 0.018) continue;
      patchY += y;
      patchN += 1;
    }
    point.contactY = patchN ? patchY / patchN : minY;
    return point;
  }

  function axleBaseline(axles) {
    return Math.min(axles.front.contactY, axles.rear.contactY);
  }

  function shiftOntoBaseline(inner, axles) {
    const mid = axles.front.clone().add(axles.rear).multiplyScalar(0.5);
    const target = axleTarget.front.clone().add(axleTarget.rear).multiplyScalar(0.5);
    mid.y = axleBaseline(axles);
    target.y = axleBaseline(axleTarget);
    inner.position.add(target.sub(mid));
  }

  function levelSideView(inner) {
    const axles = measureAxles(inner);
    if (!axles) return;
    const dx = axles.front.x - axles.rear.x;
    const dz = axles.front.z - axles.rear.z;
    const yaw = Math.atan2(dz, dx);
    if (!Number.isFinite(yaw) || Math.abs(yaw) < 0.004) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    inner.position.applyQuaternion(q);
    inner.quaternion.premultiply(q);
    inner.updateMatrixWorld(true);
  }

  function settleAxles(inner, preserveMaterials) {
    const axles = measureAxles(inner);
    if (!axles) return;
    if (!preserveMaterials) {
      axleTarget = axles;
      return;
    }
    if (!axleTarget) return;
    const span = axles.front.x - axles.rear.x;
    const targetSpan = axleTarget.front.x - axleTarget.rear.x;
    if (span > 0.2 && Math.abs(targetSpan / span - 1) > 0.02) {
      const s = targetSpan / span;
      const mid = axles.front.clone().add(axles.rear).multiplyScalar(0.5);
      inner.scale.setScalar(s);
      inner.position.multiplyScalar(s).addScaledVector(mid, 1 - s);
      inner.updateMatrixWorld(true);
      const fitted = measureAxles(inner);
      if (!fitted) return;
      shiftOntoBaseline(inner, fitted);
      return;
    }
    shiftOntoBaseline(inner, axles);
  }

  async function swapCar(url, preserveMaterials, keepView = false) {
    const token = ++configToken;
    if (/ConceptCar_next_SH/.test(url || '')) preloadShanghaiHub();
    const gltf = await loadGltf(ap(url));
    if (token !== configToken || !scene) return false;
    if (carGroup) {
      scene.remove(carGroup);
      disposeHierarchy(carGroup);
      carGroup = null;
    }
    prepareCar(gltf, preserveMaterials);
    const inner = new THREE.Group();
    inner.add(gltf.scene);
    frameModel(inner);
    settleAxles(inner, preserveMaterials);
    levelSideView(inner);
    if (!preserveMaterials || !defaultViewSphere) {
      viewSphere = visibleBox(inner).getBoundingSphere(new THREE.Sphere());
      const squared = measureAxles(inner);
      if (squared) axleTarget = squared;
      defaultViewSphere = viewSphere.clone();
    } else viewSphere = defaultViewSphere;
    carGroup = new THREE.Group();
    carGroup.add(inner);
    if (!keepView) {
      rotX = targetRotX = DEFAULT_ROT_X;
      rotY = targetRotY = DEFAULT_ROT_Y;
      rotZ = targetRotZ = DEFAULT_ROT_Z;
    }
    carGroup.rotation.set(rotX, rotY, rotZ);
    scene.add(carGroup);
    fitCarToView();
    return true;
  }

  async function applyConfig(key) {
    const url = CONFIG_URL[key];
    if (!url || key === configKey) return;
    const prev = configKey;
    configKey = key;
    syncConfigButtons(key);
    try {
      const ok = await swapCar(url, key !== 'default' || usesSourceMaterials(key), true);
      if (!ok) {
        configKey = prev;
        syncConfigButtons(prev);
      }
    } catch (err) {
      configKey = prev;
      syncConfigButtons(prev);
      showError(err);
    }
  }

  function pinchDistance() {
    if (pointers.size < 2) return 0;
    const pts = [...pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function stopRotateDrag() {
    dragging = false;
    pointerMoved = false;
    canvas?.classList.remove('is-dragging');
    if (pointerCaptured) {
      pointerCaptured = false;
    }
  }

  function beginPinch() {
    const dist = pinchDistance();
    pinch = { dist: Math.max(8, dist), zoom: viewZoom };
    stopRotateDrag();
  }

  function endPinch() {
    pinch = null;
    stopRotateDrag();
  }

  function onPointerDown(e) {
    if (!active) return;
    if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      beginPinch();
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }

    if (pinch) return;

    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    pointerMoved = false;
    pointerCaptured = false;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerMove(e) {
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinch) {
      if (pointers.size >= 2) applyZoom(pinch.zoom * (pinchDistance() / pinch.dist));
      e.preventDefault();
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - pointerDownX;
    const dy = e.clientY - pointerDownY;
    if (!pointerMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      pointerMoved = true;
      canvas.classList.add('is-dragging');
      if (!pointerCaptured) {
        canvas.setPointerCapture?.(e.pointerId);
        pointerCaptured = true;
      }
    }
    if (!pointerMoved) return;
    targetRotY += (e.clientX - lastX) * 0.008;
    targetRotX += (e.clientY - lastY) * 0.008;
    targetRotX = THREE.MathUtils.clamp(targetRotX, MIN_ROT_X, MAX_ROT_X);
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) endPinch();
      try { canvas?.releasePointerCapture?.(e.pointerId); } catch (_) {}
      return;
    }
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('is-dragging');
    if (pointerCaptured) {
      canvas.releasePointerCapture?.(e.pointerId);
      pointerCaptured = false;
    }
  }

  function onSafariGesture(e) {
    e.preventDefault();
    if (e.type === 'gesturestart') {
      gestureBase = viewZoom;
      stopRotateDrag();
      return;
    }
    if (e.type === 'gesturechange' && gestureBase) {
      applyZoom(gestureBase * (e.scale || 1));
      return;
    }
    if (e.type === 'gestureend') gestureBase = 0;
  }

  function onWheelZoom(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (gestureBase) return;
    const line = e.deltaMode === 1;
    const factor = line ? 0.06 : 0.0018;
    applyZoom(viewZoom * Math.exp(-e.deltaY * factor));
  }

  function onTouchMovePinch(e) {
    if (e.touches.length < 2) return;
    e.preventDefault();
  }

  function bindPointer() {
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('gesturestart', onSafariGesture);
    canvas.addEventListener('gesturechange', onSafariGesture);
    canvas.addEventListener('gestureend', onSafariGesture);
    canvas.addEventListener('wheel', onWheelZoom, { passive: false });
    canvas.addEventListener('touchmove', onTouchMovePinch, { passive: false });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientationChange);
    if (portraitMq.addEventListener) portraitMq.addEventListener('change', onPortraitMqChange);
    else portraitMq.addListener(onPortraitMqChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChrome);
      window.visualViewport.addEventListener('scroll', onViewportChrome);
    }
  }

  function unbindPointer() {
    pointers.clear();
    pinch = null;
    gestureBase = 0;
    canvas?.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    canvas?.removeEventListener('gesturestart', onSafariGesture);
    canvas?.removeEventListener('gesturechange', onSafariGesture);
    canvas?.removeEventListener('gestureend', onSafariGesture);
    canvas?.removeEventListener('wheel', onWheelZoom);
    canvas?.removeEventListener('touchmove', onTouchMovePinch);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onOrientationChange);
    if (portraitMq.removeEventListener) portraitMq.removeEventListener('change', onPortraitMqChange);
    else portraitMq.removeListener(onPortraitMqChange);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onViewportChrome);
      window.visualViewport.removeEventListener('scroll', onViewportChrome);
    }
  }

  function animate() {
    if (!active) return;
    const dt = Math.min(clock.getDelta(), 0.032);
    rotX += (targetRotX - rotX) * (1 - Math.exp(-dt * 10));
    rotY += (targetRotY - rotY) * (1 - Math.exp(-dt * 10));
    rotZ += (targetRotZ - rotZ) * (1 - Math.exp(-dt * 10));
    tickZoomHold(dt);
    if (carGroup) carGroup.rotation.set(rotX, rotY, rotZ);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }

  async function waitForCanvasSize(maxTries = 40) {
    for (let i = 0; i < maxTries; i++) {
      if (canvas.clientWidth >= 40 && canvas.clientHeight >= 40) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  function loadGltf(url) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(ap(DRACO_PATH));
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          draco.dispose();
          resolve(gltf);
        },
        undefined,
        (err) => {
          draco.dispose();
          reject(err);
        },
      );
    });
  }

  function isCanopyMesh(obj) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (mats.some((m) => m && m.name === '材质.014')) return true;
    const n = `${obj.name || ''} ${obj.parent?.name || ''}`;
    return /fillet_piece_521/i.test(n);
  }

  function isGripMesh(obj) {
    const n = `${obj.name || ''} ${obj.parent?.name || ''} ${obj.userData?.name || ''}`;
    /* #2146 is the other side of #1952. The old name check only caught one,
       so that grip stayed on the seat silver. */
    if (/挤压|#1952|#2146|Blend_srf#1952|Blend_srf#2146/.test(n)) return true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.name === 'Material') return true;
    }
    if (!obj.geometry) return false;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    const size = obj.geometry.boundingBox.getSize(new THREE.Vector3());
    const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
    const untextured = mats.some((m) => m && !m.map && m.name === 'Material');
    return dims[0] < 0.01 && dims[2] > 0.3 && untextured;
  }

  function makeBlackGrip(src, envMap) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x0c0c0c,
      metalness: 0.15,
      roughness: 0.28,
      clearcoat: 0.35,
      clearcoatRoughness: 0.22,
      envMap: envMap || null,
      envMapIntensity: 0.26,
      side: src?.side ?? THREE.DoubleSide,
      transparent: false,
      opacity: 1,
      depthWrite: true,
    });
    mat.name = 'grip-black';
    return mat;
  }

  function makeBlackGlass(src, envMap) {
    /* Transmission on an alpha canvas reads as milky white; use tinted
       physical glass (opacity + clearcoat) so it stays dark and see-through. */
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      metalness: 0,
      roughness: 0.14,
      transmission: 0,
      transparent: true,
      opacity: 0.46,
      depthWrite: true,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      envMap: envMap || null,
      envMapIntensity: 0.32,
      ior: 1.5,
      specularIntensity: 0.85,
      side: src?.side ?? THREE.DoubleSide,
    });
    mat.name = src?.name || 'canopy-glass';
    canopyMats.push(mat);
    return mat;
  }

  function meshName(obj) {
    return `${obj.name || ''} ${obj.parent?.name || ''}`;
  }

  function opaqueShellMaterial(src, envMap) {
    const mat = src.clone();
    mat.transparent = false;
    mat.opacity = 1;
    if ('transmission' in mat) mat.transmission = 0;
    mat.depthWrite = true;
    mat.side = THREE.DoubleSide;
    if (envMap && 'envMap' in mat) {
      mat.envMap = envMap;
      mat.envMapIntensity = 0.26;
    }
    mat.needsUpdate = true;
    return mat;
  }

  function geometrySpansBothSides(panel) {
    const pos = panel.geometry?.attributes?.position;
    if (!pos || pos.count < 3) return false;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      const z = pos.getZ(i);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const span = maxZ - minZ;
    return span > 1e-4 && minZ < -span * 0.2 && maxZ > span * 0.2;
  }

  function fillSidePanels(root, envMap) {
    let panel = null;
    let body = null;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const n = meshName(obj);
      if (!panel && /Blend_srf#2407|#2407/.test(n)) panel = obj;
      if (!body && /Blend_srf#2374|#2374/.test(n)) body = obj;
    });
    if (!panel || !body?.material) return;
    const shell = opaqueShellMaterial(
      Array.isArray(body.material) ? body.material[0] : body.material,
      envMap,
    );
    panel.material = shell;
    panel.visible = true;
    /* The applied-mirror export already contains both halves. Cloning again
       stacks a second shell on the same surface. */
    if (geometrySpansBothSides(panel)) return;
    if (panel.parent?.children.some((c) => c.name === 'side-panel-mirror')) return;
    const mirror = panel.clone(true);
    mirror.name = 'side-panel-mirror';
    mirror.material = shell;
    mirror.scale.z = -Math.abs(panel.scale.z || 1);
    if (Math.abs(panel.scale.z) < 1e-8) mirror.scale.z = -1;
    panel.parent.add(mirror);
  }

  function applyCharcoal(m, roughness, metalness) {
    m.color.setRGB(0.05, 0.05, 0.05, THREE.LinearSRGBColorSpace);
    m.metalness = metalness;
    m.roughness = roughness;
    m.metalnessMap = null;
    m.roughnessMap = null;
    m.map = null;
    m.envMapIntensity = 0.38;
    if (m.emissive) m.emissive.setHex(0x000000);
    if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
    if ('specularIntensity' in m) m.specularIntensity = 0.22;
    if ('clearcoat' in m) m.clearcoat = 0;
    if ('transmission' in m) {
      m.transmission = 0;
      m.transmissionMap = null;
      m.thickness = 0;
    }
    m.transparent = false;
    m.opacity = 1;
    m.depthWrite = true;
  }

  function tuneSpecimenMaterial(m) {
    const name = m.name || '';
    /* Car paint was exported with a magenta stain map in the metalness slot
       (blue channel is 255), so the shell renders as chrome. */
    if (/^CarPaint/.test(name)) {
      m.color.setHex(0xd2d4d8);
      m.map = null;
      m.metalness = 0.52;
      m.roughness = 0.24;
      m.metalnessMap = null;
      m.roughnessMap = null;
      if ('clearcoat' in m) {
        m.clearcoat = 0.5;
        m.clearcoatRoughness = 0.12;
      }
      if ('specularIntensity' in m) m.specularIntensity = 0.9;
      m.envMapIntensity = 0.85;
      return;
    }
    if (/轮胎/.test(name)) {
      /* The file has real tire materials (color ~0.06) but the stain map sits
         in the metalness slot, so the rubber renders as chrome. Keep the
         tread normal and replace only that false metalness with charcoal. */
      applyCharcoal(m, 0.78, 0);
      return;
    }
    /* The suede seat is a dark map with a low roughness, so the wedge
       reads as silver. Keep the grain and knock the shine down. */
    if (/坐垫/.test(name)) {
      m.color.setRGB(0.4, 0.4, 0.4, THREE.LinearSRGBColorSpace);
      m.metalness = 0;
      m.roughness = 0.78;
      m.metalnessMap = null;
      m.roughnessMap = null;
      m.envMapIntensity = 0.18;
      if ('specularIntensity' in m) m.specularIntensity = 0.1;
      if ('clearcoat' in m) m.clearcoat = 0;
      return;
    }
    /* White logos stay white with the lights on or off. */
    if (name === '白色字' || name === '白色-logo' || name === '白色-logo.001') {
      m.metalness = 0;
      m.roughness = 1;
      m.envMapIntensity = 0;
      m.metalnessMap = null;
      m.roughnessMap = null;
      m.toneMapped = false;
      m.emissive = m.emissive || new THREE.Color();
      m.emissive.setHex(0xffffff);
      m.emissiveIntensity = 1;
      if (m.map) {
        m.color.setHex(0x000000);
        m.emissiveMap = m.map;
      } else {
        m.color.setHex(0xffffff);
      }
      return;
    }
    /* Handlebar buttons and the wheel-plate square share one reference blue. */
    if (name === '蓝色丝印' || name.startsWith('高亮蓝')) {
      m.color.setHex(0x3471ff);
      m.metalness = 0.08;
      m.roughness = name.startsWith('高亮蓝') ? 0.32 : 0.45;
      m.metalnessMap = null;
      m.roughnessMap = null;
      if (m.emissive) m.emissive.setHex(0x000000);
      if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
      if ('clearcoat' in m) m.clearcoat = name.startsWith('高亮蓝') ? 0.3 : 0;
      m.envMapIntensity = 0.42;
      return;
    }
    /* Metal009 is the long rail. 高亮黑* is glossy enough to read as silver. */
    if (
      name === 'Metal009'
      || name === '塑料-黑色-细磨砂.003'
      || /^高亮黑/.test(name)
    ) {
      applyCharcoal(m, 0.52, 0.06);
    }
  }

  function makeSmokedCover(envMap) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x8b939c,
      metalness: 0,
      roughness: 0.08,
      transmission: 0,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMap: envMap || null,
      envMapIntensity: 0.85,
      ior: 1.5,
      specularIntensity: 0.9,
      side: THREE.DoubleSide,
    });
    mat.name = 'smoked-cover';
    return mat;
  }

  function makeMatteBlack(envMap) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1c1c1c,
      metalness: 0,
      roughness: 0.84,
      envMap: envMap || null,
      envMapIntensity: 0.14,
    });
    mat.name = 'cover-matte-black';
    return mat;
  }

  function makeSidePanelBlack(envMap) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.05, 0.05, 0.05, THREE.LinearSRGBColorSpace),
      metalness: 0.06,
      roughness: 0.52,
      envMap: envMap || null,
      envMapIntensity: 0.38,
    });
    mat.name = 'side-panel-black';
    return mat;
  }

  function makeDarkGrayMetal(envMap) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6a6a6a,
      metalness: 0.16,
      roughness: 0.52,
      envMap: envMap || null,
      envMapIntensity: 0.28,
    });
    mat.name = 'dark-gray-metal';
    return mat;
  }

  function makeScreenGlass(envMap) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1a1a,
      metalness: 0,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMap: envMap || null,
      envMapIntensity: 1.25,
      specularIntensity: 1,
      transparent: false,
      opacity: 1,
      depthWrite: true,
    });
    mat.name = 'screen-glass';
    return mat;
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = l - c / 2;
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  function rehueBlueInk(tex) {
    /* Blue ink inside a decal. Shift those pixels onto the shared highlight
       blue and leave white lettering. */
    if (!tex?.image || tex.userData.blueRehue) return;
    const img = tex.image;
    const w = img.width;
    const h = img.height;
    if (!w || !h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 16) continue;
      const r = d[i] / 255;
      const g = d[i + 1] / 255;
      const b = d[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      if (delta < 0.12 || max < 0.15) continue;
      let hue;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
      if (hue < 190 || hue > 260) continue;
      const l = (max + min) / 2;
      const s = delta / (1 - Math.abs(2 * l - 1));
      const weight = Math.min(1, Math.max(0, (s - 0.18) / 0.45));
      const [nr, ng, nb] = hslToRgb(
        222,
        Math.min(1, s + (1 - s) * weight),
        Math.min(0.72, l + (0.602 - l) * weight),
      );
      d[i] = nr;
      d[i + 1] = ng;
      d[i + 2] = nb;
    }
    ctx.putImageData(imageData, 0, 0);
    tex.image = canvas;
    tex.needsUpdate = true;
    tex.userData.blueRehue = true;
  }

  function settleBlueMark(obj, m) {
    /* The blue square is a zero-thickness, double-sided decal sitting on the
       wheel plate. Both faces share one depth, so it flickers as the model turns. */
    if ((m.name || '') !== '蓝色丝印') return;
    obj.updateWorldMatrix(true, false);
    const normalAttr = obj.geometry?.getAttribute('normal');
    const n = new THREE.Vector3();
    if (normalAttr) n.fromBufferAttribute(normalAttr, 0).transformDirection(obj.matrixWorld);
    const outward = Math.sign(new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld).x) || -1;
    m.side = n.x * outward >= 0 ? THREE.FrontSide : THREE.BackSide;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -4;
    m.depthWrite = true;
    obj.renderOrder = 2;
  }

  function collectSpecimenLamps(root) {
    /* Default stays in the lights-on state. Taillight and headlamp are the
       beads only: no point-light spill onto the body. */
    const lampWhite = 0xf7f7f8;
    const specs = [
      {
        ids: ['shell#957001'],
        onGlow: 0xff3a30,
        intensity: 3.45,
        offIntensity: 0.62,
      },
      {
        ids: ['shell#606001'],
        color: lampWhite,
        intensity: 1.85,
        offIntensity: 0.62,
      },
      {
        ids: [
          'shell#81001',
          'fillet_srf#4307001',
          'shell#318001',
          'shell#55001',
          'shell#567001',
          'draft_piece#101001',
          'shell#623001',
          'shell#624001',
        ],
        color: lampWhite,
        intensity: 1.85,
        offIntensity: 0.62,
      },
      {
        ids: ['shell#220001'],
        color: lampWhite,
        intensity: 1.85,
        offIntensity: 0.62,
        solid: true,
      },
    ];
    const byId = new Map();
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      byId.set((obj.name || '').replace(/\./g, ''), obj);
    });
    const seen = new Map();
    lightMats = [];
    const glow = new THREE.Color(lampWhite);
    const lens = new THREE.Color(0x141416);
    for (const spec of specs) {
      for (const id of spec.ids) {
        const mesh = byId.get(id);
        const src = mesh?.material;
        if (!mesh || !src || Array.isArray(src)) continue;
        const mat = src.clone();
        mesh.material = mat;
        let item = seen.get(mat);
        if (!item) {
          mat.metalness = 0;
          mat.roughness = 1;
          mat.envMapIntensity = 0;
          mat.toneMapped = false;
          if (spec.solid) {
            mat.map = null;
            mat.normalMap = null;
            mat.roughnessMap = null;
            mat.metalnessMap = null;
          }
          mat.emissive = mat.emissive || new THREE.Color();
          const onGlow = spec.onGlow != null ? new THREE.Color(spec.onGlow) : glow;
          item = {
            mat,
            intensity: spec.intensity,
            color: onGlow,
            offGlow: spec.onGlow != null ? glow : null,
            onColor: lens,
            offColor: lens,
            offIntensity: spec.offIntensity || 0,
            bulbIntensity: spec.bulb || 0,
            bulbs: [],
          };
          seen.set(mat, item);
          lightMats.push(item);
        }
        if (spec.bulb) {
          const bulbColor = spec.bulbColor != null
            ? spec.bulbColor
            : (spec.onGlow != null ? spec.onGlow : spec.color);
          const pos = spec.bulbPos || [0, -0.05, 0.04];
          const bulb = spec.spotAt
            ? new THREE.SpotLight(
              bulbColor,
              0,
              spec.distance || 0.2,
              spec.spotAngle || 0.4,
              spec.spotPenumbra == null ? 0.55 : spec.spotPenumbra,
              2,
            )
            : new THREE.PointLight(bulbColor, 0, spec.distance || 0.85, 2);
          bulb.position.set(pos[0], pos[1], pos[2]);
          if (spec.spotAt) {
            const target = new THREE.Object3D();
            target.position.set(spec.spotAt[0], spec.spotAt[1], spec.spotAt[2]);
            mesh.add(target);
            bulb.target = target;
          } else if (!spec.bulbPos) {
            bulb.castShadow = true;
            bulb.shadow.mapSize.set(256, 256);
            bulb.shadow.bias = -0.004;
            bulb.shadow.camera.near = 0.02;
            bulb.shadow.camera.far = spec.distance || 0.85;
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          }
          mesh.add(bulb);
          item.bulbs.push(bulb);
        }
      }
    }
  }

  function stabilizeSpecimenLight(obj, m) {
    const name = m.name || '';
    if (!/灯/.test(name)) return;
    const glow = m.emissive
      ? m.emissive.r + m.emissive.g + m.emissive.b
      : 0;
    /* Double-sided glass with transmission redraws the lamp from a
       second buffer, so the bar crawls as the model turns. */
    m.side = THREE.FrontSide;
    m.polygonOffset = true;
    m.polygonOffsetFactor = glow > 0.05 ? -8 : -3;
    m.polygonOffsetUnits = glow > 0.05 ? -8 : -3;
    if ((m.transmission || 0) > 0) {
      m.transmission = 0;
      m.transmissionMap = null;
      m.thickness = 0;
      m.transparent = true;
      m.opacity = 0.18;
      m.depthWrite = false;
      m.metalness = 0;
      m.roughness = 0.16;
      m.color.setHex(0x242424);
      m.envMapIntensity = 0.15;
      obj.renderOrder = 4;
      return;
    }
    if (glow > 0.05) {
      m.metalness = 0;
      m.roughness = 1;
      m.depthWrite = true;
      obj.renderOrder = 3;
      /* Strength 25 clips to white under ACES, so the LED grid reads as a
         blown-out pixel bar. Keep the amber color. */
      if (m.emissiveIntensity > 15) m.emissiveIntensity = 3.4;
    }
  }

  function hideSpecimenHelpers(root) {
    /* NEXT exports include a huge fillet and flat helper planes.
       The EMAX median-span hider would also drop the body shells. */
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z);
      const flat = size.x < 0.002 || size.y < 0.002 || size.z < 0.002;
      const name = `${obj.name || ''} ${obj.parent?.name || ''}`;
      const id = (obj.name || '').replace(/\./g, '');
      /* Ground plinth under the chassis. It is not part of the vehicle. */
      if (
        id === 'shell#883001'
        || id === 'shell#884001'
        || id === 'shell#886001'
        || id === 'shell#887001'
        || id === 'shell#888001'
        || id === 'shell#889001'
        || id === 'Plane002'
        || id === 'Plane004'
        || id === 'xshell#10772001'
        || id === 'xshell#11888001'
      ) {
        obj.visible = false;
        return;
      }
      if (span > 6) obj.visible = false;
      else if (flat && span > 1.2 && /plane/i.test(name)) obj.visible = false;
    });
  }

  function hideStudioContainer(root) {
    /* World size only. Separate shells make the median a few centimetres,
       so a median cutoff hides the body. Drop a backdrop, not the car. */
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      if (Math.max(size.x, size.y, size.z) > 6) obj.visible = false;
    });
  }

  function isWorldVisible(obj) {
    let p = obj;
    while (p) {
      if (p.visible === false) return false;
      p = p.parent;
    }
    return true;
  }

  function visibleBox(root) {
    const box = new THREE.Box3();
    let found = false;
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !isWorldVisible(obj)) return;
      const b = new THREE.Box3().setFromObject(obj);
      if (b.isEmpty()) return;
      if (!found) {
        box.copy(b);
        found = true;
      } else {
        box.union(b);
      }
    });
    return found ? box : new THREE.Box3().setFromObject(root);
  }

  function frameModel(root) {
    root.updateMatrixWorld(true);
    if (SPECIMEN) {
      const size0 = visibleBox(root).getSize(new THREE.Vector3());
      if (size0.z >= size0.x && size0.z >= size0.y) root.rotation.y = Math.PI / 2;
      else if (size0.y > size0.x && size0.y >= size0.z) root.rotation.z = Math.PI / 2;
    } else {
      const size = visibleBox(root).getSize(new THREE.Vector3());
      if (size.z > size.y * 1.25) root.rotation.x = -Math.PI / 2;
    }
    root.updateMatrixWorld(true);
    const box = visibleBox(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.updateMatrixWorld(true);
    viewSphere = visibleBox(root).getBoundingSphere(new THREE.Sphere());
  }

  function materialLuma(m) {
    if (!m?.color) return 1;
    return m.color.r * 0.2126 + m.color.g * 0.7152 + m.color.b * 0.0722;
  }

  function bindCarEnv(m, envMap) {
    if (!m || !envMap || !('envMap' in m)) return;
    m.envMap = envMap;
    if (LIGHT_MAT_NAMES.has(m.name)) return;
    /* Dark body paint must not pick up the bright studio HDR as grey fill */
    if (materialLuma(m) < 0.08) m.envMapIntensity = 0.26;
    else if (m.envMapIntensity == null) m.envMapIntensity = 0.55;
  }

  function addStudioLights() {
    /* High-contrast studio: deep blacks, thin white rims — not the silver-book rig */
    const key = new THREE.DirectionalLight(0xfff8f0, 1.18);
    key.position.set(-2.2, 6.4, 5.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xf4f6fa, 0.88);
    rim.position.set(3.4, 4.8, -5.4);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x4a5562, 0.07);
    fill.position.set(5.5, -1.2, 2.2);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xb4bcc6, 0.035));
    scene.add(new THREE.HemisphereLight(0xc8d0da, 0x08090c, 0.05));
  }

  function showError(err) {
    if (!canvas) return;
    canvas.classList.add('is-error', 'is-loaded');
    document.body.classList.add('is-reader-ready');
    console.error('[EmaxModel]', err);
    const tip = document.createElement('p');
    tip.className = 'detail-visual__fallback';
    tip.textContent = `3D model failed: ${err?.message || err}. Use local server (bash preview.sh).`;
    canvas.parentElement?.appendChild(tip);
  }

  async function init(canvasId = 'model-canvas') {
    if (active) return true;
    canvas = document.getElementById(canvasId);
    if (!canvas) return false;

    active = true;
    clock = new THREE.Clock();
    document.body.classList.remove('is-model-day');
    document.body.classList.add('is-book-reading');
    const bar = document.getElementById('book-reader-bar');
    if (bar) bar.hidden = false;
    bindBack();
    bindLightsToggle();
    bindConfigToggle();
    if (!SPECIMEN) bindPaintToggle();
    bindZoom();
    syncRotateHint();
    if (isPhone()) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    concealMobileBrowserChrome();
    viewZoom = defaultZoom();
    lastLandscape = isPhone() && isLandscapeLayout();

    try {
      if (/ConceptCar_next_SH/.test(MODEL_URL)) preloadShanghaiHub();
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setClearAlpha(0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;

      scene = new THREE.Scene();
      scene.background = null;
      camera = new THREE.PerspectiveCamera(CLOSED_FOV, 1, 0.05, 80);

      await waitForCanvasSize();
      fitRenderer();

      pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      let envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envMap;
      scene.environmentIntensity = 0.26;
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const timer = setTimeout(done, 2800);
        new RGBELoader().load(
          HDR_URL,
          (hdr) => {
            clearTimeout(timer);
            envMap = pmrem.fromEquirectangular(hdr).texture;
            scene.environment = envMap;
            scene.environmentIntensity = 0.26;
            hdr.dispose();
            done();
          },
          undefined,
          () => {
            clearTimeout(timer);
            done();
          },
        );
      });

      studioEnv = envMap;
      addStudioLights();
      await swapCar(MODEL_URL, !!modelCfg.preserveMaterials || usesSourceMaterials(configKey));

      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => scheduleFit());
        ro.observe(canvas);
        const vis = canvas.closest('.detail-visual--book');
        if (vis) ro.observe(vis);
        canvas.__modelRO = ro;
      }

      bindPointer();
      fitCarToView();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      animate();
      canvas.classList.add('is-loaded', 'is-reading');
      document.body.classList.add('is-reader-ready');
      return true;
    } catch (err) {
      showError(err);
      return false;
    }
  }

  function destroy() {
    active = false;
    cancelAnimationFrame(rafId);
    unbindPointer();
    stopZoomHold(false);
    viewZoom = 1;
    lastLandscape = null;
    lastDrawW = 0;
    lastDrawH = 0;
    if (fitRaf) {
      cancelAnimationFrame(fitRaf);
      fitRaf = 0;
    }
    document.body.classList.remove('is-model-day');
    document.documentElement.classList.remove('is-reader-landscape');
    document.documentElement.style.removeProperty('--reader-vvh');
    document.documentElement.style.removeProperty('--reader-vvw');
    lightMats = [];
    bodyMats = [];
    canopyMats = [];
    seatMats = [];
    ninebotMats = [];
    gripMats = [];
    lightsOn = true;
    bodyPaint = 'black';
    canvas?.__modelRO?.disconnect();
    pmrem?.dispose();
    pmrem = null;
    renderer?.dispose();
    scene = null;
    camera = null;
    carGroup = null;
    viewSphere = null;
    canvas = null;
  }

  return { init, destroy };
})();

window.EmaxModel = EmaxModel;
document.dispatchEvent(new CustomEvent('emax-model:ready'));
