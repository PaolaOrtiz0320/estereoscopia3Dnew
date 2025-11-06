// js/main.js
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Estado global ---
let camera, scene, renderer, clock, mixer;
let controls;
let currentState = 'MENU';

// Grupos por escena (para evitar mezclas)
let groupE1 = null;
let groupE2 = null;
let currentGroup = null;

// Tickets de carga (para ignorar callbacks tardíos)
let loadTokenE1 = 0;
let loadTokenE2 = 0;

// Gaze/VR UI
let reticle, raycaster, interactableGroup;
let currentGazeTarget = null;
let gazeDwellTime = 0;
const DWELL_TIME_THRESHOLD = 2.0;

// UI DOM
const uiMenu     = document.getElementById('menu-ui');
const uiGame     = document.getElementById('game-ui');
const btnToEnv1  = document.getElementById('btn-to-env1');
const btnToEnv2  = document.getElementById('btn-to-env2');
const btnToMenu  = document.getElementById('btn-to-menu');
const btnToOther = document.getElementById('btn-to-other');
const container  = document.getElementById('app-container');

// Navbar
const navMenu = document.getElementById('nav-menu');
const navE1   = document.getElementById('nav-e1');
const navE2   = document.getElementById('nav-e2');

// Footer año
document.getElementById('year').textContent = new Date().getFullYear();

// --- Init ---
function init() {
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Altura “humana” por defecto
  camera.position.set(0, 1.6, 3);
  camera.lookAt(0, 1.6, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;

  // Botón VR
  const vrBtn = VRButton.createButton(renderer);
  const vrSlot = document.getElementById('vr-slot');
  if (vrSlot) vrSlot.appendChild(vrBtn);
  container.appendChild(renderer.domElement);

  // Raycaster + interactuables VR
  raycaster = new THREE.Raycaster();
  interactableGroup = new THREE.Group();
  scene.add(interactableGroup);

  // Retícula para VR
  const reticleGeo = new THREE.CircleGeometry(0.002, 16);
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthTest: false, transparent: true, opacity: 0.8 });
  reticle = new THREE.Mesh(reticleGeo, reticleMat);
  reticle.position.z = -0.5;
  reticle.renderOrder = 999;
  camera.add(reticle);

  renderer.xr.addEventListener('sessionstart', updateUIVisibility);
  renderer.xr.addEventListener('sessionend', updateUIVisibility);

  // Botones overlay
  btnToEnv1.onclick = () => switchScene('ESCENARIO_1');
  btnToEnv2.onclick = () => switchScene('ESCENARIO_2');
  btnToMenu.onclick = () => switchScene('MENU');

  // Navbar
  navMenu.onclick = () => switchScene('MENU');
  navE1.onclick   = () => switchScene('ESCENARIO_1');
  navE2.onclick   = () => switchScene('ESCENARIO_2');

  window.addEventListener('resize', onWindowResize);
  renderer.setAnimationLoop(animate);

  switchScene('MENU');
}

// --- Loop ---
function animate() {
  const delta = clock.getDelta();
  if (controls) controls.update();
  if (mixer) mixer.update(delta);

  handleGazeInteraction(delta);
  renderer.render(scene, camera);
}

