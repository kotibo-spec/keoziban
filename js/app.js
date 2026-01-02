import { fetchAiResponses } from './gemini.js';

// --- データ管理 ---
let threads = JSON.parse(localStorage.getItem('ai_threads')) || [];
let currentThreadId = null;

// --- DOM要素 ---
const viewList = document.getElementById('view-thread-list');
const viewDetail = document.getElementById('view-thread-detail');
const threadListEl = document.getElementById('thread-list');
const resContainerEl = document.getElementById('res-container');
const headerTitle = document.getElementById('header-title');
const backBtn = document.getElementById('back-btn');

// --- 初期化 ---
function init() {
    renderThreadList();
    
    // イベントリスナー
    document.getElementById('settings-btn').onclick = () => showModal('modal-settings');
    document.getElementById('save-settings-btn').onclick = saveSettings;
    document.getElementById('create-thread-btn').onclick = () => showModal('modal-create');
    document.getElementById('do-create-thread-btn').onclick = createThread;
    document.getElementById('cancel-create-btn').onclick = () => closeModal('modal-create');
    document.getElementById('update-btn').onclick = updateThread;
    document.getElementById('back-btn').onclick = showThreadList;
    document.getElementById('clear-data-btn').onclick = clearData;
    
    // アプリ更新（リロード）ボタン
    document.getElementById('reload-app-btn').onclick = () => {
        if(confirm("画面を再読み込みして最新の状態にしますか？")) {
            // キャッシュを無視してリロード
            window.location.reload(true);
        }
    };
    
    // 設定読み込み
    const key = localStorage.getItem('ai_gemini_key');
    if (key) document.getElementById('api-key-input').value = key;

    // モデル読み込み（デフォルトは 2.5-flash にしておきます）
    const model = localStorage.getItem('ai_gemini_model');
    if (model) {
        document.getElementById('model-input').value = model;
    } else {
        document.getElementById('model-input').value = "gemini-2.5-flash";
    }
}

// --- 画面遷移 ---
function showThreadList() {
    viewList.classList.remove('hidden');
    viewDetail.classList.add('hidden');
    backBtn.classList.add('hidden');
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
        const div = document.createElement('div');
        div.className = 'res';
        div.innerHTML = `
            <div class="res-header">
                <span class="res-number">${res.number}</span> ：
                <span class="res-name">${escapeHtml(res.name)}</span>：
                <span class="res-date">2026/01/01(木)</span>
                <span class="res-id">ID:${res.id}</span>
            </div>
            <div class="res-body">${escapeHtml(res.body).replace(/\n/g, '<br>')}</div>
        `;
        resContainerEl.appendChild(div);
    });
}

// --- アクション ---
async function updateThread() {
    const key = localStorage.getItem('ai_gemini_key');
    // 設定がなければデフォルトを使う
    const model = localStorage.getItem('ai_gemini_model') || "gemini-2.5-flash";

    if (!key) {
        alert("設定ボタンからAPIキーを設定してください！");
        return;
    }

    const btn = document.getElementById('update-btn');
    const thread = threads.find(t => t.id === currentThreadId);
    
    btn.disabled = true;
    btn.textContent = "書き込み中...";

    const context = thread.responses.slice(-15).map(r => `${r.number}: ${r.body}`).join('\n');

    // 引数にmodelを追加して渡す
    const newResList = await fetchAiResponses(key, model, thread.title, thread.responses.length, context);

    if (newResList && newResList.length > 0) {
        let count = thread.responses.length;
        newResList.forEach(item => {
            count++;
            thread.responses.push({
                number: count,
                name: item.name || "風吹けば名無し",
                body: item.body || "",
                id: item.id || "???"
            });
        });
        saveThreads();
        renderResList(thread);
        window.scrollTo(0, document.body.scrollHeight);
    }

    btn.disabled = false;
    btn.textContent = "更新（AI書き込み）";
}

function createThread() {
    const titleInput = document.getElementById('new-thread-title');
    const title = titleInput.value.trim();
    if (!title) return;

    const newThread = {
        id: Date.now().toString(),
        title: title,
        responses: [
            { number: 1, name: "風吹けば名無し", body: "立てたで。AI書き込んでくれ。", id: "Owner" }
        ]
    };

    threads.unshift(newThread);
    saveThreads();
    titleInput.value = '';
    closeModal('modal-create');
    renderThreadList();
}

function saveThreads() {
    localStorage.setItem('ai_threads', JSON.stringify(threads));
}

// --- 設定関連 ---
function saveSettings() {
    const key = document.getElementById('api-key-input').value.trim();
    const model = document.getElementById('model-input').value.trim();
    
    localStorage.setItem('ai_gemini_key', key);
    localStorage.setItem('ai_gemini_model', model);
    
    closeModal('modal-settings');
    alert("設定を保存しました。\n使用モデル: " + model);
}

function clearData() {
    if(confirm("本当にスレッドを全て消しますか？")) {
        localStorage.removeItem('ai_threads');
        threads = [];
        renderThreadList();
        closeModal('modal-settings');
    }
}

// --- ユーティリティ ---
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function escapeHtml(str) {
    if(typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

init();
