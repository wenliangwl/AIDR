/**
 * AIDR Chatbot — Frontend Chat Logic
 * Handles messaging, settings, provider switching, AIDR config, and persona theming.
 */

// ============================================================
// DOM Elements
// ============================================================
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const welcomeScreen = document.getElementById('welcomeScreen');
const providerIndicator = document.getElementById('providerIndicator');
const personaBadge = document.getElementById('personaBadge');
const aidrBadge = document.getElementById('aidrBadge');
const aidrText = document.getElementById('aidrText');

// Sidebar
const chatSidebar = document.getElementById('chatSidebar');
const sidebarContent = document.getElementById('sidebarContent');
const newChatBtn = document.getElementById('newChatBtn');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const mobileSidebarClose = document.getElementById('mobileSidebarClose');
const appWrapper = document.querySelector('.app-wrapper');

// File Upload
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const attachmentPreview = document.getElementById('attachmentPreview');
const attachmentName = document.getElementById('attachmentName');
const removeAttachmentBtn = document.getElementById('removeAttachmentBtn');

// Settings
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyGroup = document.getElementById('apiKeyGroup');
const ollamaUrlGroup = document.getElementById('ollamaUrlGroup');
const ollamaUrlInput = document.getElementById('ollamaUrlInput');
const modelSelect = document.getElementById('modelSelect');
const personaSelect = document.getElementById('personaSelect');
const personaHint = document.getElementById('personaHint');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const toggleKeyBtn = document.getElementById('toggleKeyBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const setupHint = document.getElementById('setupHint');

// AIDR Config
const aidrTokenInput = document.getElementById('aidrTokenInput');
const aidrBaseUrlInput = document.getElementById('aidrBaseUrlInput');
const aidrConnectBtn = document.getElementById('aidrConnectBtn');
const aidrConnectText = document.getElementById('aidrConnectText');
const aidrConnectStatus = document.getElementById('aidrConnectStatus');
const toggleAidrKeyBtn = document.getElementById('toggleAidrKeyBtn');

// Setup Banner
const setupBanner = document.getElementById('setupBanner');
const setupBannerTitle = document.getElementById('setupBannerTitle');
const setupBannerDesc = document.getElementById('setupBannerDesc');
const setupBannerBtn = document.getElementById('setupBannerBtn');

// ============================================================
// State
// ============================================================
let isWaiting = false;
let selectedFile = null; // Store raw File object
let isAidrEnabled = true;
let isAidrConfigured = false;
let hasApiKey = false;
let activeChatId = null;
let chats = [];

const PERSONA_HINTS = {
    customer_support: 'Friendly and professional support agent.',
    security_qa: 'Cybersecurity expert for threat and compliance Q&A.',
};

const PERSONA_BADGES = {
    customer_support: '🎧 Customer Support',
    security_qa: '🛡️ Security Q&A',
};

const PROVIDER_NAMES = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
    ollama: 'Ollama',
};

const WELCOME_CARDS = {
    customer_support: [
        { icon: '💬', text: 'Help me with my order', prompt: 'I need help tracking my recent order. Can you assist me?' },
        { icon: '🔄', text: 'Return or exchange', prompt: 'How do I initiate a return or exchange for a product?' },
        { icon: '💳', text: 'Billing questions', prompt: 'I have a question about a charge on my account. Can you help?' },
        { icon: '📦', text: 'Product information', prompt: 'Can you tell me more about the features and specifications of your products?' },
    ],
    security_qa: [
        { icon: '🔒', text: 'Latest security threats', prompt: 'What are the latest cybersecurity threats I should be aware of?' },
        { icon: '🛡️', text: 'Improve security posture', prompt: 'How can I improve my organization\'s security posture?' },
        { icon: '🚨', text: 'Incident response', prompt: 'Can you help me understand incident response procedures?' },
        { icon: '📋', text: 'Compliance frameworks', prompt: 'What compliance frameworks should my business follow?' },
    ],
};

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    checkAidrStatus();
    loadChatList();
    setupEventListeners();
    autoResizeTextarea();
});

