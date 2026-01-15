import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.182.0/build/three.module.js';

const canvas = document.getElementById('threeCanvas');
const overlayStage = document.getElementById('overlayStage');
const lockUi = document.querySelector('#lockUi img');
const enableGyroBtn = document.getElementById('enableGyro');
const calibrateBtn = document.getElementById('calibrate');
const toggleDragBtn = document.getElementById('toggleDrag');
const sceneSelect = document.getElementById('sceneSelect');
const statusEl = document.getElementById('status');

const state = {
  config: null,
  sceneKey: 'day_clear',
  panoTexture: null,
  layers: [],
  frameState: new Map(),
  spriteState: new Map(),
  sensorAvailable: false,
  sensorActive: false,
  useDrag: true,
  dragYaw: 0,
  dragPitch: 0,
  targetYaw: 0,
  targetPitch: 0,
  smoothYaw3D: 0,
  smoothPitch3D: 0,
  smoothYaw2D: 0,
  smoothPitch2D: 0,
  zeroYaw: 0,
  zeroPitch: 0
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const sphereGeo = new THREE.SphereGeometry(50, 64, 64);
const sphereMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphereMesh);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function padFrame(frame, digits = 2) {
  return String(frame).padStart(digits, '0');
}

function createLayerElement(layer) {
  const wrapper = document.createElement('div');
  wrapper.className = 'layer';
  wrapper.dataset.layerId = layer.id;
  wrapper.style.opacity = layer.opacity ?? 1;
  wrapper.style.mixBlendMode = layer.blendMode ?? 'normal';
  wrapper.style.filter = layer.blur ? `blur(${layer.blur}px)` : 'none';

  if (layer.type === 'image' || layer.type === 'frames') {
    const img = document.createElement('img');
    img.alt = layer.id;
    img.decoding = 'async';
    img.loading = 'lazy';
    img.src = layer.src || '';
    wrapper.appendChild(img);
  }

  if (layer.type === 'sprite') {
    wrapper.style.backgroundImage = `url(${layer.src})`;
    wrapper.style.backgroundRepeat = 'no-repeat';
    wrapper.style.backgroundPosition = '0px 0px';
    wrapper.style.backgroundSize = layer.direction === 'horizontal'
      ? `${layer.frameWidth * layer.frames}px ${layer.frameHeight}px`
      : `${layer.frameWidth}px ${layer.frameHeight * layer.frames}px`;
  }

  return wrapper;
}

function setupScene(sceneKey) {
  const sceneConfig = state.config.scenes[sceneKey];
  if (!sceneConfig) return;
  state.sceneKey = sceneKey;

  const loader = new THREE.TextureLoader();
  loader.load(sceneConfig.panoSrc, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    sphereMat.map = texture;
    sphereMat.needsUpdate = true;
    state.panoTexture = texture;
  });

  overlayStage.innerHTML = '';
  state.layers = [];
  state.frameState.clear();
  state.spriteState.clear();

  sceneConfig.layers.forEach(layer => {
    const element = createLayerElement(layer);
    overlayStage.appendChild(element);
    state.layers.push({
      config: layer,
      element
    });

    if (layer.type === 'frames') {
      state.frameState.set(layer.id, {
        current: layer.start,
        lastTime: 0
      });
      const img = element.querySelector('img');
      if (img) {
        const frameId = padFrame(layer.start);
        img.src = layer.framePattern.replace('{frame}', frameId);
      }
    }

    if (layer.type === 'sprite') {
      state.spriteState.set(layer.id, {
        frame: 0,
        lastTime: 0
      });
    }
  });

  lockUi.src = sceneConfig.ui.src;
  lockUi.parentElement.style.opacity = sceneConfig.ui.opacity ?? 1;
}

function loadConfig() {
  return fetch('./config.json').then(res => res.json()).then(config => {
    state.config = config;
    sceneSelect.innerHTML = '';
    Object.keys(config.scenes).forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      sceneSelect.appendChild(option);
    });
    sceneSelect.value = state.sceneKey;
    setupScene(state.sceneKey);
  });
}

function updateFrames(delta) {
  state.layers.forEach(layerEntry => {
    const { config, element } = layerEntry;
    if (config.type !== 'frames') return;
    const frameState = state.frameState.get(config.id);
    const frameDuration = 1 / (config.fps || 8);

    frameState.lastTime += delta;
    if (frameState.lastTime >= frameDuration) {
      frameState.lastTime = 0;
      frameState.current += 1;
      if (frameState.current > config.end) {
        frameState.current = config.start;
      }
      const frameId = padFrame(frameState.current);
      const src = config.framePattern.replace('{frame}', frameId);
      const img = element.querySelector('img');
      if (img) img.src = src;

      const cacheFrames = [frameState.current - 2, frameState.current - 1, frameState.current + 1, frameState.current + 2];
      cacheFrames.forEach(frame => {
        let target = frame;
        if (target < config.start) target = config.end - (config.start - target) + 1;
        if (target > config.end) target = config.start + (target - config.end) - 1;
        const cached = new Image();
        cached.src = config.framePattern.replace('{frame}', padFrame(target));
      });
    }
  });
}

function updateSprites(delta) {
  state.layers.forEach(layerEntry => {
    const { config, element } = layerEntry;
    if (config.type !== 'sprite') return;
    const spriteState = state.spriteState.get(config.id);
    const frameDuration = 1 / (config.fps || 8);

    spriteState.lastTime += delta;
    if (spriteState.lastTime >= frameDuration) {
      spriteState.lastTime = 0;
      spriteState.frame = (spriteState.frame + 1) % config.frames;
      const offset = config.direction === 'horizontal'
        ? `${-spriteState.frame * config.frameWidth}px 0px`
        : `0px ${-spriteState.frame * config.frameHeight}px`;
      element.style.backgroundPosition = offset;
    }
  });
}

