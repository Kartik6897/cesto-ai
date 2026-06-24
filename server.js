const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

// Initialize DB folder
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Pricing per 1,000,000 tokens in USD
const PRICING = {
  'gpt-4o': { input: 5.00, output: 15.00, service: 'OpenAI' },
  'gpt-4o-mini': { input: 0.150, output: 0.600, service: 'OpenAI' },
  'gpt-4': { input: 30.00, output: 60.00, service: 'OpenAI' },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00, service: 'Anthropic' },
  'claude-3-haiku': { input: 0.25, output: 1.25, service: 'Anthropic' },
  'gemini-1.5-pro': { input: 1.25, output: 5.00, service: 'Gemini' },
  'gemini-1.5-flash': { input: 0.075, output: 0.30, service: 'Gemini' },
  'llama-3-70b': { input: 0.59, output: 0.79, service: 'Groq/Llama' }
};

// Standard fallback suggestions for models
const MODEL_FALLBACKS = {
  'gpt-4': 'gpt-4o-mini',
  'gpt-4o': 'gpt-4o-mini',
  'claude-3-5-sonnet': 'claude-3-haiku',
  'gemini-1.5-pro': 'gemini-1.5-flash'
};

// Default initial state
const defaultDb = {
  savings: 1420.50, // accumulated savings in USD
  policies: {
    departments: {
      Engineering: { budget: 3000, current: 0, alertThreshold: 80, fallbackEnabled: true, rateLimit: 60 },
      Marketing: { budget: 1500, current: 0, alertThreshold: 85, fallbackEnabled: false, rateLimit: 30 },
      'Customer Support': { budget: 1000, current: 0, alertThreshold: 90, fallbackEnabled: true, rateLimit: 100 },
      Product: { budget: 1200, current: 0, alertThreshold: 80, fallbackEnabled: false, rateLimit: 40 },
      HR: { budget: 400, current: 0, alertThreshold: 75, fallbackEnabled: false, rateLimit: 15 }
    },
    promptCaching: true,
    autoRouteCheaper: false
  },
  recommendations: [
    {
      id: 'rec_1',
      title: 'Downgrade Code Parsing Model',
      description: 'Engineering department is running high-volume regex/string-parsing queries on gpt-4. Downgrading to gpt-4o-mini will decrease costs by 98% with equivalent quality.',
      department: 'Engineering',
      potentialSavings: 840.00,
      impact: 'Medium',
      actionType: 'model_downgrade',
      targetModel: 'gpt-4',
      replacementModel: 'gpt-4o-mini',
      applied: false,
      timestamp: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
      id: 'rec_2',
      title: 'Enable Prompt Caching for Marketing Translations',
      description: 'Marketing translations show a 42% repetition rate in system context prompts. Enabling prompt caching will save input token costs.',
      department: 'Marketing',
      potentialSavings: 320.00,
      impact: 'High',
      actionType: 'enable_prompt_caching',
      applied: false,
      timestamp: new Date(Date.now() - 3600000 * 12).toISOString()
    },
    {
      id: 'rec_3',
      title: 'Apply Customer Support Rate Limiting',
      description: 'Customer Support daily consumption is spiking due to redundant loops in automated email ticket responder. Apply limit of 30 RPM to prevent further budget drainage.',
      department: 'Customer Support',
      potentialSavings: 260.00,
      impact: 'Low',
      actionType: 'apply_rate_limit',
      targetLimit: 30,
      applied: false,
      timestamp: new Date(Date.now() - 3600000 * 20).toISOString()
    }
  ],
  logs: []
};

