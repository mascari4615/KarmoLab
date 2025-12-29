// System provided key (loaded from localStorage or config.js)
let systemKey = "";
if (typeof CONFIG !== 'undefined' && CONFIG.API_KEY) {
    systemKey = CONFIG.API_KEY;
} else {
    systemKey = localStorage.getItem('geminiApiKey') || "";
} 

let currentModel = 'nano';
let currentTab = 'char';
let imageCounter = 0;

// Error Display System
function showError(title, message, details = null) {
    console.error('❌ ERROR:', { title, message, details });
    
    const container = document.getElementById('errorToastContainer');
    const toast = document.createElement('div');
    toast.className = 'error-toast pointer-events-auto';
    
    let detailsHtml = '';
    if (details) {
        detailsHtml = `
            <details class="mt-2 cursor-pointer">
                <summary class="text-[10px] text-white/70 hover:text-white">🔍 기술 정보 보기</summary>
                <pre class="mt-2 p-2 bg-black/30 rounded text-[9px] text-white/80 overflow-auto max-h-32 select-all">${escapeHtml(details)}</pre>
            </details>
        `;
    }
    
    // Prepare copy text
    const copyText = `[${title}]\n${message}\n${details ? '\n[Details]\n' + details : ''}`;
    // Escape for inline onclick
    const safeCopyText = copyText.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/"/g, '&quot;');

    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <span class="text-2xl">⚠️</span>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-white text-sm mb-1 break-words">${title}</h3>
                <p class="text-xs text-white/90 break-words">${message}</p>
                ${detailsHtml}
            </div>
            <div class="flex flex-col gap-2 shrink-0">
                <button onclick="this.closest('.error-toast').remove()" class="text-white/70 hover:text-white text-lg leading-none p-1" title="닫기">&times;</button>
                <button onclick="copyErrorLog(this)" data-log="${escapeHtml(copyText)}" class="text-white/70 hover:text-white p-1" title="로그 복사">
                    <span class="text-xs">📋</span>
                </button>
            </div>
        </div>
    `;
    
    container.appendChild(toast);
}

function copyErrorLog(btn) {
    const text = btn.getAttribute('data-log');
    navigator.clipboard.writeText(text).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '<span class="text-xs text-green-400 font-bold">✔</span>';
        setTimeout(() => btn.innerHTML = original, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            const original = btn.innerHTML;
            btn.innerHTML = '<span class="text-xs text-green-400 font-bold">✔</span>';
            setTimeout(() => btn.innerHTML = original, 2000);
        } catch (e) {
            alert('로그 복사 실패');
        }
        document.body.removeChild(textarea);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Functions
function updateModelSettings() {
    const select = document.getElementById('modelSelect');
    const model = select.value;
    
    // Toggle Settings UI
    const nanoSettings = document.getElementById('nanoSettings');
    const imagenSettings = document.getElementById('imagenSettings');
    
    if (model.startsWith('gemini')) {
        nanoSettings.classList.remove('hidden');
        imagenSettings.classList.add('hidden');
        nanoSettings.innerHTML = `<span class="text-brand-500 font-bold">Gemini</span> (${model})`;
    } else {
        nanoSettings.classList.add('hidden');
        imagenSettings.classList.remove('hidden');
        imagenSettings.innerHTML = `<span class="text-blue-400 font-bold">Imagen</span> (${model})`;
    }
}

function setTab(tab) {
    currentTab = tab;
    ['char', 'bg', 'story', 'lab'].forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
            btn.className = t === tab ? 'tab-btn active' : 'tab-btn inactive';
        }
    });
    renderGrid();
}

function renderGrid() {
    const grid = document.getElementById('selectionGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    presetsData[currentTab].forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'card-btn';
        btn.innerHTML = `<span class="card-icon">${item.icon}</span><span class="card-label">${item.label}</span>`;
        btn.onclick = () => selectPreset(item.id, item.prompt, btn);
        grid.appendChild(btn);
    });
}

function selectPreset(id, prompt, btnElement) {
    document.querySelectorAll('.card-btn').forEach(b => b.classList.remove('selected'));
    if(btnElement) btnElement.classList.add('selected');
    const input = document.getElementById('promptInput');
    if(input) {
        input.value = prompt;
        input.classList.add('ring-2', 'ring-brand-500');
        setTimeout(() => input.classList.remove('ring-2', 'ring-brand-500'), 200);
    }
    const descBox = document.getElementById('descBox');
    if(descBox) descBox.classList.add('hidden');
}

function togglePrompt() {
    const area = document.getElementById('promptInput');
    const icon = document.getElementById('promptToggleIcon');
    if (area.classList.contains('hidden')) {
        area.classList.remove('hidden');
        icon.innerText = '▲';
    } else {
        area.classList.add('hidden');
        icon.innerText = '▼';
    }
}

function clearPrompt() {
    const input = document.getElementById('promptInput');
    if(input) input.value = "";
    const descBox = document.getElementById('descBox');
    if(descBox) descBox.classList.add('hidden');
    document.querySelectorAll('.card-btn').forEach(b => b.classList.remove('selected'));
}

// API Key Management
function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    const key = input.value.trim();
    
    if (!key) {
        status.innerText = '❌ API 키를 입력해주세요';
        status.className = 'text-[9px] text-red-400 mt-1.5';
        return;
    }
    
    if (!key.startsWith('AIza')) {
        status.innerText = '⚠️ 유효하지 않은 API 키 형식입니다';
        status.className = 'text-[9px] text-yellow-400 mt-1.5';
        return;
    }
    
    systemKey = key;
    localStorage.setItem('geminiApiKey', key);
    status.innerText = '✅ API 키가 저장되었습니다!';
    status.className = 'text-[9px] text-green-400 mt-1.5';
}

function getApiKey() {
    if (!systemKey) {
        alert('🔑 먼저 API 키를 입력해주세요!\n\n상단의 "Get Key" 링크를 클릭하여 Google AI Studio에서 API 키를 발급받으세요.');
        return null;
    }
    return systemKey;
}

// AI Functions
async function enhancePrompt() {
    const input = document.getElementById('promptInput');
    if (!input || !input.value.trim()) return alert("프롬프트를 입력해주세요!");
    
    const btn = document.getElementById('enhanceBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="loader w-4 h-4 mr-2 border-2"></div> ...`;

    try {
        const systemPrompt = `Refine for high-quality anime art. Add lighting, HD-2D, 16:9 ratio. Maintain: ${charContext}`;
        const enhanced = await callGeminiText(input.value, systemPrompt);
        if (enhanced) input.value = enhanced;
    } catch (e) { 
        console.error('Enhance Prompt Error:', e);
        showError(
            '프롬프트 다듬기 실패',
            'AI가 프롬프트를 개선하는데 실패했습니다.',
            `Error: ${e.message}\nStack: ${e.stack || 'N/A'}`
        );
    } finally { btn.disabled = false; btn.innerHTML = originalText; }
}

