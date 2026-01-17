// Character Data (Loaded from prompts.js)
// characterProfiles is defined in prompts.js

let currentChar = 'witch';
let chatHistory = []; // Stores { role: 'user'|'model', parts: [{ text: ... }] }
let conversationSummary = ""; // Stores the running summary
let systemKey = "";

if (typeof CONFIG !== 'undefined' && CONFIG.API_KEY) {
    systemKey = CONFIG.API_KEY;
} else {
    systemKey = localStorage.getItem('geminiApiKey') || "";
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    
    if (systemKey) {
        input.value = systemKey;
        // If loaded from config, disable input or show different status
        if (typeof CONFIG !== 'undefined' && CONFIG.API_KEY) {
            status.innerText = '✅ Key Loaded from Config';
            input.disabled = true;
            input.title = "Loaded from js/config.js";
        } else {
            status.innerText = '✅ Key Loaded';
        }
        status.className = 'text-[9px] text-green-400 mt-1.5';
    }
});

function selectChar(id) {
    if (currentChar === id) return;
    
    // UI Update
    document.querySelectorAll('.char-card').forEach(el => el.classList.remove('active'));
    document.getElementById(`char-${id}`).classList.add('active');
    
    currentChar = id;
    const char = characterProfiles[id];
    
    // Header Update
    document.getElementById('chatHeaderName').innerText = char.name;
    document.getElementById('chatHeaderIcon').innerText = char.icon;
    
    // Reset Chat
    clearChat(false); // Don't clear UI yet, just reset history
    
    // Add Welcome Message
    const historyDiv = document.getElementById('chatHistory');
    historyDiv.innerHTML = '';
    appendMessage('bot', char.firstMessage);
    
    chatHistory = []; // Reset API history
}

function handleEnter(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    const key = getApiKey();
    if (!key) return;

    // User Message UI
    appendMessage('user', text);
    input.value = '';
    
    // Add to history
    chatHistory.push({ role: "user", parts: [{ text: text }] });

    // Loading Indicator
    const loadingId = showLoading();

    try {
        let systemPrompt = getChatSystemPrompt(currentChar);
        
        // --- MEMORY PROTOCOL ---
        systemPrompt += `\n\n[SYSTEM: MEMORY PROTOCOL]
To maintain conversation continuity, you must update the conversation summary with every response.

Current Summary:
${conversationSummary || "No summary yet."}

Output Format:
You must start your response with a summary block wrapped in {{{ ... }}} braces, followed by your character response.
The summary should be concise but capture key information about the user and the conversation flow.

Example:
{{{User asked about my cat. I said I don't have one.}}}
I don't have a cat... but I want one.`;
        // -----------------------

        const { text: rawResponse, usage } = await callGeminiChat(chatHistory, systemPrompt);
        
        // Parse Protocol
        let responseText = rawResponse;
        const summaryMatch = rawResponse.match(/\{\{\{(.*?)\}\}\}/s);
        
        if (summaryMatch) {
            conversationSummary = summaryMatch[1].trim();
            responseText = rawResponse.replace(/\{\{\{.*?\}\}\}/s, '').trim();
            console.log("📝 Updated Summary:", conversationSummary);
        } else {
            console.warn("⚠️ No summary block found in response.");
        }

        removeLoading(loadingId);
        appendMessage('bot', responseText);
        
        if (usage) updateTokenDisplay(usage);

        // Add to history (Clean text only)
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });

    } catch (e) {
        removeLoading(loadingId);
        appendMessage('bot', `Error: ${e.message}`, true);
        console.error(e);
    }
}

function appendMessage(role, text, isError = false) {
    const div = document.getElementById('chatHistory');
    const bubble = document.createElement('div');
    bubble.className = `flex justify-${role === 'user' ? 'end' : 'start'}`;
    
    const content = document.createElement('div');
    content.className = `chat-bubble ${role} ${isError ? 'bg-red-500/50 border-red-500' : ''}`;
    content.innerText = text;
    
    bubble.appendChild(content);
    div.appendChild(bubble);
    div.scrollTop = div.scrollHeight;
}

function showLoading() {
    const div = document.getElementById('chatHistory');
    const id = 'loading-' + Date.now();
    
    const bubble = document.createElement('div');
    bubble.id = id;
    bubble.className = `flex justify-start`;
    bubble.innerHTML = `
        <div class="chat-bubble bot typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    
    div.appendChild(bubble);
    div.scrollTop = div.scrollHeight;
    return id;
}

function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function clearChat(resetUI = true) {
    chatHistory = [];
    conversationSummary = "";
    if (resetUI) {
        const historyDiv = document.getElementById('chatHistory');
        historyDiv.innerHTML = '';
        appendMessage('bot', characterProfiles[currentChar].firstMessage);
    }
}

// API Functions
function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    const key = input.value.trim();
    
    if (!key.startsWith('AIza')) {
        status.innerText = '⚠️ Invalid Key';
        status.className = 'text-[9px] text-yellow-400 mt-1.5';
        return;
    }
    
    systemKey = key;
    localStorage.setItem('geminiApiKey', key);
    status.innerText = '✅ Saved!';
    status.className = 'text-[9px] text-green-400 mt-1.5';
}

function getApiKey() {
    if (!systemKey) {
        alert('Please enter your Gemini API Key first.');
        return null;
    }
    return systemKey;
}

async function callGeminiChat(history, systemPrompt) {
    const key = getApiKey();
    const model = document.getElementById('modelSelect').value;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    
    const body = {
        contents: history,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { 
            temperature: 1.0,
            maxOutputTokens: 8192
        }
    };

    console.log("Gemini Request:", body);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.json();
        console.error("Gemini API Error:", err);
        throw new Error(err.error?.message || 'API Error');
    }

    const data = await response.json();
    console.log("Gemini Response:", data);
    return {
        text: data.candidates[0].content.parts[0].text,
        usage: data.usageMetadata
    };
}

function updateTokenDisplay(usage) {
    const total = usage.totalTokenCount;
    const limit = 1000000; // Default limit for Flash models
    const percent = Math.round((total / limit) * 100);
    
    const display = document.getElementById('tokenUsageDisplay');
    if(display) {
        display.innerText = `Tokens: ${total.toLocaleString()} / ${limit.toLocaleString()} (${percent}%)`;
        
        // Color coding
        if (percent > 90) display.className = "text-[10px] text-red-400 font-mono font-bold";
        else if (percent > 70) display.className = "text-[10px] text-yellow-400 font-mono";
        else display.className = "text-[10px] text-gray-500 font-mono";
    }
}