function updateTransforms() {
  const maxDeg = state.config.calibration.maxDeg;
  const maxRad = THREE.MathUtils.degToRad(maxDeg);
  const yawNorm = clamp(state.smoothYaw2D / maxRad, -1, 1);
  const pitchNorm = clamp(state.smoothPitch2D / maxRad, -1, 1);

  state.layers.forEach(layerEntry => {
    const { config, element } = layerEntry;
    const depth = config.depth ?? 0.2;
    const translate = config.translate ?? { x: 10, y: 6 };
    const rotate = config.rotate ?? { x: 0.5, y: 0.5 };
    const scale = config.scale ?? 1.05;

    const tx = yawNorm * translate.x * depth;
    const ty = pitchNorm * translate.y * depth;
    const rx = pitchNorm * rotate.x;
    const ry = -yawNorm * rotate.y;

    element.style.transform = `translate3d(${tx}px, ${ty}px, 0px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`;
  });

  const uiConfig = state.config.scenes[state.sceneKey].ui;
  const uiFollow = uiConfig.follow || { x: 6, y: 6, rx: 0.4, ry: 0.4 };
  const uiTx = yawNorm * uiFollow.x;
  const uiTy = pitchNorm * uiFollow.y;
  const uiRx = pitchNorm * uiFollow.rx;
  const uiRy = -yawNorm * uiFollow.ry;
  lockUi.parentElement.style.transform = `translate3d(${uiTx}px, ${uiTy}px, 0px) rotateX(${uiRx}deg) rotateY(${uiRy}deg)`;
}

function updateCamera() {
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.smoothYaw3D;
  camera.rotation.x = state.smoothPitch3D;
}

function updateStatus() {
  statusEl.textContent = `yaw: ${state.smoothYaw3D.toFixed(3)} rad\n` +
    `pitch: ${state.smoothPitch3D.toFixed(3)} rad\n` +
    `传感器: ${state.sensorAvailable ? (state.sensorActive ? '已启用' : '未启用') : '不可用'}\n` +
    `兜底拖拽: ${state.useDrag ? '开' : '关'}`;
}

function onDeviceOrientation(event) {
  if (!state.sensorActive || state.useDrag) return;
  const { beta, gamma } = event;
  if (beta == null || gamma == null) return;

  const maxDeg = state.config.calibration.maxDeg;
  const yaw = clamp(gamma, -maxDeg, maxDeg);
  const pitch = clamp(beta, -maxDeg, maxDeg);

  state.targetYaw = THREE.MathUtils.degToRad(yaw) * state.config.controls.yawGain - state.zeroYaw;
  state.targetPitch = THREE.MathUtils.degToRad(pitch) * state.config.controls.pitchGain - state.zeroPitch;
}

function initGyro() {
  if (!('DeviceOrientationEvent' in window)) {
    state.sensorAvailable = false;
    updateStatus();
    return;
  }
  state.sensorAvailable = true;
  updateStatus();
}

async function requestGyroPermission() {
  if (!('DeviceOrientationEvent' in window)) return false;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      return response === 'granted';
    } catch (error) {
      return false;
    }
  }
  return true;
}

function enableGyro() {
  requestGyroPermission().then(granted => {
    state.sensorActive = granted;
    if (granted) {
      window.addEventListener('deviceorientation', onDeviceOrientation);
    }
    updateStatus();
  });
}

function setupDragFallback() {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('pointerdown', event => {
    if (!state.useDrag) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  window.addEventListener('pointermove', event => {
    if (!dragging || !state.useDrag) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    const maxDeg = state.config.calibration.maxDeg;
    const sensitivity = 0.12;
    state.dragYaw = clamp(state.dragYaw + dx * sensitivity, -maxDeg, maxDeg);
    state.dragPitch = clamp(state.dragPitch + dy * sensitivity, -maxDeg, maxDeg);

    state.targetYaw = THREE.MathUtils.degToRad(state.dragYaw) * state.config.controls.yawGain - state.zeroYaw;
    state.targetPitch = THREE.MathUtils.degToRad(state.dragPitch) * state.config.controls.pitchGain - state.zeroPitch;
  });

  window.addEventListener('pointerup', () => {
    dragging = false;
  });
  window.addEventListener('pointerleave', () => {
    dragging = false;
  });
}

function toggleDrag() {
  state.useDrag = !state.useDrag;
  toggleDragBtn.textContent = `拖拽兜底：${state.useDrag ? '开' : '关'}`;
  updateStatus();
}

function calibrate() {
  state.zeroYaw = state.smoothYaw3D;
  state.zeroPitch = state.smoothPitch3D;
}

function animate() {
  let lastTime = performance.now();
  function loop(now) {
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    const smooth3D = state.config.calibration.smooth3D;
    const smooth2D = state.config.calibration.smooth2D;

    state.smoothYaw3D += (state.targetYaw - state.smoothYaw3D) * smooth3D;
    state.smoothPitch3D += (state.targetPitch - state.smoothPitch3D) * smooth3D;

    state.smoothYaw2D += (state.targetYaw - state.smoothYaw2D) * smooth2D;
    state.smoothPitch2D += (state.targetPitch - state.smoothPitch2D) * smooth2D;

    updateFrames(delta);
    updateSprites(delta);
    updateCamera();
    updateTransforms();
    updateStatus();

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', handleResize);

enableGyroBtn.addEventListener('click', enableGyro);
calibrateBtn.addEventListener('click', calibrate);
toggleDragBtn.addEventListener('click', toggleDrag);
sceneSelect.addEventListener('change', event => {
  setupScene(event.target.value);
});

initGyro();
setupDragFallback();
loadConfig().then(() => {
  animate();
});
