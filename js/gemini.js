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
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        // Geminiの返答テキストを取得
        const text = data.candidates[0].content.parts[0].text;
        // JSONパースして返す
        return JSON.parse(text);

    } catch (e) {
        console.error(e);
        alert("AI通信エラー: " + e.message);
        return [];
    }
}