// --- Cambio de escena robusto ---
function switchScene(newState) {
  currentState = newState;

  // Detener y limpiar controles/animaciones
  if (controls) { controls.dispose(); controls = null; }
  mixer = null;

  // Eliminar grupo actual (si existe)
  if (currentGroup) {
    scene.remove(currentGroup);
    currentGroup.traverse(obj => {
      if (obj.isMesh && obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    currentGroup = null;
  }

  // Reset tickets (para invalidar cargas anteriores)
  if (newState === 'ESCENARIO_1') loadTokenE1++;
  if (newState === 'ESCENARIO_2') loadTokenE2++;

  // Ajustes base de cámara (evita “negro” en móvil/VR)
  camera.position.set(0, 1.6, 4);
  camera.lookAt(0, 1.6, 0);

  // Fondo por estado
  if (newState === 'MENU') {
    setupMenu();
    createVRMenu();
  } else if (newState === 'ESCENARIO_1') {
    setupEscenario1();
    createVRGameUI();
  } else if (newState === 'ESCENARIO_2') {
    setupEscenario2();
    createVRGameUI();
  }

  updateUIVisibility();
}

// --- Escenas ---
function setupMenu() {
  scene.background = new THREE.Color(0x11151b);

  // Luz sutil
  const amb = new THREE.AmbientLight(0xffffff, 0.6);
  const dir = new THREE.DirectionalLight(0x88ccff, 0.8); dir.position.set(3, 5, 2);

  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 1),
    new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.2, color: 0x67b7ff, emissive: 0x0a2f66, emissiveIntensity: 0.25 })
  );
  mesh.position.set(0, 0, -2);

  const g = new THREE.Group();
  g.add(amb, dir, mesh);
  scene.add(camera, interactableGroup, g);
  currentGroup = g;
}

function setupEscenario1() {
  scene.background = new THREE.Color(0x0d2338);

  const token = loadTokenE1; // captura el ticket actual

  // Grupo del mapa
  groupE1 = new THREE.Group();
  currentGroup = groupE1;
  scene.add(camera, interactableGroup, groupE1);

  // Luces
  groupE1.add(new THREE.HemisphereLight(0x9ad7ff, 0x001e2e, 1.3));
  const dir = new THREE.DirectionalLight(0xffffff, 2.0);
  dir.position.set(-5, 25, -1);
  groupE1.add(dir);

  // Cámara inicial pensada para ver el mapa en móvil/VR
  camera.position.set(0, 1.7, 8);
  camera.lookAt(0, 1.6, 0);

  // Controles (solo fuera de VR tienen sentido)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.target.set(0, 1.6, 0);

  // Cargar GLB del mapa (con “ticket”)
  const loader = new GLTFLoader();
  const mapaUrl = new URL('../models/Fnafmovie_map.glb', import.meta.url);
  loader.load(
    mapaUrl.href,
    (gltf) => {
      // Si cambiaste de escena, ignora este callback
      if (currentState !== 'ESCENARIO_1' || token !== loadTokenE1) return;

      const root = gltf.scene;
      root.rotation.y = -Math.PI / 2;
      groupE1.add(root);

      // Opcional: si el mapa es enorme, centra cámara frente a él
      // camera.position.set(0, 1.7, 10);
      // controls.target.set(0, 1.6, 0);
    },
    undefined,
    (e) => console.error('Error cargando mapa GLB:', e)
  );
}

function setupEscenario2() {
  scene.background = new THREE.Color(0x081a28);

  const token = loadTokenE2;

  // Grupo del personaje
  groupE2 = new THREE.Group();
  currentGroup = groupE2;
  scene.add(camera, interactableGroup, groupE2);

  // Luces y suelo para no ver “negro”
  groupE2.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
  const dir = new THREE.DirectionalLight(0xffffff, 2.0); dir.position.set(1, 3, 2);
  groupE2.add(dir);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x0f2d3f, roughness: 1, metalness: 0, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  groupE2.add(floor);

  // Cámara frente al personaje
  camera.position.set(0, 1.6, 3.5);
  camera.lookAt(0, 1.2, -2.5);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.2, -2.5);

  // Cargar modelo Paladin y aplicar animación Boxing (con “ticket”)
  const fbxLoader = new FBXLoader();
  const urlModel = '../models/Paladin_WProp_J_Nordstrom.fbx';
  const urlAnim  = '../models/Boxing.fbx';

  fbxLoader.load(
    urlModel,
    (obj) => {
      if (currentState !== 'ESCENARIO_2' || token !== loadTokenE2) return;

      obj.scale.set(0.01, 0.01, 0.01);
      obj.position.set(0, 0, -2.5);
      obj.rotation.y = Math.PI * 0.2;
      obj.traverse(ch => { if (ch.isMesh) ch.castShadow = true; });
      groupE2.add(obj);

      mixer = new THREE.AnimationMixer(obj);

      // Carga animación aparte y la aplica al esqueleto del modelo actual
      fbxLoader.load(
        urlAnim,
        (anim) => {
          if (currentState !== 'ESCENARIO_2' || token !== loadTokenE2) return;
          anim.animations.forEach(clip => mixer.clipAction(clip).play());
        },
        undefined,
        (err) => console.error('Error cargando animación Boxing:', err)
      );
    },
    undefined,
    (err) => console.error('Error cargando modelo Paladin:', err)
  );
}

