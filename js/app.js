import { fetchAiResponses, fetchAiThreads } from './gemini.js';

// --- データ管理 ---
let threads = JSON.parse(localStorage.getItem('ai_threads')) || [];
let currentThreadId = null;

// ロール（雰囲気）の定義
const PERSONAS = {
    "mix": "あなたは「5ch」の様々な住人（猛虎弁、VIPPER、冷静な批判屋、無気力な人など）になりきってください。全員の口調を統一せず、カオスなごちゃ混ぜ状態にしてください。",
    "nanj": "あなたは「なんでも実況J（なんJ）」の住人になりきってください。猛虎弁（～やで、～ンゴ、ワイ）を多用し、勢いのある会話をしてください。",
    "vip": "あなたは「VIP板」の住人になりきってください。「うはｗｗｗおｋｗｗｗ」「～だお」など、少し古めのネットスラングや軽いノリで会話してください。",
    "news": "あなたは「ニュース速報＋」の住人になりきってください。社会に対して批判的、皮肉屋、理屈っぽい口調（～だろ常識的に、ソースは？）で会話してください。",
    "gal": "あなたは「女性向け掲示板」の住人になりきってください。「～だよね」「わかる」「それな」など、共感を重視した口調で会話してください。",
    "gentle": "あなたは非常に穏やかな掲示板の住人になりきってください。敬語や丁寧語を使い、争いのない平和な会話を心がけてください。"
};

// --- DOM要素 ---
const viewList = document.getElementById('view-thread-list');
const viewDetail = document.getElementById('view-thread-detail');
const threadListEl = document.getElementById('thread-list');
const resContainerEl = document.getElementById('res-container');
const headerTitle = document.getElementById('header-title');
const backBtn = document.getElementById('back-btn');
const refreshThreadsBtn = document.getElementById('refresh-threads-btn');
const updateBtn = document.getElementById('update-btn');

// --- 初期化 ---
function init() {
    renderThreadList();
    
    // イベント設定
    document.getElementById('settings-btn').onclick = () => showModal('modal-settings');
    document.getElementById('save-settings-btn').onclick = saveSettings;
    
    document.getElementById('create-thread-btn').onclick = () => showModal('modal-create');
    document.getElementById('do-create-thread-btn').onclick = createThread;
    document.getElementById('cancel-create-btn').onclick = () => closeModal('modal-create');
    
    updateBtn.onclick = updateThread;
    document.getElementById('back-btn').onclick = showThreadList;
    document.getElementById('clear-data-btn').onclick = clearData;
    document.getElementById('user-post-btn').onclick = userPost;
    refreshThreadsBtn.onclick = generateNewThreads;
    
    document.getElementById('reload-app-btn').onclick = () => {
        if(confirm("画面をリロードしますか？")) window.location.reload(true);
    };

    // スライダーの数値表示更新
    const slider = document.getElementById('res-count-slider');
    const display = document.getElementById('res-count-display');
    slider.oninput = () => { display.textContent = slider.value; };

    // 設定読み込み
    loadSettings();
}

function loadSettings() {
    const key = localStorage.getItem('ai_gemini_key');
    if (key) document.getElementById('api-key-input').value = key;
    
    const model = localStorage.getItem('ai_gemini_model');
    document.getElementById('model-input').value = model || "gemini-2.5-flash";

    // 細分化された設定の読み込み
    const count = localStorage.getItem('ai_res_count') || "3";
    document.getElementById('res-count-slider').value = count;
    document.getElementById('res-count-display').textContent = count;

    const persona = localStorage.getItem('ai_persona') || "mix";
    document.getElementById('persona-select').value = persona;

    const extra = localStorage.getItem('ai_extra_prompt') || "";
    document.getElementById('extra-prompt-input').value = extra;
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
    thread.responses.forEach(res => {
        addResElementToDom(res);
    });
}

