import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { errorMessage, logs, settings, format } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `あなたはFFmpegのエラー分析AIです。ユーザーのFFmpeg変換で発生したエラーを分析し、以下の形式で日本語で回答してください：

1. 現在の状態：何が起きたかを簡潔に説明
2. 原因：なぜエラーが発生したか
3. 解決方法：具体的な対処法を箇条書きで

修復可能な場合は、修正されたFFmpegコマンド引数をJSON配列で提案してください。
修復不可能な場合は、ユーザーが設定を変更すべき箇所を具体的に指示してください。

回答はJSON形式で返してください：
{
  "status": "現在の状態",
  "cause": "原因",
  "solutions": ["解決方法1", "解決方法2"],
  "canAutoFix": true/false,
  "fixedArgs": ["修正されたFFmpeg引数"] // canAutoFixがtrueの場合のみ
}`;

    const userPrompt = `FFmpeg変換エラーが発生しました。

エラーメッセージ: ${errorMessage}

設定:
- 出力形式: ${format}
- ビデオコーデック: ${settings?.videoCodec}
- オーディオコーデック: ${settings?.audioCodec}
- 解像度: ${settings?.resolutionW}x${settings?.resolutionH}
- ビデオビットレート: ${settings?.videoBitrate}
- オーディオビットレート: ${settings?.audioBitrate}

最新ログ（最大20行）:
${(logs || []).slice(-20).join('\n')}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_error",
            description: "FFmpegエラーの分析結果を返す",
            parameters: {
              type: "object",
              properties: {
                status: { type: "string", description: "現在の状態" },
                cause: { type: "string", description: "原因" },
                solutions: { type: "array", items: { type: "string" }, description: "解決方法" },
                canAutoFix: { type: "boolean", description: "自動修復可能か" },
                fixedArgs: { type: "array", items: { type: "string" }, description: "修正されたFFmpeg引数" },
              },
              required: ["status", "cause", "solutions", "canAutoFix"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_error" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "レート制限中です。しばらくお待ちください。" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "クレジットが不足しています。" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const analysis = toolCall ? JSON.parse(toolCall.function.arguments) : null;

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-error-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
