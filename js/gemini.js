/**
 * Gemini APIを呼び出してレスを生成する
 */
export async function fetchAiResponses(apiKey, model, threadTitle, currentResCount, contextText, promptTemplate) {
    
    const targetModel = model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

    // プロンプトテンプレート内の変数を置換する
    let prompt = promptTemplate
        .replace(/{{TITLE}}/g, threadTitle)
        .replace(/{{RES_COUNT}}/g, currentResCount)
        .replace(/{{CONTEXT}}/g, contextText);

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
            responseMimeType: "application/json" 
        },
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
            const errText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("AIが回答を拒否しました");
        }

        const candidate = data.candidates[0];
        if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0].text) {
             throw new Error("AIからの応答が空でした");
        }

        let text = candidate.content.parts[0].text;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(text);

    } catch (e) {
        console.error(e);
        alert("エラーが発生しました:\n" + e.message);
        return [];
    }
}