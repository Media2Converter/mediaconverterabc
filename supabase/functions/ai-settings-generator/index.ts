import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { settings, format, mediaInfo, isVideo } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `あなたは変換設定からJSON指示書を生成するAIです。

ユーザーの変換設定を全て漏らさず読み取り、以下の形式でJSON指示書を生成してください。
設定の全項目（形式、ビデオコーデック、オーディオコーデック、解像度、ビットレート、フレームレート、
アスペクト比、開始時間、終了時間、再生速度、ピッチ同期、チャンネル数、周波数、音量、
スキャンタイプ、サムネイル時間、音声有効/無効）を必ず含めてください。

出力JSON形式：
{
  "outputFormat": "MP4",
  "video": {
    "codec": "H.264",
    "resolution": { "width": 1920, "height": 1080 },
    "bitrate": "5120k",
    "framerate": 30,
    "aspectRatio": "16:9",
    "scanType": "progressive",
    "thumbnail": { "time": 0 }
  },
  "audio": {
    "enabled": true,
    "codec": "AAC",
    "bitrate": "128k",
    "channels": 2,
    "sampleRate": 48000,
    "volume": null
  },
  "trimming": {
    "startTime": 0,
    "endTime": null
  },
  "speed": {
    "rate": 1,
    "pitchSync": false
  }
}`;

    const userPrompt = `以下の変換設定から、全ての内容を漏らさずJSON指示書を生成してください：

出力形式: ${format}
動画入力: ${isVideo ? 'はい' : 'いいえ'}

詳細設定:
${JSON.stringify(settings, null, 2)}

メディア情報:
${JSON.stringify(mediaInfo || {}, null, 2)}`;

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
            name: "generate_conversion_spec",
            description: "変換設定からJSON指示書を生成する",
            parameters: {
              type: "object",
              properties: {
                outputFormat: { type: "string" },
                video: {
                  type: "object",
                  properties: {
                    codec: { type: "string" },
                    resolution: { type: "object", properties: { width: { type: "number" }, height: { type: "number" } } },
                    bitrate: { type: "string" },
                    framerate: { type: "number" },
                    aspectRatio: { type: "string" },
                    scanType: { type: "string" },
                    thumbnail: { type: "object", properties: { time: { type: "number" } } },
                  },
                },
                audio: {
                  type: "object",
                  properties: {
                    enabled: { type: "boolean" },
                    codec: { type: "string" },
                    bitrate: { type: "string" },
                    channels: { type: "number" },
                    sampleRate: { type: "number" },
                    volume: { type: "string" },
                  },
                },
                trimming: {
                  type: "object",
                  properties: {
                    startTime: { type: "number" },
                    endTime: { type: "number" },
                  },
                },
                speed: {
                  type: "object",
                  properties: {
                    rate: { type: "number" },
                    pitchSync: { type: "boolean" },
                  },
                },
              },
              required: ["outputFormat"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_conversion_spec" } },
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
    const spec = toolCall ? JSON.parse(toolCall.function.arguments) : null;

    return new Response(JSON.stringify({ spec }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-settings-generator error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