function setupEventListeners() {
    // Send message
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Enable/disable send button based on input
    chatInput.addEventListener('input', () => {
        sendBtn.disabled = (!chatInput.value.trim() && !selectedFile) || isWaiting;
        autoResizeTextarea();
    });

    // File Upload
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileSelect);
    
    removeAttachmentBtn.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        attachmentPreview.classList.add('hidden');
        sendBtn.disabled = !chatInput.value.trim() || isWaiting;
    });

    // Settings panel
    settingsBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', closeSettings);
    settingsSaveBtn.addEventListener('click', saveSettings);

    // Provider change
    providerSelect.addEventListener('change', onProviderChange);

    // Persona change (in settings)
    personaSelect.addEventListener('change', () => {
        const key = personaSelect.value;
        personaHint.textContent = PERSONA_HINTS[key] || '';
    });

    // Toggle API key visibility
    toggleKeyBtn.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
    });

    // Toggle AIDR token visibility
    if (toggleAidrKeyBtn) {
        toggleAidrKeyBtn.addEventListener('click', () => {
            const isPassword = aidrTokenInput.type === 'password';
            aidrTokenInput.type = isPassword ? 'text' : 'password';
        });
    }

    // AIDR Connect
    if (aidrConnectBtn) {
        aidrConnectBtn.addEventListener('click', connectAidr);
    }

    // Refresh models
    refreshModelsBtn.addEventListener('click', fetchModels);

    // Clear chat
    clearChatBtn.addEventListener('click', clearChat);

    // Welcome card clicks
    document.querySelectorAll('.welcome-card').forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.dataset.prompt;
            if (prompt) {
                chatInput.value = prompt;
                sendBtn.disabled = false;
                chatInput.focus();
            }
        });
    });

    // Setup hint click
    if (setupHint) {
        setupHint.addEventListener('click', openSettings);
    }

    // Setup banner button
    if (setupBannerBtn) {
        setupBannerBtn.addEventListener('click', openSettings);
    }

    // Toggle AIDR
    if (aidrBadge) {
        aidrBadge.addEventListener('click', () => {
            isAidrEnabled = !isAidrEnabled;
            if (isAidrEnabled) {
                aidrBadge.classList.remove('aidr-disabled');
                aidrBadge.setAttribute('aria-pressed', 'true');
                if (aidrText) aidrText.textContent = 'AIDR Protected';
            } else {
                aidrBadge.classList.add('aidr-disabled');
                aidrBadge.setAttribute('aria-pressed', 'false');
                if (aidrText) aidrText.textContent = 'AIDR Disabled';
            }
        });
    }

    // Sidebar Toggles
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            appWrapper.classList.toggle('sidebar-collapsed');
            appWrapper.classList.toggle('mobile-sidebar-open');
        });
    }
    
    if (mobileSidebarClose) {
        mobileSidebarClose.addEventListener('click', () => {
            appWrapper.classList.remove('mobile-sidebar-open');
        });
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', createNewChat);
    }
}

// ============================================================
// AIDR Status & Configuration
// ============================================================
async function checkAidrStatus() {
    try {
        const resp = await fetch('/api/aidr-status');
        const data = await resp.json();
        isAidrConfigured = data.configured;
        updateSetupBanner();
    } catch (e) {
        console.warn('Could not check AIDR status:', e);
    }
}

