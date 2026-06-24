// CESTO AI Cost Optimization Agent Logic
const Agent = {
  // Render recommendations in the Optimization Tab
  renderRecommendations(recs, onAppliedCallback) {
    const container = document.getElementById('recommendations-container');
    const badgeCount = document.getElementById('rec-badge-count');
    
    if (!container) return;
    
    // Update badge count in sidebar for unapplied recs
    const unappliedCount = recs.filter(r => !r.applied).length;
    if (badgeCount) {
      badgeCount.textContent = unappliedCount;
      badgeCount.style.display = unappliedCount > 0 ? 'inline-block' : 'none';
    }
    
    if (recs.length === 0) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 40px; color: var(--text-secondary);">
          <i class="fa-solid fa-square-check" style="font-size: 2.5rem; color: var(--emerald-primary); margin-bottom: 12px;"></i>
          <h3>No Recommendations Pending</h3>
          <p class="muted" style="margin-top: 4px;">Your AI usage and routing parameters are already in optimal configurations.</p>
        </div>
      `;
      return;
    }
    
    // Clear and build list
    container.innerHTML = '';
    
    // Sort so unapplied comes first, then by savings desc
    const sortedRecs = [...recs].sort((a, b) => {
      if (a.applied && !b.applied) return 1;
      if (!a.applied && b.applied) return -1;
      return b.potentialSavings - a.potentialSavings;
    });

    sortedRecs.forEach(rec => {
      const card = document.createElement('div');
      card.className = `audit-card ${rec.applied ? 'applied' : ''}`;
      
      const timeStr = new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let impactClass = 'impact-low';
      if (rec.impact === 'High') impactClass = 'impact-high';
      else if (rec.impact === 'Medium') impactClass = 'impact-medium';
      
      card.innerHTML = `
        <div class="audit-header">
          <div>
            <h3 style="color: ${rec.applied ? 'var(--text-secondary)' : 'var(--text-main)'}">${rec.title}</h3>
            <span class="trend neutral" style="font-size: 0.7rem; margin-top: 2px;">Generated today, ${timeStr}</span>
          </div>
          <span class="audit-savings">$${rec.potentialSavings.toFixed(2)}/mo savings</span>
        </div>
        <p class="audit-desc">${rec.description}</p>
        <div class="audit-meta">
          <span class="meta-tag">${rec.department}</span>
          <span class="meta-tag ${impactClass}">Impact: ${rec.impact}</span>
        </div>
        <div class="audit-actions">
          ${rec.applied 
            ? `<div class="audit-applied-status"><i class="fa-solid fa-circle-check"></i> Optimization Applied</div>`
            : `<button class="btn btn-xs btn-primary apply-rec-btn" data-id="${rec.id}">
                 <i class="fa-solid fa-bolt"></i> Apply Optimization
               </button>`
          }
        </div>
      `;
      
      // Wire up Apply Button
      const applyBtn = card.querySelector('.apply-rec-btn');
      if (applyBtn) {
        applyBtn.addEventListener('click', async (e) => {
          applyBtn.disabled = true;
          applyBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Applying...`;
          
          const result = await Api.applyRecommendation(rec.id);
          if (result && result.success) {
            // Trigger UI reload via app.js callback
            if (onAppliedCallback) {
              onAppliedCallback(result);
            }
            
            // Log message in chat to notify user
            Agent.appendAgentMessage(`I have successfully applied the optimization rule: **"${rec.title}"**. Cost reduction systems have updated routing limits.`);
          } else {
            applyBtn.disabled = false;
            applyBtn.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Failed`;
          }
        });
      }
      
      container.appendChild(card);
    });
  },

  // Append a message to the chat interface
  appendMessage(text, sender) {
    const chatBox = document.getElementById('chat-messages-box');
    if (!chatBox) return;
    
    const msgElement = document.createElement('div');
    msgElement.className = `message ${sender}`;
    
    const formattedText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/-(.*?)\n/g, '<li>$1</li>')
      .replace(/\n/g, '<br>');
      
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    msgElement.innerHTML = `
      <div class="msg-bubble">
        <p>${formattedText}</p>
      </div>
      <span class="msg-time">${sender === 'agent' ? 'CESTO' : 'You'} • ${now}</span>
    `;
    
    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight;
  },

  // Helper to specifically append agent responses
  appendAgentMessage(text) {
    Agent.appendMessage(text, 'agent');
  },

  // Helper to append user query
  appendUserMessage(text) {
    Agent.appendMessage(text, 'user');
  },

  // Initialize Chatbox Listeners
  initChat() {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    
    if (!chatForm || !chatInput) return;
    
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = chatInput.value.trim();
      if (!message) return;
      
      chatInput.value = '';
      Agent.appendUserMessage(message);
      
      // Show loading typing indicator
      const chatBox = document.getElementById('chat-messages-box');
      const typingEl = document.createElement('div');
      typingEl.className = 'message agent typing-indicator-msg';
      typingEl.innerHTML = `
        <div class="msg-bubble" style="opacity: 0.6;">
          <p><i class="fa-solid fa-ellipsis fa-bounce"></i> CESTO is auditing logs...</p>
        </div>
      `;
      chatBox.appendChild(typingEl);
      chatBox.scrollTop = chatBox.scrollHeight;
      
      const response = await Api.sendChatMessage(message);
      
      // Remove typing indicator
      const activeTyping = chatBox.querySelector('.typing-indicator-msg');
      if (activeTyping) activeTyping.remove();
      
      if (response && response.reply) {
        Agent.appendAgentMessage(response.reply);
      }
    });

    // Handle suggestion chips
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('chip-query')) {
        chatInput.value = e.target.textContent;
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
  }
};