// Generate historical usage logs
function generateMockLogs() {
  const logs = [];
  const depts = Object.keys(defaultDb.policies.departments);
  const models = Object.keys(PRICING);
  const tasks = ['code-generation', 'translation', 'summarization', 'customer-chat', 'data-analysis', 'content-generation'];
  const now = Date.now();
  
  // Create ~150 logs spreading over last 7 days
  for (let i = 150; i >= 0; i--) {
    const timeOffset = i * (45 * 60 * 1000); // every ~45 mins
    const timestamp = new Date(now - timeOffset).toISOString();
    
    // Choose department based on realistic weights
    const randDept = Math.random();
    let department = 'Engineering';
    if (randDept > 0.4 && randDept <= 0.7) department = 'Marketing';
    else if (randDept > 0.7 && randDept <= 0.88) department = 'Customer Support';
    else if (randDept > 0.88 && randDept <= 0.96) department = 'Product';
    else if (randDept > 0.96) department = 'HR';
    
    // Model selection based on department preferences
    let model = 'gpt-4o';
    if (department === 'Engineering') {
      model = Math.random() > 0.4 ? 'gpt-4' : 'claude-3-5-sonnet';
    } else if (department === 'Customer Support') {
      model = Math.random() > 0.3 ? 'gpt-4o-mini' : 'gemini-1.5-flash';
    } else if (department === 'Marketing') {
      model = Math.random() > 0.5 ? 'claude-3-5-sonnet' : 'gpt-4o';
    } else {
      model = models[Math.floor(Math.random() * models.length)];
    }
    
    const task_type = tasks[Math.floor(Math.random() * tasks.length)];
    const service = PRICING[model].service;
    
    // Generate prompt & completion token quantities
    let prompt_tokens = Math.floor(Math.random() * 4000) + 500;
    let completion_tokens = Math.floor(Math.random() * 2000) + 100;
    
    // Adjust tokens depending on task type
    if (task_type === 'summarization') {
      prompt_tokens += 3000;
    } else if (task_type === 'code-generation') {
      prompt_tokens += 1000;
      completion_tokens += 1000;
    }
    
    // Calculate cost
    const rates = PRICING[model];
    let cost = ((prompt_tokens * rates.input) + (completion_tokens * rates.output)) / 1000000;
    cost = parseFloat(cost.toFixed(4));
    
    logs.push({
      id: `log_${10000 - i}`,
      timestamp,
      department,
      service,
      model,
      prompt_tokens,
      completion_tokens,
      cost,
      task_type,
      routing_status: 'normal'
    });
  }
  return logs;
}

// Read database from file or initialize
function getDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading database file:', err);
  }
  
  // Setup database with mock logs
  const db = { ...defaultDb };
  db.logs = generateMockLogs();
  
  // Calculate historical department spent based on logs
  db.logs.forEach(log => {
    if (db.policies.departments[log.department]) {
      db.policies.departments[log.department].current += log.cost;
    }
  });
  
  // Format current spent values
  for (let dept in db.policies.departments) {
    db.policies.departments[dept].current = parseFloat(db.policies.departments[dept].current.toFixed(2));
  }
  
  saveDb(db);
  return db;
}