// --- Botones VR (mallas HUD) ---
function createButtonMesh(text, name, yPos) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512; canvas.height = 128;

  const grd = ctx.createLinearGradient(0,0,0,128);
  grd.addColorStop(0, '#5ab8ff'); grd.addColorStop(1, '#2f8fff');
  ctx.fillStyle = grd; ctx.fillRect(0,0,512,128);

  ctx.fillStyle = 'white';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8;
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.PlaneGeometry(1, 0.25);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(0, yPos, -2);
  mesh.renderOrder = 998;
  return mesh;
}

function createVRMenu() {
  interactableGroup.clear();
  interactableGroup.add(
    createButtonMesh('Ir al Mapa (E1)', 'btn-to-env1', 0.5),
    createButtonMesh('Ir al Personaje (E2)', 'btn-to-env2', 0.25),
  );
}

function createVRGameUI() {
  interactableGroup.clear();
  interactableGroup.add(createButtonMesh('Volver al Menú', 'btn-to-menu', 0.5));

  let text, name;
  if (currentState === 'ESCENARIO_1') { text = 'Ir al Personaje (E2)'; name = 'btn-to-env2'; }
  else { text = 'Ir al Mapa (E1)'; name = 'btn-to-env1'; }
  interactableGroup.add(createButtonMesh(text, name, 0.25));
}

// --- Visibilidad UI ---
function updateUIVisibility() {
  const isVR = renderer.xr.isPresenting;
  if (reticle) reticle.visible = isVR;
  interactableGroup.visible = isVR;

  uiMenu.style.display = (isVR || currentState !== 'MENU') ? 'none' : 'flex';
  uiGame.style.display = (isVR || currentState === 'MENU') ? 'none' : 'flex';

  if (!isVR) {
    if (currentState === 'ESCENARIO_1') {
      btnToOther.innerText = 'Ir al Personaje (E2)';
      btnToOther.onclick = () => switchScene('ESCENARIO_2');
    } else if (currentState === 'ESCENARIO_2') {
      btnToOther.innerText = 'Ir al Mapa (E1)';
      btnToOther.onclick = () => switchScene('ESCENARIO_1');
    }
  }
}

// --- Gaze select ---
function handleGazeInteraction(delta) {
  if (!renderer.xr.isPresenting) return;

  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const intersects = raycaster.intersectObjects(interactableGroup.children);

  let target = intersects.length ? intersects[0].object : null;
  if (target !== currentGazeTarget) { currentGazeTarget = target; gazeDwellTime = 0; }

  interactableGroup.children.forEach(ch => ch.scale.set(1,1,1));

  if (currentGazeTarget) {
    currentGazeTarget.scale.set(1.15, 1.15, 1.15);
    gazeDwellTime += delta;
    if (gazeDwellTime >= DWELL_TIME_THRESHOLD) {
      onGazeSelect(currentGazeTarget);
      gazeDwellTime = 0;
    }
  }
}

function onGazeSelect(obj) {
  if (!obj) return;
  switch (obj.name) {
    case 'btn-to-env1': switchScene('ESCENARIO_1'); break;
    case 'btn-to-env2': switchScene('ESCENARIO_2'); break;
    case 'btn-to-menu': switchScene('MENU'); break;
  }
}

// --- Resize ---
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
