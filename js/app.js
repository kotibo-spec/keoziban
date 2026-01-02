import { fetchAiResponses, fetchAiThreads } from './gemini.js';

// --- データ管理 ---
let threads = JSON.parse(localStorage.getItem('ai_threads')) || [];
let currentThreadId = null;
let isAutoMode = false; // オートモード中か
let autoTimer = null;   // オートモードのタイマー

// --- 雰囲気（トーン）の定義 ---
const TONE_PRESETS = {
    "mix": "なんJ、VIP、ニュース、専門板の住人がごちゃ混ぜ。丁寧語禁止。煽り、ネタ、真面目なレスが混在するカオスな状態。",
    "nanj": "全員「なんJ」民。猛虎弁（〜やで、〜ンゴ、ワイ）を使用。実況風の勢い重視。プロ野球ネタや煽りが多い。",
    "vip": "全員「VIP」民。うはｗｗｗおｋｗｗｗなどの古いネットスラングや短文を使用。クオリティの低い煽り合い。",
    "news": "全員「ニュース速報」民。〜だろ常識的に考えて、ソースは？など、理屈っぽく批判的で斜に構えた態度。",
    "gal": "女性向け掲示板風。〜だよね、〜しなよ。表向きは共感しているが裏でマウントを取り合うようなピリピリした雰囲気。"
};

// --- DOM要素 ---
const viewList = document.getElementById('view-thread-list');
const viewDetail = document.getElementById('view-thread-detail');
const threadListEl = document.getElementById('thread-list');
const resContainerEl = document.getElementById('res-container');
const headerTitle = document.getElementById('header-title');
const backBtn = document.getElementById('back-btn');
const refreshThreadsBtn = document.getElementById('refresh-threads-btn');
const autoIndicator = document.getElementById('auto-indicator');
const updateBtn = document.getElementById('update-btn');

// --- 初期化 ---
function init() {
    renderThreadList();
    loadSettings();
    
    // イベント
    document.getElementById('settings-btn').onclick = () => showModal('modal-settings');
    document.getElementById('save-settings-btn').onclick = saveSettings;
    
    document.getElementById('create-thread-btn').onclick = () => showModal('modal-create');
    document.getElementById('do-create-thread-btn').onclick = createThread;
    document.getElementById('cancel-create-btn').onclick = () => closeModal('modal-create');
    
    updateBtn.onclick = () => manualUpdate(); // 手動更新
    document.getElementById('back-btn').onclick = () => {
        stopAutoMode(); // 戻るときはオート停止
        showThreadList();
    };
    document.getElementById('clear-data-btn').onclick = clearData;
    document.getElementById('user-post-btn').onclick = userPost;
    
    refreshThreadsBtn.onclick = generateNewThreads;
    
    // スライダーの数値を表示
    document.getElementById('res-count-slider').oninput = (e) => {
        document.getElementById('res-count-display').textContent = e.target.value;
    };
    
    // オートモードスイッチ
    document.getElementById('auto-mode-switch').onchange = (e) => {
        if(e.target.checked) {
            startAutoMode();
        } else {
            stopAutoMode();
        }
    };

    // AAモードスイッチ
    document.getElementById('aa-mode-switch').onchange = (e) => {
        toggleAAMode(e.target.checked);
    };

    // リロード
    document.getElementById('reload-app-btn').onclick = () => {
        if(confirm("画面をリロードしますか？")) window.location.reload(true);
    };
}

// --- 画面遷移 ---
function showThreadList() {
    viewList.classList.remove('hidden');
    viewDetail.classList.add('hidden');
    backBtn.classList.add('hidden');
    refreshThreadsBtn.classList.remove('hidden');
    headerTitle.textContent = "AI掲示板";
    currentThreadId = null;
    renderThreadList();
}

function showThreadDetail(id) {
    const thread = threads.find(t => t.id === id);
    if (!thread) return;

    currentThreadId = id;
    viewList.classList.add('hidden');
    viewDetail.classList.remove('hidden');
    backBtn.classList.remove('hidden');
    refreshThreadsBtn.classList.add('hidden');
    headerTitle.textContent = thread.title;

    renderResList(thread);
    window.scrollTo(0, document.body.scrollHeight);
}

// --- レンダリング ---
function renderThreadList() {
    threadListEl.innerHTML = '';
    threads.forEach(t => {
        const div = document.createElement('div');
        div.className = 'thread-item';
        div.innerHTML = `${escapeHtml(t.title)} <span class="thread-count">(${t.responses.length})</span>`;
        div.onclick = () => showThreadDetail(t.id);
        threadListEl.appendChild(div);
    });
}

