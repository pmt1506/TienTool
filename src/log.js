import { createIcons, icons } from 'lucide';

// Clear body completely
document.body.innerHTML = `
  <div class="h-screen w-screen bg-[#0d1117] text-gray-300 font-mono text-[11px] flex flex-col overflow-hidden drag-region relative">
    <div class="flex items-center justify-between bg-surface-dark border-b border-white/[0.06] h-[34px] px-3 shrink-0">
      <div class="flex items-center gap-2">
        <i data-lucide="terminal" class="w-4 h-4 text-brand-400"></i>
        <span class="text-xs font-semibold tracking-wide">Application Logs</span>
      </div>
      <div class="flex items-center gap-2 no-drag">
        <button id="btn-clear-log" class="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition-colors">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Clear
        </button>
        <button id="btn-close-log" class="w-8 h-[24px] flex items-center justify-center text-gray-400 hover:bg-red-500 hover:text-white rounded transition-colors" title="Đóng">
          <svg width="10" height="10" viewBox="0 0 12 12">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      </div>
    </div>
    
    <div id="log-container" class="flex-1 overflow-y-auto scrollbar-thin p-3 whitespace-pre-wrap select-text break-all flex flex-col gap-1 no-drag">
    </div>
  </div>
`;

createIcons({ icons });

const api = window.electronAPI;
const logContainer = document.getElementById('log-container');

document.getElementById('btn-clear-log').addEventListener('click', () => {
  logContainer.innerHTML = '';
});

document.getElementById('btn-close-log').addEventListener('click', () => {
  window.close();
});

api.onAppLog((msg) => {
  const line = document.createElement('div');
  line.textContent = msg;
  if (msg.startsWith('[ERROR]')) {
    line.className = 'text-red-400';
  } else if (msg.startsWith('[WARN]')) {
    line.className = 'text-yellow-400';
  } else {
    line.className = 'text-gray-300';
  }
  logContainer.appendChild(line);
  
  // Auto scroll
  if (logContainer.scrollHeight - logContainer.scrollTop < logContainer.clientHeight + 100) {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
});

// Notify that log window is ready
console.log('[INFO] Log window initialized');
