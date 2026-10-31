const DEFAULTS = globalThis.GRID_DEFAULTS;
const NUMBER_FIELDS = ['columnCount', 'gutter', 'maxWidth', 'margin', 'baselineStep'];
const TOGGLE_FIELDS = ['snap', 'spacing', 'columns', 'baseline'];
const $ = (id) => document.getElementById(id);

let tabId = null;
let settings = { ...DEFAULTS };

async function send(message) {
  const state = await chrome.tabs.sendMessage(tabId, message);
  showState(state);
  return state;
}

function showState({ visible, drawing, count }) {
  $('visible').checked = visible;
  $('draw').textContent = drawing ? 'Stop drawing' : 'Draw lines';
  const lines = `${count} line${count === 1 ? '' : 's'}`;
  $('status').textContent = drawing ? `Drawing · ${lines}` : visible ? `Showing · ${lines}` : count ? `Hidden · ${lines}` : 'Off';
}

function showSettings() {
  for (const id of TOGGLE_FIELDS) $(id).checked = settings[id];
  for (const id of NUMBER_FIELDS) {
    if (document.activeElement !== $(id)) $(id).value = settings[id];
  }
  $('color').value = settings.color;
  document.documentElement.style.setProperty('--accent', settings.color);
  let preset = false;
  for (const swatch of document.querySelectorAll('[data-color]')) {
    const active = swatch.dataset.color === settings.color;
    swatch.classList.toggle('active', active);
    preset ||= active;
  }
  const custom = document.querySelector('.custom');
  custom.classList.toggle('active', !preset);
  custom.style.setProperty('--s', settings.color);
}

function saveSettings(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.local.set({ settings });
  showSettings();
}

async function init() {
  const stored = await chrome.storage.local.get('settings');
  settings = { ...DEFAULTS, ...stored.settings };
  showSettings();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['defaults.js', 'content.js'] });
    await send({ type: 'getState' });
  } catch {
    document.body.classList.add('blocked');
  }
  requestAnimationFrame(() => document.body.classList.add('ready'));

  const commands = await chrome.commands.getAll();
  $('shortcuts').replaceChildren(
    ...commands
      .filter((c) => c.description)
      .map((c) => {
        const row = document.createElement('div');
        const key = document.createElement('kbd');
        key.textContent = c.shortcut || 'not set';
        row.append(key, ` ${c.description}`);
        return row;
      }),
  );
}

$('draw').addEventListener('click', async () => {
  const state = await send({ type: 'getState' });
  await send({ type: 'setDrawing', value: !state.drawing });
  if (!state.drawing) window.close(); // get the popup out of the way so you can start clicking
});
$('visible').addEventListener('change', (e) => send({ type: 'setVisible', value: e.target.checked }));
$('undo').addEventListener('click', () => send({ type: 'undo' }));
$('clear').addEventListener('click', () => send({ type: 'clear' }));

for (const swatch of document.querySelectorAll('[data-color]')) {
  swatch.addEventListener('click', () => saveSettings({ color: swatch.dataset.color }));
}
$('color').addEventListener('input', (e) => saveSettings({ color: e.target.value }));

for (const id of TOGGLE_FIELDS) {
  $(id).addEventListener('change', (e) => saveSettings({ [id]: e.target.checked }));
}
for (const id of NUMBER_FIELDS) {
  $(id).addEventListener('input', (e) => {
    const value = Number(e.target.value);
    const min = Number(e.target.min) || 0;
    if (e.target.value !== '' && Number.isFinite(value) && value >= min) saveSettings({ [id]: value });
  });
}

$('edit-shortcuts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

init();