async function connectAidr() {
    const token = aidrTokenInput.value.trim();
    const baseUrl = aidrBaseUrlInput.value.trim();

    if (!token) {
        aidrConnectStatus.textContent = 'Please enter your AIDR token.';
        aidrConnectStatus.className = 'aidr-connect-status error';
        return;
    }

    // Show connecting state
    aidrConnectBtn.classList.add('connecting');
    aidrConnectText.textContent = 'Connecting...';
    aidrConnectStatus.textContent = '';
    aidrConnectStatus.className = 'aidr-connect-status';

    try {
        const resp = await fetch('/api/aidr-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, base_url: baseUrl }),
        });
        const data = await resp.json();

        if (resp.ok && data.configured) {
            isAidrConfigured = true;
            aidrConnectBtn.classList.remove('connecting');
            aidrConnectBtn.classList.add('connected');
            aidrConnectText.textContent = '✓ Connected';
            aidrConnectStatus.textContent = 'AIDR is active and protecting your conversations.';
            aidrConnectStatus.className = 'aidr-connect-status success';

            // Update header badge
            aidrBadge.classList.remove('aidr-disabled');
            aidrBadge.setAttribute('aria-pressed', 'true');
            if (aidrText) aidrText.textContent = 'AIDR Protected';
            isAidrEnabled = true;

            updateSetupBanner();
        } else {
            aidrConnectBtn.classList.remove('connecting');
            aidrConnectText.textContent = 'Connect AIDR';
            aidrConnectStatus.textContent = data.error || 'Failed to connect.';
            aidrConnectStatus.className = 'aidr-connect-status error';
        }
    } catch (e) {
        aidrConnectBtn.classList.remove('connecting');
        aidrConnectText.textContent = 'Connect AIDR';
        aidrConnectStatus.textContent = 'Network error. Please check the server.';
        aidrConnectStatus.className = 'aidr-connect-status error';
    }
}

function updateSetupBanner() {
    if (!setupBanner) return;

    const provider = providerSelect ? providerSelect.value : 'openai';
    const needsApiKey = provider !== 'ollama' && !hasApiKey;
    const needsAidr = !isAidrConfigured;

    if (!needsApiKey && !needsAidr) {
        // Everything is configured — hide the banner
        setupBanner.classList.add('hidden');
        return;
    }

    // Build the description based on what's missing
    const missing = [];
    if (needsAidr) missing.push('AIDR token');
    if (needsApiKey) missing.push('AI provider API key');

    setupBanner.classList.remove('hidden');
    setupBannerTitle.textContent = 'Setup Required';
    setupBannerDesc.textContent = `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not configured.`;
}

// ============================================================
// Settings
// ============================================================
function openSettings() {
    settingsPanel.classList.add('active');
    settingsOverlay.classList.add('active');
}

function closeSettings() {
    settingsPanel.classList.remove('active');
    settingsOverlay.classList.remove('active');
}

async function loadSettings() {
    try {
        const resp = await fetch('/api/settings');
        const data = await resp.json();

        providerSelect.value = data.provider || 'openai';
        personaSelect.value = data.persona || 'customer_support';
        ollamaUrlInput.value = data.ollama_url || 'http://localhost:11434';
        hasApiKey = data.has_api_key || false;

        // Update UI based on provider
        onProviderChange();
        updateFooterIndicator(data.provider, data.model);
        updatePersonaBadge(data.persona);
        applyPersonaTheme(data.persona || 'customer_support');

        // Set model after fetching model list
        await fetchModels();
        if (data.model) {
            modelSelect.value = data.model;
        }

        // Persona hint
        personaHint.textContent = PERSONA_HINTS[data.persona] || '';

        // Update banner
        updateSetupBanner();
    } catch (e) {
        console.warn('Could not load settings:', e);
    }
}

async function saveSettings() {
    const settings = {
        provider: providerSelect.value,
        model: modelSelect.value,
        persona: personaSelect.value,
        api_key: apiKeyInput.value,
        ollama_url: ollamaUrlInput.value,
    };

    try {
        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        });

        if (resp.ok) {
            // Track API key state
            if (apiKeyInput.value.trim()) {
                hasApiKey = true;
            }

            // Visual feedback
            settingsSaveBtn.classList.add('saved');
            settingsSaveBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Saved!
            `;

            setTimeout(() => {
                settingsSaveBtn.classList.remove('saved');
                settingsSaveBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Save Settings
                `;
                closeSettings();
            }, 1200);

            // Update footer and badge
            updateFooterIndicator(settings.provider, settings.model);
            updatePersonaBadge(settings.persona);
            applyPersonaTheme(settings.persona);

            // Update setup banner
            updateSetupBanner();

            // Reset welcome screen if visible
            if (welcomeScreen && welcomeScreen.parentNode) {
                // Chat was cleared — keep welcome screen
            }
        }
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