function renderResList(thread) {
    resContainerEl.innerHTML = '';
    thread.responses.forEach(res => appendResToDom(res));
}

function appendResToDom(res) {
    const div = document.createElement('div');
    div.className = 'res';
    
    const isMe = res.id === "MY_ID"; 
    const nameStyle = isMe ? "color:blue;" : "";

    div.innerHTML = `
        <div class="res-header">
            <span class="res-number" data-num="${res.number}">${res.number}</span> ：
            <span class="res-name" style="${nameStyle}">${escapeHtml(res.name)}</span>：
            <span class="res-date">2026/01/01(木)</span>
            <span class="res-id">ID:${res.id}</span>
        </div>
        <div class="res-body">${escapeHtml(res.body).replace(/\n/g, '<br>')}</div>
    `;
    
    // アンカークリックイベント
    div.querySelector('.res-number').onclick = () => {
        const input = document.getElementById('user-res-input');
        // 末尾に追加（B案）
        input.value = input.value + (input.value ? " " : "") + ">>" + res.number;
        input.focus();
    };

    resContainerEl.appendChild(div);
}

// --- AI書き込みロジック ---

// 手動更新
async function manualUpdate() {
    await runUpdateProcess();
}

// オートモード開始
function startAutoMode() {
    if(isAutoMode) return;
    isAutoMode = true;
    autoIndicator.classList.remove('hidden');
    document.getElementById('auto-mode-switch').checked = true;
    
    // 初回実行して、あとはループ
    runUpdateProcess();
}

// オートモード停止
function stopAutoMode() {
    isAutoMode = false;
    autoIndicator.classList.add('hidden');
    document.getElementById('auto-mode-switch').checked = false;
    if(autoTimer) clearTimeout(autoTimer);
}

// 更新プロセスの実体
async function runUpdateProcess() {
    const key = localStorage.getItem('ai_gemini_key');
    const model = localStorage.getItem('ai_gemini_model') || "gemini-2.5-flash";
    
    // 設定値の取得
    const resCount = localStorage.getItem('ai_config_count') || 3;
    const toneKey = localStorage.getItem('ai_config_tone') || "mix";
    const customPrompt = localStorage.getItem('ai_config_prompt_custom') || "";
    
    if (!key) {
        alert("APIキーを設定してください");
        stopAutoMode();
        return;
    }

    const thread = threads.find(t => t.id === currentThreadId);
    if(!thread) { stopAutoMode(); return; }

    updateBtn.disabled = true;
    updateBtn.textContent = isAutoMode ? "AUTO進行中..." : "書き込み中...";

    // プロンプト組み立て
    const toneInstruction = TONE_PRESETS[toneKey] || TONE_PRESETS["mix"];
    const context = thread.responses.slice(-20).map(r => `${r.number}: ${r.body}`).join('\n');
    
    const fullPrompt = `
あなたは5ch風掲示板の住人です。
以下のスレッドの続きとして、レスを【${resCount}個】生成してください。

【スレッド情報】
タイトル: ${thread.title}
現在のレス番: ${thread.responses.length}まで
直近の流れ:
${context}

【役割・口調】
${toneInstruction}

【追加指示】
${customPrompt}

【共通ルール】
- ユーザーからのアンカー（>>数字）がある場合は、適度に反応すること。
- IDは適当な8文字英数。
- 出力はJSON配列のみ。

[
  {"name": "名無し", "body": "本文", "id": "AbCdEfGh"}
]
    `;

    // API呼び出し
    const newResList = await fetchAiResponses(key, model, fullPrompt);

    // 擬似ストリーミング表示（1つずつ表示）
    if (newResList && newResList.length > 0) {
        await displaySequentially(thread, newResList);
        saveThreads();
    }

    updateBtn.disabled = false;
    updateBtn.textContent = "更新（AI書き込み）";

    // オートモードなら次を予約
    if(isAutoMode) {
        // 3〜5秒後に次の更新
        autoTimer = setTimeout(runUpdateProcess, 3000 + Math.random() * 2000);
    }
}

// 順番に表示する演出関数
async function displaySequentially(thread, resList) {
    let count = thread.responses.length;
    
    for (const item of resList) {
        // オートモード解除などで画面が変わっていたら中断
        if (currentThreadId !== thread.id) break;

        count++;
        const newRes = {
            number: count,
            name: item.name || "名無しさん",
            body: item.body || "",
            id: item.id || "???"
        };
        
        thread.responses.push(newRes);
        appendResToDom(newRes); // DOMに追加
        window.scrollTo(0, document.body.scrollHeight);
        
        // 0.8秒待機（演出）
        await new Promise(r => setTimeout(r, 800));
    }
}