async function generateRandomEpisode() {
    const btn = document.getElementById('randomEpBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="loader w-4 h-4 mr-2 border-2"></div> ...`;

    try {
        const systemPrompt = `Creative Director for "Witch: Mendokusai~". Generate random scenario.
        [Characters] ${charContext}
        Output JSON: { "description": "Korean desc", "prompt": "English prompt with visuals. End with 'HD-2D, 16:9, high quality'" }`;
        
        const res = await callGeminiText("Generate random episode", systemPrompt);
        const json = JSON.parse(res.replace(/```json|```/g, '').trim());
        
        const input = document.getElementById('promptInput');
        input.value = json.prompt;
        input.classList.remove('hidden');
        
        const descBox = document.getElementById('descBox');
        document.getElementById('descText').innerText = json.description;
        descBox.classList.remove('hidden');

    } catch (e) { 
        console.error('Random Episode Error:', e);
        showError(
            '랜덤 에피소드 생성 실패',
            'AI가 에피소드를 생성하는데 실패했습니다.',
            `Error: ${e.message}\nStack: ${e.stack || 'N/A'}`
        );
    } finally { btn.disabled = false; btn.innerHTML = originalText; }
}

async function callGeminiText(user, sys) {
    const key = getApiKey();
    if (!key) return null;
    
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`;
        const body = {
            contents: [{ parts: [{ text: user }] }],
            systemInstruction: { parts: [{ text: sys }] },
            generationConfig: { 
                responseMimeType: "application/json",
                maxOutputTokens: 8192
            }
        };
        
        console.log('📤 Gemini Text API Request:', { url: url.replace(key, 'HIDDEN'), body });
        const res = await fetchWithRetry(url, body);
        const data = await res.json();
        console.log('📥 Gemini Text API Response:', data);
        
        if (!data.candidates || !data.candidates[0]) {
            throw new Error('No candidates in response: ' + JSON.stringify(data));
        }
        
        return data.candidates[0].content.parts[0].text;
    } catch (e) {
        console.error('❌ callGeminiText Error:', e);
        throw e;
    }
}

async function generateImage() {
    const input = document.getElementById('promptInput');
    if (!input || !input.value) return alert("프롬프트를 입력하세요!");

    const btn = document.getElementById('generateBtn');
    const loading = document.getElementById('loadingSpinner');
    const img = document.getElementById('generatedImage');
    const placeholder = document.getElementById('imagePlaceholder');
    const downloadBtn = document.getElementById('downloadBtn');
    
    const modelSelect = document.getElementById('modelSelect');
    const selectedModel = modelSelect ? modelSelect.value : 'gemini-2.0-flash';

    btn.disabled = true;
    btn.style.opacity = "0.7";
    loading.classList.remove('hidden');
    if(placeholder) placeholder.classList.add('hidden');
    if(img) img.classList.add('hidden');
    if(downloadBtn) downloadBtn.classList.add('hidden');

    try {
        let imageUrl = '';

        if (selectedModel.startsWith('gemini')) {
            imageUrl = await callNanoBanana(input.value, selectedModel);
        } else {
            // Imagen: Single request
            const images = await callImagen3(input.value, 1, selectedModel);
            if (images && images.length > 0) imageUrl = images[0];
        }

        if (!imageUrl) {
             throw new Error(`이미지 생성 실패`);
        }

        // Success
        img.src = imageUrl;
        img.classList.remove('hidden');
        
        // Setup download button
        if(downloadBtn) {
            downloadBtn.classList.remove('hidden');
            downloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = imageUrl;
                a.download = `art-studio-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };
        }

    } catch (e) {
        console.error('❌ Image Generation Error:', e);
        showError(
            '이미지 생성 실패',
            e.message || '이미지를 생성하는데 문제가 발생했습니다.',
            `Error: ${e.message}\nModel: ${selectedModel}\nStack: ${e.stack || 'N/A'}`
        );
        if (placeholder) placeholder.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.style.opacity = "1";
        loading.classList.add('hidden');
    }
}