// 1つのレスをDOMに追加する処理
function addResElementToDom(res) {
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
        // 末尾に " >>レス番" を追加
        input.value = input.value + (input.value ? " " : "") + ">>" + res.number;
        input.focus();
    };

    resContainerEl.appendChild(div);
}

// --- プロンプト構築ロジック ---
function buildPrompt(title, resCount, context) {
    const countSetting = document.getElementById('res-count-slider').value;
    const personaKey = document.getElementById('persona-select').value;
    const extraPrompt = document.getElementById('extra-prompt-input').value;

    const personaText = PERSONAS[personaKey] || PERSONAS["mix"];

    return `
${personaText}
【追加の指示】
${extraPrompt}

以下のスレッドの続きとして、新しいレスを【${countSetting}個】生成してください。

【スレッド情報】
タイトル: ${title}
現在のレス番: ${resCount}まで
直近の流れ:
${context}

【ルール】
- ユーザーからのアンカー（>>数字）がある場合は、適度に反応すること。
- IDは適当な8文字英数（ワッチョイ風）。
- 出力はJSON配列のみ。Markdown禁止。

【出力例】
[
  {"name": "名無しさん", "body": "これマジ？", "id": "AbCdEfGh"},
  {"name": "風吹けば名無し", "body": ">>${resCount} 乙ｗｗｗ", "id": "XyZ12345"}
]
    `;
}

// --- AI書き込み（擬似ストリーミング対応） ---
async function updateThread() {
    const key = localStorage.getItem('ai_gemini_key');
    const model = localStorage.getItem('ai_gemini_model') || "gemini-2.5-flash";

    if (!key) { alert("APIキーがありません"); return; }

    const thread = threads.find(t => t.id === currentThreadId);
    
    updateBtn.disabled = true;
    updateBtn.textContent = "AI思考中...";

    const context = thread.responses.slice(-20).map(r => `${r.number}: ${r.body}`).join('\n');
    
    // プロンプトを組み立てる
    const prompt = buildPrompt(thread.title, thread.responses.length, context);

    // AI呼び出し
    const newResList = await fetchAiResponses(key, model, prompt);

    if (newResList && newResList.length > 0) {
        // ★擬似ストリーミング処理★
        updateBtn.textContent = "書き込み中...";
        
        let count = thread.responses.length;
        
        for (const item of newResList) {
            // 0.8秒待機（演出）
            await new Promise(r => setTimeout(r, 800));

            count++;
            const newRes = {
                number: count,
                name: item.name || "名無しさん",
                body: item.body || "",
                id: item.id || "???"
            };

            // データ追加
            thread.responses.push(newRes);
            saveThreads();
            
            // 画面に追加してスクロール
            addResElementToDom(newRes);
            window.scrollTo(0, document.body.scrollHeight);
        }
    }

    updateBtn.disabled = false;
    updateBtn.textContent = "更新（AI書き込み）";
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
    // DOMに直接追加（全再描画しない）
    addResElementToDom(thread.responses[thread.responses.length - 1]);
    input.value = '';
    window.scrollTo(0, document.body.scrollHeight);
}

// --- スレッド作成（本文対応） ---
function createThread() {
    const titleInput = document.getElementById('new-thread-title');
    const bodyInput = document.getElementById('new-thread-body');
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim() || "立てたで。";

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

// --- 設定保存 ---
function saveSettings() {
    const key = document.getElementById('api-key-input').value.trim();
    const model = document.getElementById('model-input').value.trim();
    const count = document.getElementById('res-count-slider').value;
    const persona = document.getElementById('persona-select').value;
    const extra = document.getElementById('extra-prompt-input').value;
    
    localStorage.setItem('ai_gemini_key', key);
    localStorage.setItem('ai_gemini_model', model);
    localStorage.setItem('ai_res_count', count);
    localStorage.setItem('ai_persona', persona);
    localStorage.setItem('ai_extra_prompt', extra);
    
    closeModal('modal-settings');
    alert("設定を保存しました");
}

function clearData() {
    if(confirm("スレッドを全消去しますか？")) {
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