// Save database to file
function saveDb(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to database file:', err);
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Get overall stats and logs
app.get('/api/usage', (req, res) => {
  const db = getDb();
  res.json({
    savings: db.savings,
    policies: db.policies,
    recommendations: db.recommendations,
    logs: db.logs.slice(-200) // return last 200 logs
  });
});

// Ingest active usage logs
app.post('/api/ingest', (req, res) => {
  const { department, service, model, prompt_tokens, completion_tokens, task_type } = req.body;
  
  if (!department || !model || prompt_tokens === undefined || completion_tokens === undefined) {
    return res.status(400).json({ error: 'Missing required parameters (department, model, prompt_tokens, completion_tokens)' });
  }
  
  const db = getDb();
  
  // Ensure department is configured
  if (!db.policies.departments[department]) {
    db.policies.departments[department] = { budget: 1000, current: 0, alertThreshold: 80, fallbackEnabled: false, rateLimit: 50 };
  }
  
  let targetModel = model;
  let status = 'normal';
  let costAdjustment = 0;
  
  const deptPolicy = db.policies.departments[department];
  
  // 1. Check Rate Limit / Throttling
  // (In a real proxy this checks request rate; we simulate based on budget settings)
  
  // 2. Apply Fallback Routing if Budget exceeded
  if (deptPolicy.fallbackEnabled && deptPolicy.current >= deptPolicy.budget) {
    if (MODEL_FALLBACKS[model]) {
      targetModel = MODEL_FALLBACKS[model];
      status = 'fallback_routed';
    }
  }
  
  // 3. Apply active optimization rules (e.g. Model replacement from applied recommendations)
  db.recommendations.forEach(rec => {
    if (rec.applied && rec.department === department && rec.actionType === 'model_downgrade' && rec.targetModel === model) {
      targetModel = rec.replacementModel;
      status = 'optimized_routing';
    }
  });
  
  // Resolve service name and pricing based on targeted model
  const rates = PRICING[targetModel] || { input: 0.15, output: 0.60, service: 'Custom' };
  const targetService = PRICING[targetModel] ? PRICING[targetModel].service : service;
  
  // 4. Prompt Caching check
  let finalPromptTokens = prompt_tokens;
  if (db.policies.promptCaching && (task_type === 'translation' || task_type === 'summarization' || Math.random() < 0.2)) {
    // Simulate 35% cache hit on prompt tokens
    const cacheReduction = Math.floor(prompt_tokens * 0.35);
    finalPromptTokens = prompt_tokens - cacheReduction;
    status = status === 'normal' ? 'prompt_cached' : status + '_cached';
    
    // Calculate cost saved via caching
    const savedAmount = (cacheReduction * rates.input) / 1000000;
    db.savings += savedAmount;
  }
  
  // Calculate cost
  let cost = ((finalPromptTokens * rates.input) + (completion_tokens * rates.output)) / 1000000;
  cost = parseFloat(cost.toFixed(5));
  
  // If fallback routed or optimized routing, calculate difference saved
  if (targetModel !== model) {
    const originalRates = PRICING[model] || rates;
    const originalCost = ((prompt_tokens * originalRates.input) + (completion_tokens * originalRates.output)) / 1000000;
    const savedAmount = originalCost - cost;
    if (savedAmount > 0) {
      db.savings += savedAmount;
    }
  }
  
  // Add to department spent
  deptPolicy.current += cost;
  deptPolicy.current = parseFloat(deptPolicy.current.toFixed(3));
  db.savings = parseFloat(db.savings.toFixed(3));
  
  // Log the event
  const newLog = {
    id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    department,
    service: targetService,
    model: targetModel,
    prompt_tokens,
    completion_tokens,
    cost,
    task_type: task_type || 'general',
    routing_status: status
  };
  
  db.logs.push(newLog);
  
  // Keep logs at a reasonable limit
  if (db.logs.length > 500) {
    db.logs.shift();
  }
  
  saveDb(db);
  
  res.json({
    success: true,
    originalModel: model,
    routedModel: targetModel,
    status,
    cost,
    currentDepartmentSpent: deptPolicy.current,
    totalSavings: db.savings
  });
});

// Get policy configuration
app.get('/api/policies', (req, res) => {
  const db = getDb();
  res.json(db.policies);
});

// Update policy configuration
app.post('/api/policies', (req, res) => {
  const db = getDb();
  db.policies = { ...db.policies, ...req.body };
  saveDb(db);
  res.json({ success: true, policies: db.policies });
});

// Get recommendations
app.get('/api/recommendations', (req, res) => {
  const db = getDb();
  res.json(db.recommendations);
});

// Apply a recommendation
app.post('/api/recommendations/:id/apply', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const index = db.recommendations.findIndex(r => r.id === id);
  
  if (index !== -1) {
    db.recommendations[index].applied = true;
    
    // Apply changes instantly to configurations
    const rec = db.recommendations[index];
    if (rec.actionType === 'apply_rate_limit') {
      const dept = rec.department;
      if (db.policies.departments[dept]) {
        db.policies.departments[dept].rateLimit = rec.targetLimit;
      }
    } else if (rec.actionType === 'enable_prompt_caching') {
      db.policies.promptCaching = true;
    }
    
    // Add nominal immediate savings metric
    db.savings += rec.potentialSavings * 0.1; // 10% instant bootstrap savings
    db.savings = parseFloat(db.savings.toFixed(2));
    
    saveDb(db);
    res.json({ success: true, recommendation: db.recommendations[index], savings: db.savings });
  } else {
    res.status(404).json({ error: 'Recommendation not found' });
  }
});

// Reset simulation metrics (for testing)
app.post('/api/reset', (req, res) => {
  const db = { ...defaultDb };
  db.logs = generateMockLogs();
  
  db.logs.forEach(log => {
    if (db.policies.departments[log.department]) {
      db.policies.departments[log.department].current += log.cost;
    }
  });
  
  for (let dept in db.policies.departments) {
    db.policies.departments[dept].current = parseFloat(db.policies.departments[dept].current.toFixed(2));
  }
  
  saveDb(db);
  res.json({ success: true, message: 'Database reset successfully' });
});