async function callNanoBanana(prompt, modelVersion = 'gemini-2.0-flash') {
    try {
        const key = getApiKey();
        if (!key) throw new Error('API 키가 설정되지 않았습니다');
        
        // Defaults for simplified UI
        const aspectRatio = "16:9"; 
        const safetyThreshold = "BLOCK_ONLY_HIGH";
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${key}`;
        
        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: safetyThreshold },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: safetyThreshold },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: safetyThreshold },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: safetyThreshold }
        ];

        const generationConfig = {
            maxOutputTokens: 8192
        };

        // Gemini 3 계열 등 일부 모델은 imageConfig(aspectRatio)를 지원하지 않음
        if (!modelVersion.includes('gemini-3')) {
            generationConfig.imageConfig = { aspectRatio: aspectRatio };
        }

        const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: generationConfig,
            safetySettings: safetySettings
        };
        
        console.log('📤 Nano API Request:', { url: url.replace(key, 'HIDDEN'), prompt, aspectRatio, safetyThreshold });
        const res = await fetchWithRetry(url, body);
        const data = await res.json();
        console.log('📥 Nano API Response:', data);

        if (data.usageMetadata) {
            const { promptTokenCount, candidatesTokenCount, totalTokenCount } = data.usageMetadata;
            console.log(`📊 Token Usage: Input ${promptTokenCount}, Output ${candidatesTokenCount}, Total ${totalTokenCount}`);
        }
        
        if (data.candidates && data.candidates[0].finishReason === 'SAFETY') {
            throw new Error(`안전 필터 차단: ${data.candidates[0].safetyRatings?.map(r => `${r.category}:${r.probability}`).join(', ') || '상세 정보 없음'}`);
        }
        if (!data.candidates || !data.candidates[0]?.content) {
            throw new Error(`이미지 데이터 없음: ${JSON.stringify(data)}`);
        }
        
        const imageData = data.candidates[0].content.parts.find(p => p.inlineData);
        if (!imageData) {
            throw new Error('inlineData를 찾을 수 없습니다: ' + JSON.stringify(data.candidates[0].content));
        }
        
        return `data:image/png;base64,${imageData.inlineData.data}`;
    } catch (e) {
        console.error('❌ Nano API Error:', e);
        throw e;
    }
}

async function callImagen3(prompt, count, modelVersion = 'imagen-3.0-generate-002') {
    try {
        const key = getApiKey();
        if (!key) throw new Error('API 키가 설정되지 않았습니다');
        
        // Defaults for simplified UI
        const aspectRatio = "16:9";
        const personGeneration = "allow_adult";
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:predict?key=${key}`;
        
        const parameters = { 
            sampleCount: count, 
            aspectRatio: aspectRatio,
            personGeneration: personGeneration
        };

        const body = {
            instances: [{ prompt: prompt }],
            parameters: parameters
        };
        
        console.log('📤 Imagen API Request:', { url: url.replace(key, 'HIDDEN'), prompt, parameters });
        const res = await fetchWithRetry(url, body);
        const data = await res.json();
        console.log('📥 Imagen API Response:', data);
        
        if (!data.predictions || data.predictions.length === 0) {
            throw new Error(`예측 결과 없음 (안전 필터?): ${JSON.stringify(data)}`);
        }
        
        // Return array of base64 strings
        return data.predictions.map(p => {
            if (!p.bytesBase64Encoded) throw new Error('base64 이미지 데이터 없음');
            return `data:image/png;base64,${p.bytesBase64Encoded}`;
        });

    } catch (e) {
        console.error('❌ Imagen API Error:', e);
        throw e;
    }
}