function onProviderChange() {
    const provider = providerSelect.value;

    // Show/hide API key group (not needed for Ollama)
    if (provider === 'ollama') {
        apiKeyGroup.classList.add('hidden');
        ollamaUrlGroup.classList.remove('hidden');
    } else {
        apiKeyGroup.classList.remove('hidden');
        ollamaUrlGroup.classList.add('hidden');
    }

    // Fetch models for the selected provider
    fetchModels();
}

async function fetchModels() {
    const provider = providerSelect.value;
    refreshModelsBtn.classList.add('spinning');

    try {
        const resp = await fetch(`/api/models?provider=${provider}`);
        const data = await resp.json();

        modelSelect.innerHTML = '';
        const models = data.models || [];

        if (models.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No models available';
            modelSelect.appendChild(opt);
        } else {
            models.forEach(model => {
                const opt = document.createElement('option');
                opt.value = model;
                opt.textContent = model;
                modelSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn('Could not fetch models:', e);
    } finally {
        refreshModelsBtn.classList.remove('spinning');
    }
}

function updateFooterIndicator(provider, model) {
    const providerName = PROVIDER_NAMES[provider] || provider;
    providerIndicator.textContent = `${providerName} · ${model || 'not set'}`;
}

function updatePersonaBadge(persona) {
    personaBadge.textContent = PERSONA_BADGES[persona] || persona;
}

// ============================================================
// Persona Theming
// ============================================================
function applyPersonaTheme(persona) {
    document.body.dataset.persona = persona;
    updateWelcomeCards(persona);
}

function updateWelcomeCards(persona) {
    const cardsContainer = document.getElementById('welcomeCards');
    if (!cardsContainer) return;

    const cards = WELCOME_CARDS[persona] || WELCOME_CARDS['security_qa'];

    cardsContainer.innerHTML = '';
    cards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'welcome-card';
        cardEl.dataset.prompt = card.prompt;
        cardEl.innerHTML = `
            <span class="card-icon">${card.icon}</span>
            <span>${card.text}</span>
        `;
        cardEl.addEventListener('click', () => {
            chatInput.value = card.prompt;
            sendBtn.disabled = false;
            chatInput.focus();
        });
        cardsContainer.appendChild(cardEl);
    });
}

// ============================================================
// Chat Messages
// ============================================================
function sendMessage() {
    const message = chatInput.value.trim();
    if ((!message && !selectedFile) || isWaiting) return;

    // Hide welcome screen dynamically
    const currentWelcomeScreen = document.getElementById('welcomeScreen');
    if (currentWelcomeScreen && currentWelcomeScreen.parentNode) {
        currentWelcomeScreen.remove();
    }

    // Add user message to UI
    appendMessage('user', message, selectedFile);
    
    // Capture file before clearing input
    const fileDataToSend = selectedFile;
    
    // Disable inputs
    isWaiting = true;
    showTyping();

    // If no file is attached, clear the input UI immediately
    if (!fileDataToSend) {
        chatInput.value = '';
        sendBtn.disabled = true;
        autoResizeTextarea();
    } else {
        // If file is attached, hide remove button but KEEP preview visible for progress
        removeAttachmentBtn.classList.add('hidden');
        const progressFill = document.getElementById('uploadProgressFill');
        const progressText = document.getElementById('uploadProgressText');
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/chat', true);
    // Let the browser set Content-Type to multipart/form-data with boundary automatically

    // Track upload progress
    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && fileDataToSend) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            
            const progressContainer = document.getElementById('uploadProgressContainer');
            const progressFill = document.getElementById('uploadProgressFill');
            const progressText = document.getElementById('uploadProgressText');
            
            if (progressContainer) progressContainer.classList.remove('hidden');
            if (progressFill) progressFill.style.width = percentComplete + '%';
            if (progressText) progressText.textContent = percentComplete + '%';
            
            if (percentComplete >= 100 && progressText) {
                progressText.textContent = 'Processing...';
            }
        }
    };

    xhr.onload = () => {
        hideTyping();
        
        // Clear UI now that request is done
        chatInput.value = '';
        selectedFile = null;
        fileInput.value = '';
        attachmentPreview.classList.add('hidden');
        removeAttachmentBtn.classList.remove('hidden');
        
        const progressContainer = document.getElementById('uploadProgressContainer');
        if (progressContainer) progressContainer.classList.add('hidden');
        
        sendBtn.disabled = true;
        autoResizeTextarea();
        isWaiting = false;
        chatInput.focus();

        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                const data = JSON.parse(xhr.responseText);
                
                // Update active chat ID if server created one
                if (data.chat_id && !activeChatId) {
                    activeChatId = data.chat_id;
                    // Refresh list to show new chat
                    loadChatList();
                } else if (data.chat_title || data.aidr_triggered) {
                    // Refresh list if title was auto-generated or AIDR triggered
                    loadChatList();
                }

                if (data.blocked) {
                    appendBlockedMessage(data.message, data.block_type);
                } else {
                    appendMessage('assistant', data.response);
                }
            } catch(e) {
                appendError('Error parsing server response.');
            }
        } else {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.needs_setup) {
                    appendError(data.error);
                    setTimeout(openSettings, 800);
                } else {
                    appendError(data.error || 'Something went wrong.');
                }
            } catch (e) {
                appendError('Error ' + xhr.status + ': Failed to process response.');
            }
        }
    };

    xhr.onerror = () => {
        hideTyping();
        appendError('Network error. Please check the server is running.');
        console.error('Chat error: Network request failed');
        
        isWaiting = false;
        sendBtn.disabled = (!chatInput.value.trim() && !selectedFile);
        removeAttachmentBtn.classList.remove('hidden');
        
        const progressContainer = document.getElementById('uploadProgressContainer');
        if (progressContainer) progressContainer.classList.add('hidden');
    };

    const formData = new FormData();
    formData.append('message', message);
    formData.append('aidr_enabled', isAidrEnabled);
    if (activeChatId) {
        formData.append('chat_id', activeChatId);
    }
    if (fileDataToSend) {
        formData.append('file', fileDataToSend);
    }
    xhr.send(formData);
}

