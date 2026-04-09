const STORAGE_KEY = 'dealos-core-loop-v1';
const PIPELINE_STAGES = ['Identified', 'Contacted', 'Engaged', 'Evaluating', 'Negotiation', 'Closed'];

const defaultState = {
  targets: [],
  communications: []
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
      communications: Array.isArray(parsed.communications) ? parsed.communications : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatCurrency(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function populateStageSelect(select) {
  select.innerHTML = PIPELINE_STAGES.map(stage => `<option value="${stage}">${stage}</option>`).join('');
}

function syncSelects() {
  populateStageSelect(document.getElementById('targetStage'));
  populateStageSelect(document.getElementById('commStageMove'));

  const targetOptions = state.targets
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(target => `<option value="${target.id}">${target.name}</option>`)
    .join('');

  const commTarget = document.getElementById('commTarget');
  commTarget.innerHTML = state.targets.length
    ? targetOptions
    : '<option value="">No targets yet — create one first</option>';
}

function getCommsForTarget(targetId) {
  return state.communications.filter(c => c.targetId === targetId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getTarget(targetId) {
  return state.targets.find(t => t.id === targetId);
}

function recalcTargetTouchMetadata() {
  state.targets.forEach(target => {
    const comms = getCommsForTarget(target.id);
    target.lastTouch = comms[0]?.timestamp || '';
    target.nextFollowUp = comms.find(c => c.followUp)?.followUp || '';
  });
}

function renderMetrics() {
  const metrics = document.getElementById('metricGrid');
  const tmpl = document.getElementById('metricTemplate');
  metrics.innerHTML = '';

  const closedDeals = state.targets.filter(t => t.stage === 'Closed').length;
  const totalTargets = state.targets.length;
  const outreachCount = state.communications.length;
  const engagedCount = state.targets.filter(t => ['Engaged', 'Evaluating', 'Negotiation', 'Closed'].includes(t.stage)).length;
  const pipelineValue = state.targets.reduce((sum, t) => sum + Number(t.value || 0), 0);
  const followUpsDue = state.communications.filter(c => c.followUp && new Date(`${c.followUp}T23:59:59`) < new Date()).length;

  const metricData = [
    ['Targets', totalTargets, totalTargets ? 'Active list of people or entities in play' : 'Add your first target'],
    ['Outreach Logged', outreachCount, outreachCount ? 'Every outbound action increases pressure' : 'No outreach logged yet'],
    ['Engaged+', engagedCount, 'Targets beyond simple identification'],
    ['Pipeline Value', formatCurrency(pipelineValue), 'Estimated total value in play'],
    ['Closed Deals', closedDeals, closedDeals ? 'Progress is real' : 'Still hunting the first win'],
    ['Follow-Ups Overdue', followUpsDue, followUpsDue ? 'These need attention now' : 'No overdue follow-ups']
  ];

  metricData.forEach(([label, value, note]) => {
    const node = tmpl.content.cloneNode(true);
    node.querySelector('.metric-label').textContent = label;
    node.querySelector('.metric-value').textContent = value;
    node.querySelector('.metric-note').textContent = note;
    metrics.appendChild(node);
  });

  document.getElementById('closeGoalLabel').textContent = `${closedDeals} / 1 deal closed`;
  document.getElementById('closeGoalBar').style.width = `${Math.min(100, closedDeals * 100)}%`;

  const sortedComms = state.communications.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  document.getElementById('lastActionBadge').textContent = sortedComms[0]
    ? `Last action: ${formatDateTime(sortedComms[0].timestamp)}`
    : 'No actions yet';

  const pressureList = document.getElementById('pressureList');
  const items = buildPressureItems();
  pressureList.innerHTML = items.map(item => `<li>${item}</li>`).join('');
}

function buildPressureItems() {
  const items = [];
  const totalTargets = state.targets.length;
  const outreachCount = state.communications.length;
  const engaged = state.targets.filter(t => t.stage === 'Engaged').length;
  const evaluating = state.targets.filter(t => t.stage === 'Evaluating').length;
  const negotiation = state.targets.filter(t => t.stage === 'Negotiation').length;
  const overdueComms = state.communications.filter(c => c.followUp && new Date(`${c.followUp}T23:59:59`) < new Date());

  if (totalTargets < 10) items.push(`Target count is ${totalTargets}. Push toward 10 names so the system has enough surface area.`);
  if (outreachCount < 20) items.push(`Outreach logged is ${outreachCount}. Push toward 20 attempts before expanding the app.`);
  if (engaged < 3) items.push(`Only ${engaged} target(s) are in Engaged. The app should create pressure to move at least 3 there.`);
  if (evaluating === 0 && negotiation === 0 && totalTargets > 0) items.push('No targets are currently evaluating or negotiating. Someone needs a clearer ask or follow-up.');
  if (overdueComms.length) items.push(`${overdueComms.length} follow-up item(s) are overdue. Start there today.`);
  if (!items.length) items.push('Core loop is moving. Keep reaching out, keep logging, keep advancing the board.');
  return items;
}

function renderTargetsTable() {
  const tbody = document.getElementById('targetsTableBody');
  const rows = state.targets.slice().sort((a, b) => {
    const stageDiff = PIPELINE_STAGES.indexOf(a.stage) - PIPELINE_STAGES.indexOf(b.stage);
    if (stageDiff !== 0) return stageDiff;
    return a.name.localeCompare(b.name);
  });

  tbody.innerHTML = rows.length ? rows.map(target => `
    <tr>
      <td>
        <strong>${escapeHtml(target.name)}</strong><br>
        <span class="muted">${escapeHtml(target.organization || '')}</span>
      </td>
      <td>${escapeHtml(target.source)}</td>
      <td>${escapeHtml(target.stage)}</td>
      <td>${target.value ? formatCurrency(target.value) : '—'}</td>
      <td>${formatDateTime(target.lastTouch)}</td>
      <td>
        <div class="small-actions">
          <button type="button" class="secondary" onclick="editTarget('${target.id}')">Edit</button>
          <button type="button" class="danger" onclick="deleteTarget('${target.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="6" class="muted">No targets yet.</td></tr>`;
}

function renderCommunications() {
  const list = document.getElementById('commList');
  const comms = state.communications.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  list.innerHTML = comms.length ? comms.map(comm => {
    const target = getTarget(comm.targetId);
    return `
      <article class="comm-card">
        <div class="comm-top">
          <div>
            <h3>${escapeHtml(target?.name || 'Unknown Target')}</h3>
            <p class="comm-meta">${escapeHtml(comm.type)} · ${formatDateTime(comm.timestamp)}</p>
          </div>
          <span class="badge">${escapeHtml(comm.outcome)}</span>
        </div>
        <p>${escapeHtml(comm.summary)}</p>
        <p class="comm-meta">Follow-up: ${formatDate(comm.followUp)} · Stage move: ${escapeHtml(comm.stageMove || '—')}</p>
        <div class="small-actions">
          <button type="button" class="secondary" onclick="editComm('${comm.id}')">Edit</button>
          <button type="button" class="danger" onclick="deleteComm('${comm.id}')">Delete</button>
        </div>
      </article>
    `;
  }).join('') : '<p class="muted">No communications logged yet.</p>';
}

function renderPipeline() {
  const board = document.getElementById('pipelineBoard');
  board.innerHTML = PIPELINE_STAGES.map(stage => {
    const stageTargets = state.targets.filter(t => t.stage === stage).sort((a, b) => a.name.localeCompare(b.name));
    return `
      <section class="pipeline-column">
        <h3>${stage}</h3>
        <p class="pipeline-count">${stageTargets.length} target(s)</p>
        ${stageTargets.map(target => `
          <article class="pipeline-target">
            <div class="target-chip-row">
              <strong>${escapeHtml(target.name)}</strong>
              <span class="badge">${target.value ? formatCurrency(target.value) : 'No value'}</span>
            </div>
            <p class="muted">${escapeHtml(target.source)} · Warmth ${escapeHtml(String(target.warmth))}</p>
            <p class="muted">Last touch: ${formatDateTime(target.lastTouch)}</p>
            <select onchange="moveTargetStage('${target.id}', this.value)">
              ${PIPELINE_STAGES.map(option => `<option value="${option}" ${option === target.stage ? 'selected' : ''}>${option}</option>`).join('')}
            </select>
          </article>
        `).join('') || '<p class="muted">No targets here.</p>'}
      </section>
    `;
  }).join('');
}

function renderAll() {
  recalcTargetTouchMetadata();
  saveState();
  syncSelects();
  renderMetrics();
  renderTargetsTable();
  renderCommunications();
  renderPipeline();
}

function resetTargetForm() {
  document.getElementById('targetForm').reset();
  document.getElementById('targetId').value = '';
  document.getElementById('targetWarmth').value = '3';
  document.getElementById('targetStage').value = 'Identified';
}

function resetCommForm() {
  document.getElementById('commForm').reset();
  document.getElementById('commId').value = '';
  document.getElementById('commTimestamp').value = toLocalInputValue(new Date());
  document.getElementById('commOutcome').value = 'No Response Yet';
  document.getElementById('commStageMove').value = 'Contacted';
}

function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.getElementById('targetForm').addEventListener('submit', event => {
  event.preventDefault();
  const id = document.getElementById('targetId').value || uid('target');
  const record = {
    id,
    name: document.getElementById('targetName').value.trim(),
    organization: document.getElementById('targetOrg').value.trim(),
    source: document.getElementById('targetSource').value,
    value: document.getElementById('targetValue').value,
    warmth: document.getElementById('targetWarmth').value,
    stage: document.getElementById('targetStage').value,
    notes: document.getElementById('targetNotes').value.trim(),
    lastTouch: '',
    nextFollowUp: ''
  };

  const index = state.targets.findIndex(t => t.id === id);
  if (index >= 0) state.targets[index] = { ...state.targets[index], ...record };
  else state.targets.push(record);
  resetTargetForm();
  renderAll();
});

document.getElementById('commForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!state.targets.length) return;
  const id = document.getElementById('commId').value || uid('comm');
  const record = {
    id,
    targetId: document.getElementById('commTarget').value,
    type: document.getElementById('commType').value,
    timestamp: document.getElementById('commTimestamp').value,
    outcome: document.getElementById('commOutcome').value,
    followUp: document.getElementById('commFollowUp').value,
    stageMove: document.getElementById('commStageMove').value,
    summary: document.getElementById('commSummary').value.trim()
  };

  const index = state.communications.findIndex(c => c.id === id);
  if (index >= 0) state.communications[index] = record;
  else state.communications.push(record);

  const target = getTarget(record.targetId);
  if (target && record.stageMove) target.stage = record.stageMove;

  resetCommForm();
  renderAll();
});

document.getElementById('clearTargetBtn').addEventListener('click', resetTargetForm);
document.getElementById('clearCommBtn').addEventListener('click', resetCommForm);

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `dealos-core-loop-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById('importInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.targets) || !Array.isArray(parsed.communications)) throw new Error('Invalid format');
    state = parsed;
    renderAll();
    resetTargetForm();
    resetCommForm();
  } catch {
    alert('Import failed. Please use a valid DealOS JSON export file.');
  }
  event.target.value = '';
});

document.getElementById('resetBtn').addEventListener('click', () => {
  const confirmed = confirm('Reset DealOS Core Loop? This will erase local data stored in this browser.');
  if (!confirmed) return;
  state = structuredClone(defaultState);
  renderAll();
  resetTargetForm();
  resetCommForm();
});

window.editTarget = function editTarget(id) {
  const target = getTarget(id);
  if (!target) return;
  document.getElementById('targetId').value = target.id;
  document.getElementById('targetName').value = target.name;
  document.getElementById('targetOrg').value = target.organization || '';
  document.getElementById('targetSource').value = target.source;
  document.getElementById('targetValue').value = target.value || '';
  document.getElementById('targetWarmth').value = target.warmth;
  document.getElementById('targetStage').value = target.stage;
  document.getElementById('targetNotes').value = target.notes || '';
  location.hash = '#targets';
};

window.deleteTarget = function deleteTarget(id) {
  if (!confirm('Delete this target and all linked communications?')) return;
  state.targets = state.targets.filter(t => t.id !== id);
  state.communications = state.communications.filter(c => c.targetId !== id);
  renderAll();
};

window.editComm = function editComm(id) {
  const comm = state.communications.find(c => c.id === id);
  if (!comm) return;
  document.getElementById('commId').value = comm.id;
  document.getElementById('commTarget').value = comm.targetId;
  document.getElementById('commType').value = comm.type;
  document.getElementById('commTimestamp').value = comm.timestamp;
  document.getElementById('commOutcome').value = comm.outcome;
  document.getElementById('commFollowUp').value = comm.followUp || '';
  document.getElementById('commStageMove').value = comm.stageMove || 'Contacted';
  document.getElementById('commSummary').value = comm.summary;
  location.hash = '#communications';
};

window.deleteComm = function deleteComm(id) {
  if (!confirm('Delete this communication entry?')) return;
  state.communications = state.communications.filter(c => c.id !== id);
  renderAll();
};

window.moveTargetStage = function moveTargetStage(id, stage) {
  const target = getTarget(id);
  if (!target) return;
  target.stage = stage;
  renderAll();
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}

syncSelects();
resetTargetForm();
resetCommForm();
renderAll();
