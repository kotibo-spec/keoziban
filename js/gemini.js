/**
 * スレッドのレスを生成する
 */
export async function fetchAiResponses(apiKey, model, fullPrompt) {
    const targetModel = model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
    return await callGemini(url, fullPrompt);
}

/**
 * 新しいスレッドタイトルを生成する
 */
export async function fetchAiThreads(apiKey, model) {
    const targetModel = model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

    const prompt = `
あなたは日本の掲示板「5ch」の住人です。
今、話題になりそうな、あるいは面白いスレッドのタイトルを「3つ」考えてください。
ジャンルはバラバラにすること。Markdown記号禁止。JSON配列のみ。
[
  {"title": "【悲報】ワイの夕飯、とんでもないことになる", "firstRes": "画像貼るからちょっと待ってろ"},
  {"title": "AIが発達した結果ｗｗｗｗｗ", "firstRes": "仕事なくなったわ"},
  {"title": "近所の廃墟に行ってきたけど質問ある？", "firstRes": "なんかガチでやばいもん見たかもしれん"}
]
    `;
    return await callGemini(url, prompt);
}

/**
 * Gemini呼び出し共通処理
 */
async function callGemini(url, promptText) {
    const body = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            // エラーでもアラートを出さず、空配列を返して呼び出し元に任せる
            console.error(`API Error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        
        if (!data.candidates || !data.candidates.length) return [];
        const candidate = data.candidates[0];
        if (!candidate.content || !candidate.content.parts) return [];

        let text = candidate.content.parts[0].text;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(text);

    } catch (e) {
        // ここでもアラートは出さない（オートモードが止まるため）
        console.error("Gemini通信エラー:", e);
        return [];
    }
}