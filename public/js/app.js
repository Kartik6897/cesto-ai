// CESTO AI Core Application Controller
document.addEventListener('DOMContentLoaded', () => {
  // App State variables
  let currentTab = 'dashboard';
  let statsData = null;
  let simulatorInterval = null;
  let chartInstances = {};
  
  // Initialize App
  init();

  async function init() {
    setupTabNavigation();
    await refreshDashboard();
    setupSimulator();
    setupForms();
    setupFileDropper();
    Agent.initChat();
    
    // Auto-poll stats every 5 seconds to keep charts and gauges updated
    setInterval(async () => {
      await fetchStatsOnly();
    }, 5000);
  }

  // ----------------------------------------------------
  // NAVIGATION CONTROLLER
  // ----------------------------------------------------
  function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    const subtitles = {
      dashboard: "Real-time LLM cost tracking and optimization",
      departments: "Set budgets, alert parameters, and model routes per department",
      ingest: "Ingest client logs, upload files, and simulate model workloads",
      agent: "Automate audits, run cost audits, and chat with CESTO AI"
    };

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = item.getAttribute('data-tab');
        
        // Update nav UI
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Update tab views
        tabContents.forEach(tab => tab.classList.remove('active'));
        const activeTabEl = document.getElementById(`tab-${tabName}`);
        if (activeTabEl) activeTabEl.classList.add('active');
        
        // Header Text updates
        currentTab = tabName;
        pageTitle.textContent = item.querySelector('span').textContent;
        pageSubtitle.textContent = subtitles[tabName] || "";
        
        // If switching to dashboard, trigger redraw to align charts properly
        if (tabName === 'dashboard') {
          setTimeout(updateCharts, 50);
        }
      });
    });
  }

  // ----------------------------------------------------
  // STATS & CHARTS CONTROLLER
  // ----------------------------------------------------
  async function refreshDashboard() {
    const data = await Api.getUsageData();
    if (!data) return;
    
    statsData = data;
    
    // Update KPI stats cards
    updateKpis();
    
    // Populate charts
    updateCharts();
    
    // Populate logs stream panel with initial database logs
    populateLogsConsole(statsData.logs);
    
    // Populate department configuration sliders
    populateDepartmentsForm(statsData.policies);
    
    // Render Agent recommendations list
    Agent.renderRecommendations(statsData.recommendations, (appliedResult) => {
      // Recommendation applied callback: refresh metrics immediately
      if (appliedResult.savings) {
        document.getElementById('stat-total-savings').textContent = `$${appliedResult.savings.toFixed(2)}`;
      }
      refreshDashboard();
    });

    // Populate high cost anomalies table
    populateAnomaliesTable(statsData.logs);
    
    // Check for budget breaches and show global alert
    checkBudgetAlerts();
  }

  // Fetch data in background without resetting active DOM elements
  async function fetchStatsOnly() {
    const data = await Api.getUsageData();
    if (!data) return;
    
    statsData.savings = data.savings;
    statsData.policies = data.policies;
    statsData.recommendations = data.recommendations;
    
    // Append any new logs that came in from simulation/external REST calls
    const currentLength = statsData.logs.length;
    const newLogs = data.logs.filter(log => !statsData.logs.some(l => l.id === log.id));
    if (newLogs.length > 0) {
      statsData.logs.push(...newLogs);
      newLogs.forEach(log => appendSingleConsoleLog(log));
      
      // Update charts and KPIs
      updateKpis();
      updateCharts();
      populateAnomaliesTable(statsData.logs);
      checkBudgetAlerts();
    }
  }

  function updateKpis() {
    if (!statsData) return;
    
    // Compute total cost and total tokens from current logs array
    const totalCost = statsData.logs.reduce((acc, log) => acc + log.cost, 0);
    const totalTokens = statsData.logs.reduce((acc, log) => acc + log.prompt_tokens + log.completion_tokens, 0);
    
    document.getElementById('stat-total-spend').textContent = `$${totalCost.toFixed(2)}`;
    document.getElementById('stat-total-savings').textContent = `$${statsData.savings.toFixed(2)}`;
    document.getElementById('stat-total-tokens').textContent = totalTokens.toLocaleString();
    
    const cachingStatus = document.getElementById('stat-caching-status');
    if (cachingStatus) {
      cachingStatus.textContent = statsData.policies.promptCaching ? 'Active (35% off)' : 'Disabled';
      cachingStatus.className = statsData.policies.promptCaching ? 'trend positive' : 'trend neutral';
    }
  }

  function checkBudgetAlerts() {
    if (!statsData || !statsData.policies) return;
    const banner = document.getElementById('global-alert-banner');
    const bannerText = document.getElementById('global-alert-text');
    if (!banner || !bannerText) return;
    
    const breaches = [];
    const approaching = [];
    
    Object.entries(statsData.policies.departments).forEach(([name, dept]) => {
      const percentage = (dept.current / dept.budget) * 100;
      if (dept.current >= dept.budget) {
        breaches.push(name);
      } else if (percentage >= dept.alertThreshold) {
        approaching.push(name);
      }
    });
    
    if (breaches.length > 0) {
      bannerText.innerHTML = `🚨 Budget Alert: <strong>${breaches.join(', ')}</strong> ${breaches.length > 1 ? 'have' : 'has'} exceeded their monthly AI allocation budget! Fallbacks applied.`;
      banner.classList.remove('hidden');
    } else if (approaching.length > 0) {
      bannerText.innerHTML = `⚠️ Threshold Warning: <strong>${approaching.join(', ')}</strong> ${approaching.length > 1 ? 'are' : 'is'} approaching their monthly budget limits.`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  function updateCharts() {
    if (!statsData || currentTab !== 'dashboard') return;
    
    const logs = statsData.logs;
    
    // Colors helper
    const colors = {
      emerald: '#00f59b',
      purple: '#a855f7',
      blue: '#3b82f6',
      orange: '#f97316',
      red: '#ef4444',
      slate: '#6b7280',
      borderGrid: 'rgba(255, 255, 255, 0.05)'
    };
    
    // --- 1. COST TREND (Last 7 Days) ---
    const trendCtx = document.getElementById('costTrendChart');
    if (trendCtx) {
      // Group costs by date
      const dateCosts = {};
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now - i * 24 * 3600 * 1000);
        const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        dateCosts[dateStr] = 0;
      }
      
      logs.forEach(log => {
        const logDate = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
        if (dateCosts[logDate] !== undefined) {
          dateCosts[logDate] += log.cost;
        }
      });
      
      const labels = Object.keys(dateCosts);
      const data = Object.values(dateCosts).map(v => parseFloat(v.toFixed(2)));
      
      if (chartInstances.trend) chartInstances.trend.destroy();
      chartInstances.trend = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Cost per Day ($)',
            data,
            borderColor: colors.emerald,
            backgroundColor: 'rgba(0, 245, 155, 0.05)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: colors.emerald,
            pointBorderColor: '#0a0d12',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: colors.borderGrid }, ticks: { color: '#9ca3af', font: { family: 'Inter' } } },
            y: { grid: { color: colors.borderGrid }, ticks: { color: '#9ca3af', font: { family: 'Inter' } } }
          }
        }
      });
    }
    
    // --- 2. SERVICE SHARE (Doughnut) ---
    const serviceCtx = document.getElementById('serviceShareChart');
    if (serviceCtx) {
      const serviceCosts = {};
      logs.forEach(log => {
        serviceCosts[log.service] = (serviceCosts[log.service] || 0) + log.cost;
      });
      
      const labels = Object.keys(serviceCosts);
      const data = Object.values(serviceCosts).map(v => parseFloat(v.toFixed(2)));
      
      if (chartInstances.service) chartInstances.service.destroy();
      chartInstances.service = new Chart(serviceCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: [colors.emerald, colors.purple, colors.blue, colors.orange, colors.slate],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, boxWidth: 10 }
            }
          },
          cutout: '65%'
        }
      });
    }

    // --- 3. DEPARTMENT BUDGET VS SPENT (Bar) ---
    const deptCtx = document.getElementById('departmentBudgetChart');
    if (deptCtx && statsData.policies) {
      const depts = Object.keys(statsData.policies.departments);
      const budgets = [];
      const spent = [];
      
      depts.forEach(name => {
        budgets.push(statsData.policies.departments[name].budget);
        spent.push(statsData.policies.departments[name].current);
      });
      
      if (chartInstances.dept) chartInstances.dept.destroy();
      chartInstances.dept = new Chart(deptCtx, {
        type: 'bar',
        data: {
          labels: depts,
          datasets: [
            {
              label: 'Current Spend ($)',
              data: spent,
              backgroundColor: spent.map((s, i) => s > budgets[i] ? colors.red : colors.emerald),
              borderRadius: 4
            },
            {
              label: 'Allocated Budget ($)',
              data: budgets,
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderColor: 'rgba(255,255,255,0.15)',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#9ca3af', font: { family: 'Inter', size: 10 } }
            }
          },
          scales: {
            x: { grid: { color: colors.borderGrid }, ticks: { color: '#9ca3af' } },
            y: { grid: { display: false }, ticks: { color: '#9ca3af' } }
          }
        }
      });
    }

    // --- 4. MODEL DISTRIBUTION ---
    const modelCtx = document.getElementById('modelDistChart');
    if (modelCtx) {
      const modelCounts = {};
      logs.forEach(log => {
        modelCounts[log.model] = (modelCounts[log.model] || 0) + 1;
      });
      
      const sortedModels = Object.entries(modelCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // show top 5 models
      
      const labels = sortedModels.map(m => m[0]);
      const data = sortedModels.map(m => m[1]);
      
      if (chartInstances.model) chartInstances.model.destroy();
      chartInstances.model = new Chart(modelCtx, {
        type: 'polarArea',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: [
              'rgba(0, 245, 155, 0.4)',
              'rgba(168, 85, 247, 0.4)',
              'rgba(59, 130, 246, 0.4)',
              'rgba(249, 115, 22, 0.4)',
              'rgba(239, 68, 68, 0.4)'
            ],
            borderColor: 'rgba(255,255,255,0.06)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#9ca3af', font: { family: 'Inter', size: 10 } }
            }
          },
          scales: {
            r: {
              grid: { color: colors.borderGrid },
              angleLines: { color: colors.borderGrid },
              ticks: { display: false }
            }
          }
        }
      });
    }
  }

  function populateAnomaliesTable(logs) {
    const tbody = document.querySelector('#anomaly-table tbody');
    if (!tbody) return;
    
    // Anomaly = request costing > 0.10
    const anomalies = logs
      .filter(l => l.cost > 0.10)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
      
    if (anomalies.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center muted">No anomalies tracked in active buffer logs.</td></tr>`;
      return;
    }
    
    tbody.innerHTML = '';
    anomalies.forEach(l => {
      const tr = document.createElement('tr');
      const timeStr = new Date(l.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      let badgeClass = 'normal';
      let statusText = 'Normal';
      if (l.routing_status.includes('cached')) { badgeClass = 'prompt_cached'; statusText = 'Cached'; }
      else if (l.routing_status.includes('fallback')) { badgeClass = 'fallback_routed'; statusText = 'Fallback'; }
      else if (l.routing_status.includes('optimized')) { badgeClass = 'optimized_routing'; statusText = 'Optimized'; }

      tr.innerHTML = `
        <td>${timeStr}</td>
        <td><strong>${l.department}</strong></td>
        <td><code style="color: var(--purple-primary);">${l.model}</code></td>
        <td><span class="muted">${l.task_type}</span></td>
        <td>${l.prompt_tokens.toLocaleString()} / ${l.completion_tokens.toLocaleString()}</td>
        <td style="color: var(--red-primary); font-weight: 600;">$${l.cost.toFixed(3)}</td>
        <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ----------------------------------------------------
  // LOG CONSOLE STREAM CONTROLLER
  // ----------------------------------------------------
  function populateLogsConsole(logs) {
    const consoleBox = document.getElementById('logs-console-stream');
    if (!consoleBox) return;
    
    consoleBox.innerHTML = '';
    const last30 = logs.slice(-30);
    
    if (last30.length === 0) {
      consoleBox.innerHTML = `
        <div class="console-placeholder">
          <i class="fa-solid fa-terminal"></i>
          <p>Stream console is listening for requests. Toggle the "Traffic Simulator" above to feed live records.</p>
        </div>
      `;
      return;
    }
    
    last30.forEach(log => {
      appendSingleConsoleLog(log);
    });
  }

  function appendSingleConsoleLog(log) {
    const consoleBox = document.getElementById('logs-console-stream');
    if (!consoleBox) return;
    
    // Remove placeholder if present
    const placeholder = consoleBox.querySelector('.console-placeholder');
    if (placeholder) placeholder.remove();
    
    const logEl = document.createElement('div');
    
    let statusClass = 'normal';
    let statusMarker = '';
    if (log.routing_status.includes('cached')) { statusClass = 'prompt_cached'; statusMarker = '[CACHED 35%]'; }
    else if (log.routing_status.includes('fallback')) { statusClass = 'fallback_routed'; statusMarker = '[FALLBACK ROUTE]'; }
    else if (log.routing_status.includes('optimized')) { statusClass = 'optimized_routing'; statusMarker = '[AI ROUTED]'; }
    
    logEl.className = `log-entry ${statusClass}`;
    
    const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    logEl.innerHTML = `
      <span class="log-time">[${timeStr}]</span> 
      ${statusMarker ? `<span style="font-weight: 600;">${statusMarker}</span>` : ''} 
      <span class="log-dept">${log.department}</span> requested 
      <span class="log-model">${log.model}</span> 
      for <span class="muted">${log.task_type}</span>: 
      <strong>${log.prompt_tokens}</strong> prompt, 
      <strong>${log.completion_tokens}</strong> completion tokens. 
      Charge: <span class="log-cost">$${log.cost.toFixed(4)}</span>
    `;
    
    consoleBox.appendChild(logEl);
    
    // Autoscroll to bottom
    consoleBox.scrollTop = consoleBox.scrollHeight;
    
    // Keep max 100 entries in DOM
    if (consoleBox.children.length > 100) {
      consoleBox.removeChild(consoleBox.firstChild);
    }
  }

  // ----------------------------------------------------
  // DEPARTMENTS MANAGER
  // ----------------------------------------------------
  function populateDepartmentsForm(policies) {
    const form = document.getElementById('departments-form');
    if (!form || !policies) return;
    
    form.innerHTML = '';
    
    Object.entries(policies.departments).forEach(([name, dept]) => {
      const card = document.createElement('div');
      card.className = 'dept-card';
      
      const ratio = (dept.current / dept.budget) * 100;
      let statusClass = 'normal';
      let pillStatus = 'normal';
      if (dept.current >= dept.budget) {
        statusClass = 'danger';
        pillStatus = 'danger';
      } else if (ratio >= dept.alertThreshold) {
        statusClass = 'warning';
        pillStatus = 'warning';
      }
      
      card.innerHTML = `
        <div class="dept-card-header">
          <h3>${name}</h3>
          <span class="dept-spent-pill ${pillStatus}">Spent: $${dept.current.toFixed(2)}</span>
        </div>
        
        <div class="progress-bar-container">
          <div class="progress-bar-labels">
            <span>Utilization</span>
            <span>${Math.round(ratio)}%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill ${statusClass}" style="width: ${Math.min(ratio, 100)}%"></div>
          </div>
        </div>

        <div class="setting-row">
          <label>Monthly Budget Limit ($)</label>
          <div class="range-slider-container">
            <input type="range" class="dept-budget-slider" data-dept="${name}" min="500" max="10000" step="100" value="${dept.budget}">
            <span class="range-value">$${dept.budget}</span>
          </div>
        </div>

        <div class="setting-row">
          <label>Alert Notification Threshold (%)</label>
          <div class="range-slider-container">
            <input type="range" class="dept-alert-slider" data-dept="${name}" min="50" max="95" step="5" value="${dept.alertThreshold}">
            <span class="range-value">${dept.alertThreshold}%</span>
          </div>
        </div>

        <div class="number-input-row">
          <label for="limit-${name}" style="font-size: 0.8rem; font-weight:600; color:var(--text-secondary);">Request Limit (RPM)</label>
          <input type="number" class="dept-rpm-limit" data-dept="${name}" id="limit-${name}" min="5" max="500" value="${dept.rateLimit || 60}">
        </div>

        <label class="checkbox-row">
          <input type="checkbox" class="dept-fallback-cb" data-dept="${name}" ${dept.fallbackEnabled ? 'checked' : ''}>
          <span>Enable model fallback on budget breach</span>
        </label>
      `;
      
      // Wire range slider numbers display
      card.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.addEventListener('input', (e) => {
          const valDisplay = slider.nextElementSibling;
          const prefix = slider.classList.contains('dept-budget-slider') ? '$' : '';
          const suffix = slider.classList.contains('dept-alert-slider') ? '%' : '';
          valDisplay.textContent = `${prefix}${slider.value}${suffix}`;
        });
      });
      
      form.appendChild(card);
    });
  }

  // ----------------------------------------------------
  // FORM & SIMULATION HANDLERS
  // ----------------------------------------------------
  function setupForms() {
    // 1. Save department configs
    const saveBtn = document.getElementById('save-departments-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
        
        const policies = { ...statsData.policies };
        
        // Loop over cards and pull values
        const budgetSliders = document.querySelectorAll('.dept-budget-slider');
        budgetSliders.forEach(slider => {
          const dept = slider.getAttribute('data-dept');
          policies.departments[dept].budget = parseFloat(slider.value);
        });

        const alertSliders = document.querySelectorAll('.dept-alert-slider');
        alertSliders.forEach(slider => {
          const dept = slider.getAttribute('data-dept');
          policies.departments[dept].alertThreshold = parseInt(slider.value);
        });

        const rpmLimits = document.querySelectorAll('.dept-rpm-limit');
        rpmLimits.forEach(input => {
          const dept = input.getAttribute('data-dept');
          policies.departments[dept].rateLimit = parseInt(input.value);
        });

        const fallbacks = document.querySelectorAll('.dept-fallback-cb');
        fallbacks.forEach(cb => {
          const dept = cb.getAttribute('data-dept');
          policies.departments[dept].fallbackEnabled = cb.checked;
        });

        const result = await Api.updatePolicies(policies);
        
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Configurations`;
        
        if (result && result.success) {
          statsData.policies = result.policies;
          alert("Proxy controller configurations saved successfully.");
          refreshDashboard();
        } else {
          alert("Error saving configurations.");
        }
      });
    }

    // 2. Manual Ingest submit
    const manualForm = document.getElementById('manual-ingest-form');
    if (manualForm) {
      manualForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const department = document.getElementById('ingest-dept').value;
        const model = document.getElementById('ingest-model').value;
        const prompt_tokens = parseInt(document.getElementById('ingest-prompt').value);
        const completion_tokens = parseInt(document.getElementById('ingest-completion').value);
        const task_type = document.getElementById('ingest-task').value;
        
        const submitBtn = manualForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Ingesting...`;
        
        const result = await Api.ingestLog({
          department,
          model,
          prompt_tokens,
          completion_tokens,
          task_type,
          service: 'OpenAI' // Will be auto-resolved in proxy Pricing
        });
        
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Log to Proxy`;
        
        if (result && result.success) {
          alert(`Successfully ingested! Cost calculated: $${result.cost.toFixed(4)}. Ingest status: ${result.status}`);
          refreshDashboard();
        } else {
          alert("Log ingestion failed.");
        }
      });
    }

    // 3. Clear logs visual
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => {
        const consoleBox = document.getElementById('logs-console-stream');
        if (consoleBox) {
          consoleBox.innerHTML = `
            <div class="console-placeholder">
              <i class="fa-solid fa-terminal"></i>
              <p>Stream console is listening for requests. Toggle the "Traffic Simulator" above to feed live records.</p>
            </div>
          `;
        }
      });
    }

    // 4. Reset DB
    const resetBtn = document.getElementById('reset-db-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm("Reset tracking DB to default values? Historical logs will be regenerated.")) {
          const res = await Api.resetDatabase();
          if (res && res.success) {
            alert("Database re-initialized.");
            location.reload();
          }
        }
      });
    }
  }

  // ----------------------------------------------------
  // TRAFFIC SIMULATOR (Real-time Generator)
  // ----------------------------------------------------
  function setupSimulator() {
    const toggle = document.getElementById('simulator-toggle');
    const pulse = document.getElementById('stream-pulse');
    const pulseText = document.getElementById('pulse-text');
    
    if (!toggle) return;
    
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        // Activate simulator interval (every 2 seconds post a mock request)
        if (pulse) {
          pulse.classList.add('blink-active');
          pulseText.textContent = "Streaming Live...";
        }
        
        simulatorInterval = setInterval(async () => {
          const depts = ['Engineering', 'Marketing', 'Customer Support', 'Product', 'HR'];
          const models = ['gpt-4', 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'claude-3-haiku', 'gemini-1.5-pro', 'gemini-1.5-flash', 'llama-3-70b'];
          const tasks = ['translation', 'summarization', 'code-generation', 'customer-chat', 'content-generation'];
          
          const dept = depts[Math.floor(Math.random() * depts.length)];
          const model = models[Math.floor(Math.random() * models.length)];
          const task = tasks[Math.floor(Math.random() * tasks.length)];
          
          const prompt = Math.floor(Math.random() * 2500) + 100;
          const completion = Math.floor(Math.random() * 1200) + 50;
          
          await Api.ingestLog({
            department: dept,
            model: model,
            prompt_tokens: prompt,
            completion_tokens: completion,
            task_type: task
          });
        }, 2200);
      } else {
        // Deactivate simulator
        if (simulatorInterval) {
          clearInterval(simulatorInterval);
          simulatorInterval = null;
        }
        if (pulse) {
          pulse.classList.remove('blink-active');
          pulseText.textContent = "Listening...";
        }
      }
    });
  }

  // ----------------------------------------------------
  // BATCH FILE UPLOADER (JSON/CSV PARSER)
  // ----------------------------------------------------
  function setupFileDropper() {
    const dropZone = document.getElementById('log-drop-zone');
    const fileUploader = document.getElementById('file-uploader');
    
    if (!dropZone || !fileUploader) return;
    
    dropZone.addEventListener('click', () => fileUploader.click());
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--purple-primary)';
      dropZone.style.backgroundColor = 'rgba(168, 85, 247, 0.05)';
    });

    ['dragleave', 'drop'].forEach(event => {
      dropZone.addEventListener(event, () => {
        dropZone.style.borderColor = 'var(--border-color)';
        dropZone.style.backgroundColor = 'transparent';
      });
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleLogFile(files[0]);
      }
    });

    fileUploader.addEventListener('change', () => {
      if (fileUploader.files.length > 0) {
        handleLogFile(fileUploader.files[0]);
      }
    });
  }

  async function handleLogFile(file) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const content = e.target.result;
      try {
        let logsArray = [];
        
        if (file.name.endsWith('.json')) {
          logsArray = JSON.parse(content);
        } else if (file.name.endsWith('.csv')) {
          logsArray = parseCsvLogs(content);
        }
        
        if (!Array.isArray(logsArray)) {
          alert("File content must be a JSON array of logs or standard CSV rows.");
          return;
        }
        
        alert(`Parsing and ingesting ${logsArray.length} items from batch report...`);
        
        let ingestedCount = 0;
        for (let item of logsArray) {
          const res = await Api.ingestLog({
            department: item.department || 'Engineering',
            model: item.model || 'gpt-4o-mini',
            prompt_tokens: parseInt(item.prompt_tokens || 1000),
            completion_tokens: parseInt(item.completion_tokens || 300),
            task_type: item.task_type || 'batch-upload',
            service: item.service || 'OpenAI'
          });
          if (res && res.success) ingestedCount++;
        }
        
        alert(`Success! Ingested ${ingestedCount} of ${logsArray.length} logs.`);
        refreshDashboard();
        
      } catch (err) {
        alert("Failed to parse file: " + err.message);
      }
    };
    
    reader.readAsText(file);
  }

  // Simple CSV to JS Object parser
  function parseCsvLogs(csvText) {
    const lines = csvText.split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index];
      });
      results.push(obj);
    }
    return results;
  }
});
