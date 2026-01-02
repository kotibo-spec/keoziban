import { fetchAiResponses, fetchAiThreads } from './gemini.js';

// --- データ管理 ---
let threads = JSON.parse(localStorage.getItem('ai_threads')) || [];
let currentThreadId = null;

// ★変更：ごちゃ混ぜカオス＆高速化用のプロンプト
const DEFAULT_PROMPT = `
あなたは日本の匿名掲示板「5ch」の住人たちになりきってください。
以下のスレッドの続きとして、新しいレスを【1〜3個】生成してください。（生成数を少なくして高速に応答すること）

【スレッド情報】
タイトル: {{TITLE}}
現在のレス番: {{RES_COUNT}}まで
直近の流れ:
{{CONTEXT}}

【行動指針：カオスな雰囲気を作る】
- 丁寧語は禁止。タメ口、煽り、短文、スラング（w、草、乙、希ガス、それな）を適当に混ぜる。
- キャラを統一しないこと。
  - 「猛虎弁を使う奴（ワイ、せやな）」
  - 「VIPPERっぽい奴（うはｗｗｗおｋｗｗｗ）」
  - 「ニュース民っぽい批判的な奴（〜だろ常識的に）」
  - 「冷めた奴（ソースは？、で？）」
  - これらをランダムに混在させる。
- ユーザーからのアンカー（>>数字）がある場合は、適度に反応して喧嘩したり同意したりすること。でも全員が反応しなくていい。スルーもよし。
- IDは適当な8文字英数（ワッチョイ風）。

【出力形式】
JSON配列のみ。Markdown禁止。
[
  {"name": "名無しさん", "body": "これマジ？", "id": "AbCdEfGh"},
  {"name": "風吹けば名無し", "body": ">>{{RES_COUNT}} 釣り乙ｗｗｗ", "id": "XyZ12345"}
]
`;

// --- DOM要素 ---
const viewList = document.getElementById('view-thread-list');
const viewDetail = document.getElementById('view-thread-detail');
const threadListEl = document.getElementById('thread-list');
const resContainerEl = document.getElementById('res-container');
const headerTitle = document.getElementById('header-title');
const backBtn = document.getElementById('back-btn');
const refreshThreadsBtn = document.getElementById('refresh-threads-btn');

// --- 初期化 ---
function init() {
    renderThreadList();
    
    // イベント
    document.getElementById('settings-btn').onclick = () => showModal('modal-settings');
    document.getElementById('save-settings-btn').onclick = saveSettings;
    document.getElementById('create-thread-btn').onclick = () => showModal('modal-create');
    document.getElementById('do-create-thread-btn').onclick = createThread;
    document.getElementById('cancel-create-btn').onclick = () => closeModal('modal-create');
    document.getElementById('update-btn').onclick = updateThread;
    document.getElementById('back-btn').onclick = showThreadList;
    document.getElementById('clear-data-btn').onclick = clearData;
    document.getElementById('user-post-btn').onclick = userPost;
    
    // 新着スレ取得ボタン
    refreshThreadsBtn.onclick = generateNewThreads;

    // プロンプト初期化ボタン
    document.getElementById('reset-prompt-btn').onclick = () => {
        if(confirm("プロンプトを初期設定（ごちゃ混ぜ5ch風）に戻しますか？")) {
            document.getElementById('prompt-input').value = DEFAULT_PROMPT;
        }
    };
    
    document.getElementById('reload-app-btn').onclick = () => {
        if(confirm("画面をリロードしますか？")) window.location.reload(true);
    };
    
    // データ読み込み
    const key = localStorage.getItem('ai_gemini_key');
    if (key) document.getElementById('api-key-input').value = key;
    const model = localStorage.getItem('ai_gemini_model');
    document.getElementById('model-input').value = model || "gemini-2.5-flash";

    // プロンプト（未保存なら新しいデフォルトを入れる）
    const savedPrompt = localStorage.getItem('ai_gemini_prompt');
    document.getElementById('prompt-input').value = savedPrompt || DEFAULT_PROMPT;
}

// --- 画面遷移 ---
function showThreadList() {
    viewList.classList.remove('hidden');
    viewDetail.classList.add('hidden');
    backBtn.classList.add('hidden');
    refreshThreadsBtn.classList.remove('hidden'); // スレ一覧では表示
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
    refreshThreadsBtn.classList.add('hidden'); // スレ詳細では隠す
    headerTitle.textContent = thread.title;

    renderResList(thread);
    window.scrollTo(0, document.body.scrollHeight);
}

// --- レンダリング ---
function renderThreadList() {
    threadListEl.innerHTML = '';
    // 新しい順に表示
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
        
        const isMe = res.id === "MY_ID"; 
        const nameStyle = isMe ? "color:blue;" : "";

        div.innerHTML = `
            <div class="res-header">
                <span class="res-number">${res.number}</span> ：
                <span class="res-name" style="${nameStyle}">${escapeHtml(res.name)}</span>：
                <span class="res-date">2026/01/01(木)</span>
                <span class="res-id">ID:${res.id}</span>
            </div>
            <div class="res-body">${escapeHtml(res.body).replace(/\n/g, '<br>')}</div>
        `;
        resContainerEl.appendChild(div);
    });
}

// --- 新着スレ自動生成（新機能） ---
async function generateNewThreads() {
    const key = localStorage.getItem('ai_gemini_key');
    const model = localStorage.getItem('ai_gemini_model') || "gemini-2.5-flash";

    if (!key) {
        alert("設定からAPIキーを入れてください");
        return;
    }

    refreshThreadsBtn.disabled = true;
    refreshThreadsBtn.textContent = "…"; // 読み込み中表示

    // AIにスレタイを考えてもらう
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
            // 先頭に追加
            threads.unshift(newThread);
        });

        saveThreads();
        renderThreadList();
        // 演出：少しスクロールを戻す
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
    renderResList(thread);
    input.value = '';
    window.scrollTo(0, document.body.scrollHeight);
}

// --- AI書き込み ---
async function updateThread() {
    const key = localStorage.getItem('ai_gemini_key');
    const model = localStorage.getItem('ai_gemini_model') || "gemini-2.5-flash";
    const promptTemplate = localStorage.getItem('ai_gemini_prompt') || DEFAULT_PROMPT;

    if (!key) { alert("APIキーがありません"); return; }

    const btn = document.getElementById('update-btn');
    const thread = threads.find(t => t.id === currentThreadId);
    
    btn.disabled = true;
    btn.textContent = "書き込み中...";

    const context = thread.responses.slice(-20).map(r => `${r.number}: ${r.body}`).join('\n');

    const newResList = await fetchAiResponses(key, model, thread.title, thread.responses.length, context, promptTemplate);

    if (newResList && newResList.length > 0) {
        let count = thread.responses.length;
        newResList.forEach(item => {
            count++;
            thread.responses.push({
                number: count,
                name: item.name || "名無しさん",
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
            { number: 1, name: "名無しさん", body: "お願いします。", id: "Owner" }
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

function saveSettings() {
    const key = document.getElementById('api-key-input').value.trim();
    const model = document.getElementById('model-input').value.trim();
    const prompt = document.getElementById('prompt-input').value;
    
    localStorage.setItem('ai_gemini_key', key);
    localStorage.setItem('ai_gemini_model', model);
    localStorage.setItem('ai_gemini_prompt', prompt);
    
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