// ============================================================
// File Handling
// ============================================================
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Check size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
        appendError("Upload Failed: File must be under 5MB.");
        fileInput.value = '';
        return;
    }

    // Check if text-based file
    const validExtensions = ['.txt', '.csv', '.json', '.md', '.log', '.xml', '.py', '.js', '.html', '.css'];
    const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext)) || file.type.startsWith('text/');
    if (!isValid) {
        appendError("Upload Failed: Only text-based files (txt, csv, json, md, etc.) are supported right now.");
        fileInput.value = '';
        return;
    }

    selectedFile = file; // Store raw File object
    attachmentName.textContent = file.name;
    attachmentPreview.classList.remove('hidden');
    sendBtn.disabled = false;
    chatInput.focus();
}

function getFallbackMimeType(filename) {
    const format = filename.split('.').pop().toLowerCase();
    switch (format) {
        case 'png': return 'image/png';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'pdf': return 'application/pdf';
        case 'txt': return 'text/plain';
        case 'csv': return 'text/csv';
        case 'json': return 'application/json';
        default: return 'application/octet-stream';
    }
}

function appendMessage(role, content, attachment = null) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';

    if (role === 'user') {
        avatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    } else {
        avatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    }

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    
    if (attachment) {
        const attachHtml = `
            <div class="chat-attachment-card">
                <div class="chat-attachment-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                </div>
                <div class="chat-attachment-details">
                    <span class="chat-attachment-name">${escapeHtml(attachment.name)}</span>
                    <span class="chat-attachment-type">Document Upload</span>
                </div>
            </div>
        `;
        contentEl.innerHTML += attachHtml;
    }
    
    if (content) {
        const textWrapper = document.createElement('div');
        textWrapper.innerHTML = formatMessage(content);
        contentEl.appendChild(textWrapper);
    }

    messageEl.appendChild(avatar);
    messageEl.appendChild(contentEl);
    chatMessages.appendChild(messageEl);
    scrollToBottom();
}