async function fetchWithRetry(url, body) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            let errorDetails = "상세 정보 없음";
            let fullError = null;
            try {
                fullError = await response.json();
                errorDetails = fullError.error?.message || JSON.stringify(fullError);
            } catch(e) {
                errorDetails = await response.text();
            }
            
            console.error('❌ API Error Response:', { status: response.status, fullError });
            
            // 상태 코드별 사용자 친화적 메시지
            let userMessage = errorDetails;
            if (response.status === 401) {
                userMessage = 'API 키 인증 실패. 올바른 API 키를 입력했는지 확인해주세요.';
            } else if (response.status === 403) {
                userMessage = 'API 접근이 거부되었습니다. API 키 권한을 확인해주세요.';
            } else if (response.status === 429) {
                userMessage = 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
            } else if (response.status === 500) {
                userMessage = 'Google API 서버 오류입니다. 잠시 후 다시 시도해주세요.';
            }
            
            throw new Error(`[HTTP ${response.status}] ${userMessage}`);
        }
        
        return response;
    } catch (e) {
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            throw new Error('네트워크 연결 오류. 인터넷 연결을 확인해주세요.');
        }
        throw e;
    }
}

function openLightbox(url) {
    document.getElementById('lightboxImage').src = url;
    document.getElementById('lightboxDownload').href = url;
    document.getElementById('lightboxModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('lightboxModal').classList.remove('opacity-0'), 10);
}

function closeLightbox(e) {
    if (e.target.id === 'lightboxModal' || e.target.tagName === 'BUTTON') {
        const modal = document.getElementById('lightboxModal');
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    setTab('char');
    
    // Load saved API key
    const input = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    if (systemKey) {
        input.value = systemKey;
        status.innerText = '✅ 저장된 API 키가 로드되었습니다';
        status.className = 'text-[9px] text-green-400 mt-1.5';
    } else {
        status.innerText = 'API 키를 입력하고 저장 버튼을 눌러주세요';
        status.className = 'text-[9px] text-gray-500 mt-1.5';
    }
});
