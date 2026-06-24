// CESTO AI Client API Helper
const API_BASE = window.location.origin;

const Api = {
  // Fetch logs, stats, policies and recommendations
  async getUsageData() {
    try {
      const response = await fetch(`${API_BASE}/api/usage`);
      if (!response.ok) throw new Error('Failed to fetch usage stats');
      return await response.json();
    } catch (error) {
      console.error('API Error (getUsageData):', error);
      return null;
    }
  },

  // Post a new usage log event to the proxy
  async ingestLog(logData) {
    try {
      const response = await fetch(`${API_BASE}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData)
      });
      if (!response.ok) throw new Error('Log ingestion failed');
      return await response.json();
    } catch (error) {
      console.error('API Error (ingestLog):', error);
      return null;
    }
  },

  // Save budget and routing policies
  async updatePolicies(policies) {
    try {
      const response = await fetch(`${API_BASE}/api/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policies)
      });
      if (!response.ok) throw new Error('Updating policies failed');
      return await response.json();
    } catch (error) {
      console.error('API Error (updatePolicies):', error);
      return null;
    }
  },

  // Apply cost controller recommendation action
  async applyRecommendation(id) {
    try {
      const response = await fetch(`${API_BASE}/api/recommendations/${id}/apply`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to apply recommendation');
      return await response.json();
    } catch (error) {
      console.error('API Error (applyRecommendation):', error);
      return null;
    }
  },

  // Send message to the CESTO Agent chat interface
  async sendChatMessage(message) {
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (!response.ok) throw new Error('Chat communication failed');
      return await response.json();
    } catch (error) {
      console.error('API Error (sendChatMessage):', error);
      return { reply: "I'm having trouble connecting to the costing brain. Please check if the Node.js server is online." };
    }
  },

  // Reset DB mock data
  async resetDatabase() {
    try {
      const response = await fetch(`${API_BASE}/api/reset`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Resetting database failed');
      return await response.json();
    } catch (error) {
      console.error('API Error (resetDatabase):', error);
      return null;
    }
  }
};