function appendBlockedMessage(message, blockType) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant blocked';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    const headerHTML = `
        <div class="blocked-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            AIDR Security — ${blockType === 'input' ? 'Input Blocked' : 'Output Blocked'}
        </div>
    `;

    contentEl.innerHTML = headerHTML + `<p>${escapeHtml(message)}</p>`;

    messageEl.appendChild(avatar);
    messageEl.appendChild(contentEl);
    chatMessages.appendChild(messageEl);
    scrollToBottom();
}

function appendError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    chatMessages.appendChild(errorEl);
    scrollToBottom();
}

// ============================================================
// Message Formatting (basic markdown)
// ============================================================
function formatMessage(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code (`...`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold (**...**)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic (*...*)
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Unordered lists
    html = html.replace(/^[-•]\s+(.+)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)/gm, '<li>$1</li>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up
    html = html.replace(/<br><\/ul>/g, '</ul>');
    html = html.replace(/<ul><br>/g, '<ul>');

    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// ============================================================
// Typing Indicator
// ============================================================
function showTyping() {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
}

function hideTyping() {
    typingIndicator.classList.add('hidden');
}

// ============================================================
// Clear Chat
// ============================================================
async function clearChat() {
    createNewChat();
}

// ============================================================
// Helpers
// ============================================================
function scrollToBottom() {
    requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function autoResizeTextarea() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

// ============================================================
// Sidebar & Chat History
// ============================================================
async function loadChatList() {
    try {
        const resp = await fetch('/api/chats');
        const data = await resp.json();
        chats = data.chats || [];
        renderChatList();
        
        // If we just loaded and have no active chat, select the first one or create new
        if (!activeChatId) {
            if (chats.length > 0) {
                switchChat(chats[0].id);
            } else {
                createNewChat();
            }
        }
    } catch (e) {
        console.error('Failed to load chat list:', e);
    }
}

function renderChatList() {
    if (!sidebarContent) return;
    
    sidebarContent.innerHTML = '';
    
    if (chats.length === 0) {
        sidebarContent.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; margin-top: 20px;">No previous chats.</div>';
        return;
    }

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const groups = {
        'Today': [],
        'Yesterday': [],
        'Previous 7 Days': [],
        'Older': []
    };

    chats.forEach(chat => {
        const chatDate = new Date(chat.updated_at);
        const dateString = chatDate.toDateString();
        const diffDays = Math.floor((new Date() - chatDate) / (1000 * 60 * 60 * 24));

        if (dateString === today) {
            groups['Today'].push(chat);
        } else if (dateString === yesterday) {
            groups['Yesterday'].push(chat);
        } else if (diffDays <= 7) {
            groups['Previous 7 Days'].push(chat);
        } else {
            groups['Older'].push(chat);
        }
    });

    for (const [groupName, groupChats] of Object.entries(groups)) {
        if (groupChats.length > 0) {
            const label = document.createElement('div');
            label.className = 'sidebar-group-label';
            label.textContent = groupName;
            sidebarContent.appendChild(label);

            groupChats.forEach(chat => {
                const item = document.createElement('div');
                item.className = 'chat-list-item' + (chat.id === activeChatId ? ' active' : '') + (chat.aidr_triggered ? ' aidr-flagged' : '');
                item.dataset.id = chat.id;
                
                const icon = chat.aidr_triggered 
                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>'
                    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

                item.innerHTML = `
                    <div class="chat-list-item-icon" title="${chat.aidr_triggered ? 'AIDR Block Triggered' : 'Chat'}">${icon}</div>
                    <div class="chat-list-item-title">${escapeHtml(chat.title)}</div>
                    <div class="chat-list-item-actions">
                        <button class="chat-list-action-btn edit-btn" title="Rename" data-action="rename">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="chat-list-action-btn delete-btn" title="Delete" data-action="delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                `;

                // Handle clicks
                item.addEventListener('click', (e) => {
                    const btn = e.target.closest('.chat-list-action-btn');
                    if (btn) {
                        e.stopPropagation();
                        if (btn.dataset.action === 'delete') {
                            deleteChat(chat.id);
                        } else if (btn.dataset.action === 'rename') {
                            startRenaming(item, chat.id);
                        }
                    } else {
                        switchChat(chat.id);
                    }
                });

                sidebarContent.appendChild(item);
            });
        }
    }
}