// --- 新着スレ自動生成 ---
async function generateNewThreads() {
    const key = localStorage.getItem('ai_gemini_key');
    const model = localStorage.getItem('ai_gemini_model') || "gemini-2.5-flash";
    if (!key) { alert("APIキーがありません"); return; }

    refreshThreadsBtn.disabled = true;
    refreshThreadsBtn.textContent = "…";

    const newThreadsData = await fetchAiThreads(key, model);

    if (newThreadsData && newThreadsData.length > 0) {
        newThreadsData.forEach(item => {
            const newThread = {
                id: Date.now().toString() + Math.random().toString(36).slice(-4),
                title: item.title,
                responses: [
                    { number: 1, name: "名無しさん", body: item.firstRes || "立てたで", id: "Owner" }
                ]
            };
            threads.unshift(newThread);
        });
        saveThreads();
        renderThreadList();
        window.scrollTo(0, 0);
    }
    refreshThreadsBtn.disabled = false;
    refreshThreadsBtn.textContent = "🔄";
}

// --- ユーザー書き込み ---
function userPost() {
    const input = document.getElementById('user-res-input');
    const body = input.value.trim();
    if (!body) return;
    
    const thread = threads.find(t => t.id === currentThreadId);
    if (!thread) return;

    thread.responses.push({
        number: thread.responses.length + 1,
        name: "自分",
        body: body,
        id: "MY_ID"
    });

    saveThreads();
    // ユーザーレスは即表示
    appendResToDom(thread.responses[thread.responses.length - 1]);
    input.value = '';
    window.scrollTo(0, document.body.scrollHeight);
}

// --- スレ立て（本文対応） ---
function createThread() {
    const titleInput = document.getElementById('new-thread-title');
    const bodyInput = document.getElementById('new-thread-body');
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim() || "よろしく";
    
    if (!title) return;

    const newThread = {
        id: Date.now().toString(),
        title: title,
        responses: [
            { number: 1, name: "名無しさん", body: body, id: "Owner" }
        ]
    };

    threads.unshift(newThread);
    saveThreads();
    titleInput.value = '';
    bodyInput.value = '';
    closeModal('modal-create');
    renderThreadList();
}

function saveThreads() {
    localStorage.setItem('ai_threads', JSON.stringify(threads));
}

// --- 設定関連 ---
function saveSettings() {
    const key = document.getElementById('api-key-input').value.trim();
    const model = document.getElementById('model-select').value;
    const resCount = document.getElementById('res-count-slider').value;
    const tone = document.getElementById('tone-select').value;
    const customPrompt = document.getElementById('custom-prompt-input').value;
    
    localStorage.setItem('ai_gemini_key', key);
    localStorage.setItem('ai_gemini_model', model);
    localStorage.setItem('ai_config_count', resCount);
    localStorage.setItem('ai_config_tone', tone);
    localStorage.setItem('ai_config_prompt_custom', customPrompt);
    
    closeModal('modal-settings');
    alert("設定を保存しました");
}

function loadSettings() {
    const key = localStorage.getItem('ai_gemini_key');
    if (key) document.getElementById('api-key-input').value = key;

    const model = localStorage.getItem('ai_gemini_model');
    if (model) document.getElementById('model-select').value = model;

    const count = localStorage.getItem('ai_config_count');
    if (count) {
        document.getElementById('res-count-slider').value = count;
        document.getElementById('res-count-display').textContent = count;
    }

    const tone = localStorage.getItem('ai_config_tone');
    if (tone) document.getElementById('tone-select').value = tone;

    const custom = localStorage.getItem('ai_config_prompt_custom');
    if (custom) document.getElementById('custom-prompt-input').value = custom;

    // AAモード
    const isAA = localStorage.getItem('ai_config_aa_mode') === 'true';
    document.getElementById('aa-mode-switch').checked = isAA;
    toggleAAMode(isAA);
}

function toggleAAMode(isAA) {
    if (isAA) {
        document.body.classList.add('aa-font');
    } else {
        document.body.classList.remove('aa-font');
    }
    localStorage.setItem('ai_config_aa_mode', isAA);
}

function clearData() {
    if(confirm("全スレッドを消去しますか？")) {
        localStorage.removeItem('ai_threads');
        threads = [];
        renderThreadList();
        closeModal('modal-settings');
    }
}

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function escapeHtml(str) {
    if(typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

init();