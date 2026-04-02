import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { task, settings, format, mediaInfo } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (task === "build_ffmpeg_args") {
      systemPrompt = `あなたはFFmpegの専門家AIです。ユーザーの変換設定をFFmpegのコマンドライン引数に変換してください。

以下のルールに従ってください：
- 入力ファイル名は "input" + 適切な拡張子
- 出力ファイル名は "output" + 出力形式の拡張子
- コーデックが "copy" の場合は "-c:v copy" または "-c:a copy" を使用
- コーデックが "none" の場合は "-an" を使用
- audioEnabled が false の場合は "-an" を使用
- アスペクト比が "自由" の場合は -aspect を付けない
- 速度変更時はビデオとオーディオの両方にフィルターを適用
- AAC_HE_V1 は "-c:a aac -profile:a aac_he"
- AAC_HE_V2 は "-c:a aac -profile:a aac_he_v2"
- ADPCM系コーデックは適切なFFmpegエンコーダー名に変換
- AMR_NB は周波数を8000Hz、AMR_WB は16000Hzに固定

JSON配列形式でFFmpeg引数を返してください。設定の内容は全て漏らさず反映してください。`;

      userPrompt = `以下の設定でFFmpegコマンド引数を生成してください：

出力形式: ${format}
設定: ${JSON.stringify(settings, null, 2)}
メディア情報: ${JSON.stringify(mediaInfo || {}, null, 2)}`;
    } else if (task === "analyze_aspect") {
      systemPrompt = `あなたは画像・動画解析AIです。提供されたメディア情報からアスペクト比を分析してください。

結果をJSON形式で返してください：
{
  "detectedAspectRatio": "16:9",
  "width": 1920,
  "height": 1080,
  "recommendation": "推奨事項"
}`;

      userPrompt = `以下のメディア情報を分析してください：
${JSON.stringify(mediaInfo || {}, null, 2)}`;
    }

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
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-media-processor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