async function createNewChat() {
    try {
        const resp = await fetch('/api/chats', { method: 'POST' });
        const data = await resp.json();
        
        activeChatId = data.id;
        chatMessages.innerHTML = '';
        
        // Show welcome screen
        const currentPersona = document.body.dataset.persona || 'customer_support';
        const welcome = document.createElement('div');
        welcome.className = 'welcome-screen';
        welcome.id = 'welcomeScreen';
        welcome.innerHTML = `
            <div class="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <h2>Welcome to AI Chat</h2>
            <p>Your conversations are protected by CrowdStrike AIDR security guardrails.</p>
            <div class="welcome-cards" id="welcomeCards"></div>
        `;
        chatMessages.appendChild(welcome);
        updateWelcomeCards(currentPersona);
        
        loadChatList();
        
        if (window.innerWidth <= 640) {
            appWrapper.classList.remove('mobile-sidebar-open');
        }
    } catch (e) {
        console.error('Failed to create chat:', e);
    }
}

async function switchChat(id) {
    if (activeChatId === id && document.querySelectorAll('.message').length > 0) {
        if (window.innerWidth <= 640) appWrapper.classList.remove('mobile-sidebar-open');
        return;
    }
    
    activeChatId = id;
    renderChatList(); // Update active class
    
    try {
        const resp = await fetch(`/api/chats/${id}`);
        const data = await resp.json();
        
        chatMessages.innerHTML = '';
        
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                if (msg.role !== 'system') {
                    appendMessage(msg.role, msg.content);
                }
            });
        } else {
            // Empty chat, show welcome
            const currentPersona = data.persona || document.body.dataset.persona || 'customer_support';
            const welcome = document.createElement('div');
            welcome.className = 'welcome-screen';
            welcome.id = 'welcomeScreen';
            welcome.innerHTML = `
                <div class="welcome-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <h2>Welcome to AI Chat</h2>
                <p>Your conversations are protected by CrowdStrike AIDR security guardrails.</p>
                <div class="welcome-cards" id="welcomeCards"></div>
            `;
            chatMessages.appendChild(welcome);
            updateWelcomeCards(currentPersona);
        }
        
        // Apply persona from this chat
        if (data.persona && personaSelect) {
            personaSelect.value = data.persona;
            updatePersonaBadge(data.persona);
            applyPersonaTheme(data.persona);
        }
        
        scrollToBottom();
        
        if (window.innerWidth <= 640) {
            appWrapper.classList.remove('mobile-sidebar-open');
        }
    } catch (e) {
        console.error('Failed to switch chat:', e);
    }
}

async function deleteChat(id) {
    if (!confirm('Are you sure you want to delete this chat?')) return;
    
    try {
        await fetch(`/api/chats/${id}`, { method: 'DELETE' });
        
        if (activeChatId === id) {
            activeChatId = null;
        }
        
        loadChatList();
    } catch (e) {
        console.error('Failed to delete chat:', e);
    }
}

function startRenaming(itemEl, id) {
    const titleEl = itemEl.querySelector('.chat-list-item-title');
    const oldTitle = titleEl.textContent;
    
    titleEl.contentEditable = true;
    titleEl.focus();
    
    // Select all text
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    
    const saveRename = async () => {
        titleEl.contentEditable = false;
        const newTitle = titleEl.textContent.trim();
        
        if (newTitle && newTitle !== oldTitle) {
            try {
                await fetch(`/api/chats/${id}/rename`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle })
                });
                loadChatList();
            } catch (e) {
                console.error('Failed to rename chat:', e);
                titleEl.textContent = oldTitle;
            }
        } else {
            titleEl.textContent = oldTitle;
        }
    };
    
    titleEl.addEventListener('blur', saveRename, { once: true });
    titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            titleEl.blur(); // Triggers save
        } else if (e.key === 'Escape') {
            titleEl.textContent = oldTitle;
            titleEl.blur(); // Cancels rename implicitly because content matches oldTitle
        }
    });
}
