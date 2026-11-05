import { defaults as tuningDefaults } from './tuning.js';
import './settings.css';

const actions = {
  forward: ['Forward', ['KeyW']], back: ['Back', ['KeyS']], left: ['Left', ['KeyA']], right: ['Right', ['KeyD']],
  jump: ['Jump', ['Space']], slide: ['Slide / crouch', ['ShiftLeft', 'ShiftRight']],
  hook: ['Hook', ['Mouse2']], fire: ['Fire', ['Mouse0']], whip: ['Whip', ['KeyE']], melee: ['Melee kick', ['KeyV']], yank: ['Yank', ['KeyQ']],
  reload: ['Reload', ['KeyF']], camera: ['Camera toggle', ['KeyB']], shoulder: ['Swap shoulder', ['KeyC']],
};
const defaults = {
  sensitivity: 1, invertY: false, heldSensitivity: tuningDefaults.heldSensitivity,
  fov: 72, shoulder: 'right', distance: 'default', perspective: 'third',
  showSpeed: true, showInputs: false, showControls: false, showFps: false, volume: 1,
  bindings: Object.fromEntries(Object.entries(actions).map(([name, [, keys]]) => [name, keys])),
};
const copyDefaults = () => structuredClone(defaults);
let saved = {};
try { saved = JSON.parse(localStorage.getItem('grapple-settings') || '{}') || {}; } catch {}
export const settings = copyDefaults();
for (const [key, value] of Object.entries(saved)) {
  if (!(key in defaults) || key === 'bindings') continue;
  if (typeof value !== typeof defaults[key]) continue;
  if (typeof value === 'number') {
    const bounds = { sensitivity: [0.1, 5], heldSensitivity: [0.01, 2], fov: [60, 110], volume: [0, 1] }[key];
    if (!Number.isFinite(value) || value < bounds[0] || value > bounds[1]) continue;
  }
  if (key === 'shoulder' && !['left', 'right'].includes(value) || key === 'distance' && !['near', 'default', 'far'].includes(value) || key === 'perspective' && !['first', 'third'].includes(value)) continue;
  settings[key] = value;
}
if (saved.bindings && typeof saved.bindings === 'object') {
  if (!('melee' in saved.bindings) && Array.isArray(saved.bindings.camera) && saved.bindings.camera.length === 1 && saved.bindings.camera[0] === 'KeyV') saved.bindings.camera = ['KeyB'];
  for (const name of Object.keys(actions)) {
    const value = saved.bindings[name];
    if (Array.isArray(value) && value.length && value.every((v) => typeof v === 'string' && /^(Key[A-Z]|Digit[0-9]|Mouse[0-4]|[A-Za-z][A-Za-z0-9]*)$/.test(v))) settings.bindings[name] = value;
  }
}
const save = () => { try { localStorage.setItem('grapple-settings', JSON.stringify(settings)); } catch {} };
export const saveSettings = save;
const labelKey = (key) => ({ Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Mouse3: 'Mouse side 1', Mouse4: 'Mouse side 2', Space: 'Space' }[key] || key.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Left Shift').replace('ShiftRight', 'Right Shift'));

export function createSettings(canvas, onChange) {
  const overlay = document.createElement('div');
  overlay.id = 'settings-menu';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div class="settings-brand"><b>Hang Time!</b><h1 id="settings-title">Settings</h1></div><button id="settings-resume">RESUME</button></header><div class="settings-room" hidden></div><div class="settings-body"><section id="settings-options"></section><section><h2>CONTROLS</h2><p>Click a binding, then press a key or mouse button. Esc cancels.</p><div id="settings-bindings"></div></section></div><footer><span class="settings-hint">Game paused · press <kbd>ESC</kbd> or RESUME to play</span><button id="settings-reset">RESET TO DEFAULTS</button></footer></div>`;
  document.body.append(overlay);
  const options = overlay.querySelector('#settings-options');
  const bindings = overlay.querySelector('#settings-bindings');
  const roomSlot = overlay.querySelector('.settings-room');
  const roomPanel = document.querySelector('.online-panel');
  let started = false, capturing = null;
  const fields = [
    ['LOOK', 'heading'], ['sensitivity', 'Mouse sensitivity', 'number', 0.1, 5, 0.01], ['invertY', 'Invert Y', 'checkbox'], ['heldSensitivity', 'Held-button sensitivity', 'number', 0.01, 2, 0.01],
    ['CAMERA', 'heading'], ['fov', 'Field of view', 'number', 60, 110, 1], ['shoulder', 'Camera shoulder', 'select', ['right', 'left']], ['distance', 'Camera distance', 'select', ['near', 'default', 'far']], ['perspective', 'Default perspective', 'select', ['third', 'first']],
    ['DISPLAY & AUDIO', 'heading'], ['showSpeed', 'Speed readout', 'checkbox'], ['showInputs', 'Input display', 'checkbox'], ['showControls', 'Controls list', 'checkbox'], ['showFps', 'FPS counter', 'checkbox'], ['volume', 'Master volume', 'number', 0, 1, 0.01],
  ];
  function apply() {
    // (the controls list is the HUD's: it follows settings.showControls and the H key)
    for (const [id, show] of [['speed', settings.showSpeed], ['inputs', settings.showInputs], ['fps-counter', settings.showFps]]) document.getElementById(id).style.display = show ? '' : 'none';
    onChange();
  }
  function drawOptions() {
    options.replaceChildren();
    for (const [key, title, type, min, max, step] of fields) {
      if (title === 'heading') { const h = document.createElement('h2'); h.textContent = key; options.append(h); continue; }
      const row = document.createElement(type === 'select' ? 'div' : 'label'); row.className = 'settings-row';
      const text = document.createElement('span'); text.textContent = title; row.append(text);
      if (type === 'number') {
        const range = document.createElement('input'), number = document.createElement('input');
        range.type = 'range'; number.type = 'number';
        for (const input of [range, number]) { input.min = min; input.max = max; input.step = step; input.value = settings[key]; input.dataset.setting = key; }
        const update = (event) => { const value = Number(event.target.value); if (!Number.isFinite(value) || event.target.value === '') return; settings[key] = Math.min(max, Math.max(min, value)); range.value = number.value = settings[key]; save(); apply(); };
        range.addEventListener('input', update); number.addEventListener('change', update); row.append(range, number);
      } else if (type === 'select') {
        // Segmented pill buttons rather than a native dropdown.
        const group = document.createElement('div'); group.className = 'settings-pills'; group.dataset.setting = key; group.setAttribute('role', 'radiogroup');
        for (const choice of min) {
          const pill = document.createElement('button'); pill.type = 'button'; pill.dataset.value = choice; pill.textContent = choice.toUpperCase();
          pill.setAttribute('role', 'radio');
          const mark = () => group.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.value === settings[key]); b.setAttribute('aria-checked', b.dataset.value === settings[key]); });
          pill.onclick = (event) => { event.preventDefault(); settings[key] = choice; save(); apply(); mark(); };
          group.append(pill); mark();
        }
        row.append(group);
      } else {
        const input = document.createElement('input'); input.dataset.setting = key;
        input.type = 'checkbox'; input.checked = settings[key];
        input.addEventListener('change', () => { settings[key] = input.checked; save(); apply(); }); row.append(input);
      }
      options.append(row);
    }
  }
  function drawBindings() {
    bindings.replaceChildren();
    for (const [name, [title]] of Object.entries(actions)) {
      const row = document.createElement('div'); row.className = 'binding-row';
      const text = document.createElement('span'); text.textContent = title;
      const button = document.createElement('button'); button.dataset.binding = name;
      const conflicts = Object.entries(settings.bindings).filter(([other, keys]) => other !== name && keys.some((key) => settings.bindings[name].includes(key))).map(([other]) => actions[other][0]);
      button.textContent = capturing === name ? 'PRESS A KEY…' : settings.bindings[name].map(labelKey).join(' / ');
      if (conflicts.length) { button.classList.add('conflict'); button.title = `Conflicts with ${conflicts.join(', ')}`; button.textContent += ` ⚠ ${conflicts.join(', ')}`; }
      button.onclick = () => { capturing = name; drawBindings(); };
      row.append(text, button); bindings.append(row);
    }
  }
  function capture(event, code) {
    if (!capturing) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (code !== 'Escape') { settings.bindings[capturing] = [code]; save(); apply(); }
    capturing = null; drawBindings();
  }
  addEventListener('keydown', (event) => capture(event, event.code), true);
  addEventListener('mousedown', (event) => { if (capturing) capture(event, `Mouse${event.button}`); }, true);
  overlay.addEventListener('contextmenu', (event) => event.preventDefault());
  overlay.addEventListener('auxclick', (event) => event.preventDefault());
  overlay.addEventListener('mouseup', (event) => { if (event.button >= 3) event.preventDefault(); });
  overlay.querySelector('#settings-resume').onclick = () => { capturing = null; canvas.requestPointerLock(); };
  overlay.querySelector('#settings-reset').onclick = () => { Object.assign(settings, copyDefaults()); save(); drawOptions(); drawBindings(); apply(); };
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) started = true;
    overlay.hidden = !started || document.pointerLockElement === canvas;
    if (roomPanel) {
      roomSlot.hidden = overlay.hidden;
      if (overlay.hidden) document.body.append(roomPanel);
      else roomSlot.append(roomPanel);
    }
    if (overlay.hidden) capturing = null;
  });
  const fps = document.createElement('div'); fps.id = 'fps-counter'; document.body.append(fps);
  drawOptions(); drawBindings(); apply();
  return { get open() { return !overlay.hidden; }, updateFps(dt) { if (dt > 0) fps.textContent = `${Math.round(1 / dt)} FPS`; } };
}