// Conversational AI agent endpoint
app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  const db = getDb();
  const query = message.toLowerCase();
  let reply = "";
  let actionData = null;
  
  // Logic for simple agent replies
  if (query.includes('hello') || query.includes('hi') || query.includes('hey')) {
    reply = "Hello! I am CESTO, your AI Cost Optimization Agent. I can help audit your AI model usages, adjust department budgets, list active suggestions, or enable cost-saving proxy policies. What would you like to check today?";
  } 
  else if (query.includes('status') || query.includes('how are we doing') || query.includes('report')) {
    const totalCost = db.logs.reduce((acc, log) => acc + log.cost, 0).toFixed(2);
    const activeBreaches = Object.entries(db.policies.departments)
      .filter(([name, dept]) => dept.current >= dept.budget)
      .map(([name]) => name);
      
    reply = `Here is our current AI expense report:
- **Total Tracked Costs**: $${totalCost}
- **Accumulated Savings**: $${db.savings.toFixed(2)}
- **Pending Recommendations**: ${db.recommendations.filter(r => !r.applied).length} active recommendations.
${activeBreaches.length > 0 ? `⚠️ **Alert**: The following departments have breached their budgets: **${activeBreaches.join(', ')}**.` : '✅ All departments are currently within their monthly budgets.'}`;
  } 
  else if (query.includes('recommend') || query.includes('optimization') || query.includes('save')) {
    const unapplied = db.recommendations.filter(r => !r.applied);
    if (unapplied.length === 0) {
      reply = "Awesome! We have currently applied all optimization recommendations. The systems are running in cost-efficient configurations.";
    } else {
      reply = `I have detected **${unapplied.length} pending optimizations** to minimize costs:
` + unapplied.map((r, i) => `${i+1}. **${r.title}** (${r.department}): Potential monthly savings of **$${r.potentialSavings}**. Impact: *${r.impact}*.`).join('\n') + `\n\nYou can click 'Apply' on these recommendation cards in the optimization panel to implement them instantly!`;
    }
  } 
  else if (query.includes('budget') || query.includes('departments')) {
    reply = "Here are the monthly budgets and current spends for each department:\n" +
      Object.entries(db.policies.departments)
        .map(([name, dept]) => `- **${name}**: $${dept.current.toFixed(2)} spent / $${dept.budget.toFixed(2)} budget (${Math.round((dept.current/dept.budget)*100)}% utilized)`).join('\n') +
      "\n\nYou can change these limits or toggle routing fallbacks directly in the *Department Manager* tab.";
  } 
  else if (query.includes('cache') || query.includes('prompt caching')) {
    const statusStr = db.policies.promptCaching ? 'enabled' : 'disabled';
    reply = `Prompt Caching is currently **${statusStr}**. Prompt caching reduces cost by returning discounted rates for repetitive inputs, saving about 35% on prompt tokens.
${!db.policies.promptCaching ? "Would you like me to enable prompt caching? (Reply with 'enable prompt caching')" : "It is actively shaving costs off repetitive translation and chat tasks."}`;
  } 
  else if (query.includes('enable prompt caching') || query.includes('turn on caching')) {
    db.policies.promptCaching = true;
    saveDb(db);
    reply = "Done! I have enabled prompt caching. All subsequent duplicate or static system prompt queries will receive a 35% discount.";
  }
  else if (query.includes('disable prompt caching') || query.includes('turn off caching')) {
    db.policies.promptCaching = false;
    saveDb(db);
    reply = "Prompt caching has been disabled. Costs may rise for repetitive workloads.";
  }
  else {
    reply = "I'm not sure how to resolve that specific inquiry, but I can assist with auditing budgets, reporting on AI costs, applying rate limits, or toggling model fallbacks. Try asking 'How are we doing?' or 'Show recommendations'.";
  }
  
  res.json({ reply, actionData });
});

// Start the server
app.listen(PORT, () => {
  console.log(`CESTO AI Server running at http://localhost:${PORT}`);
});
