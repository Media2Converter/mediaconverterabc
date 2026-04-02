import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { errorMessage, logs, settings, format, deviceInfo } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `あなたはiPhoneの全体システムとFFmpegのエラー分析AIです。CPU・GPU・バッテリー・メモリ・FFmpegの状態を総合的に分析し、厳密で具体的な診断結果を提供してください。

以下の情報を分析してください：
- FFmpegのエラーメッセージとログ
- デバイスのCPU（コア数、負荷状況の推定）
- GPU（レンダラー、ベンダー情報からの能力推定）
- バッテリー残量と充電状態
- メモリ使用状況

エラーの原因を特定し、以下の観点から具体的に説明してください：
1. FFmpegの処理のどの部分でエラーが発生したか
2. デバイスのリソース状態がエラーに影響しているか
3. 設定の問題（コーデック互換性、解像度、ビットレート等）

回答はJSON形式で返してください。修復可能な場合は修正されたFFmpegコマンド引数も提案してください。`;

    const userPrompt = `FFmpeg変換エラーが発生しました。

エラーメッセージ: ${errorMessage}

設定:
- 出力形式: ${format}
- ビデオコーデック: ${settings?.videoCodec}
- オーディオコーデック: ${settings?.audioCodec}
- 解像度: ${settings?.resolutionW}x${settings?.resolutionH}
- ビデオビットレート: ${settings?.videoBitrate}
- オーディオビットレート: ${settings?.audioBitrate}
- 周波数: ${settings?.frequency}
- チャンネル: ${settings?.channels}

デバイス情報:
${JSON.stringify(deviceInfo || {}, null, 2)}

最新ログ（最大20行）:
${(logs || []).slice(-20).join('\n')}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_error",
            description: "FFmpegエラーとデバイス状態の総合分析結果を返す",
            parameters: {
              type: "object",
              properties: {
                status: { type: "string", description: "現在の状態（何が起きたかを厳密に説明）" },
                cause: { type: "string", description: "原因（CPU/GPU/メモリ/FFmpegのどれが問題かを具体的に）" },
                deviceStatus: { type: "string", description: "デバイスの状態サマリー（CPU/GPU/バッテリー/メモリ）" },
                solutions: { type: "array", items: { type: "string" }, description: "的確な解決方法" },
                canAutoFix: { type: "boolean", description: "自動修復可能か" },
                fixedArgs: { type: "array", items: { type: "string" }, description: "修正されたFFmpeg引数" },
              },
              required: ["status", "cause", "deviceStatus", "solutions", "canAutoFix"],
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
