/**
 * Gemini APIを呼び出してレスを生成する
 */
export async function fetchAiResponses(apiKey, threadTitle, currentResCount, contextText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // プロンプト（命令文）
    const prompt = `
あなたは匿名掲示板「5ch」のなんでも実況J（なんJ）の住人になりきってください。
以下のスレッドの続きとして、新しいレスを1〜10個ランダムに生成してください。

【スレッド情報】
タイトル: ${threadTitle}
現在のレス番: ${currentResCount}まで
直近の流れ:
${contextText}

【制約】
- 名前は基本「風吹けば名無し」
- 猛虎弁（〜やで、〜やん、ワイ、など）やネットスラングを多用する。
- 短文、煽り、同意、AAっぽいものなどバリエーションを持たせる。
- 出力は必ず以下のJSON形式の配列のみで行うこと。余計な会話は不要。
- idは適当な8文字程度の文字列。

【出力JSON例】
[
  {"name": "風吹けば名無し", "body": "せやな", "id": "A1b2C3d4"},
  {"name": "風吹けば名無し", "body": ">>1 嘘乙", "id": "X9z8Y7w6"}
]
    `;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        // 重要：JSONモードを強制
        generationConfig: { 
            responseMimeType: "application/json" 
        },
        // 重要：安全フィルターを無効化（5ch風の口調がブロックされないように）
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
            // エラーの詳細を表示させる
            const errText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        
        // AIが回答を拒否した場合（セーフティなど）
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("AIが回答を拒否しました（不適切な内容と判断された可能性があります）");
        }

        const candidate = data.candidates[0];
        
        // 念の為のチェック
        if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0].text) {
             throw new Error("AIからの応答が空でした");
        }

        let text = candidate.content.parts[0].text;

        // 重要：Markdown記号（```json や ```）が含まれていたら削除する
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // JSONパースして返す
        return JSON.parse(text);

    } catch (e) {
        console.error(e);
        // エラー内容をアラートで詳しく出す
        alert("エラーが発生しました:\n" + e.message);
        return [];
    }
}
