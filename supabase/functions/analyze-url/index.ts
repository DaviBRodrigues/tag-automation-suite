import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ConversionPoint {
  type: "form" | "whatsapp" | "cta_button" | "thank_you_page" | "phone" | "email" | "other";
  label: string;
  description: string;
  css_selector: string;
  element_html: string;
  trigger_type: string;
  trigger_conditions: Record<string, unknown>;
  suggested_tag_name: string;
  suggested_event_name: string;
  priority: "low" | "medium" | "high";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Backend não configurado");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { analysisId } = await req.json();
    if (!analysisId || typeof analysisId !== "string") {
      return new Response(JSON.stringify({ error: "analysisId obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch analysis
    const { data: analysis, error: aErr } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", analysisId)
      .single();

    if (aErr || !analysis) {
      return new Response(JSON.stringify({ error: "Análise não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (analysis.created_by !== userId) {
      // Allow admins
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Sem permissão" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    await supabase.from("analyses").update({ status: "running", error_message: null }).eq("id", analysisId);

    // 1) Firecrawl scrape (rendered)
    const fcResp = await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: analysis.url,
        formats: ["markdown", "html", "links"],
        onlyMainContent: false,
        waitFor: 1500,
      }),
    });

    if (!fcResp.ok) {
      const t = await fcResp.text();
      throw new Error(`Firecrawl falhou [${fcResp.status}]: ${t.slice(0, 500)}`);
    }
    const fcJson = await fcResp.json();
    const doc = fcJson.data ?? fcJson;
    const html: string = doc.html ?? "";
    const markdown: string = doc.markdown ?? "";
    const links: string[] = doc.links ?? [];
    const metadata = doc.metadata ?? {};
    const pageTitle: string = metadata.title ?? analysis.url;

    // Limit sizes
    const htmlSlice = html.slice(0, 60000);
    const mdSlice = markdown.slice(0, 12000);
    const linksSlice = links.slice(0, 80);

    // 2) Call Lovable AI for classification
    const systemPrompt = `Você é um especialista em Web Analytics e Google Tag Manager.
Sua tarefa: identificar PONTOS DE CONVERSÃO numa página web e propor a configuração do GTM correspondente.
Foque em: formulários (form, submit), botões/links de WhatsApp (wa.me, api.whatsapp.com, web.whatsapp.com),
CTAs genéricos (Comprar, Agendar, Solicitar, Quero, Contratar, Falar com, Receber) e prováveis thank-you pages presentes nos links internos.
Para cada ponto retorne:
- type, label, description (PT-BR, curta)
- css_selector preciso (use #id quando existir, senão .class, senão atributos como [href*="wa.me"])
- element_html (snippet curto, máx 300 chars)
- trigger_type GTM ("Form Submission", "Click - Just Links", "Click - All Elements", "Page View", etc.)
- trigger_conditions (objeto JSON com a condição, ex: { "Click URL": "contains wa.me" } ou { "Page Path": "matches RegEx /obrigado|thank-you|sucesso/" })
- suggested_tag_name (snake_case, ex: "ga4_event_form_contato")
- suggested_event_name (snake_case, ex: "generate_lead", "click_whatsapp", "form_submit_contato")
- priority (high para forms e WhatsApp, medium para CTAs, low para outros)

Também produza um plano de mensuração resumido com: visão geral, naming convention sugerida, prioridade por evento.`;

    const userPrompt = `URL: ${analysis.url}
Title: ${pageTitle}

--- LINKS DETECTADOS (até 80) ---
${linksSlice.join("\n")}

--- MARKDOWN (resumo) ---
${mdSlice}

--- HTML (truncado) ---
${htmlSlice}`;

    const aiResp = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_conversion_points",
              description: "Reporta pontos de conversão detectados e plano de mensuração",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  measurement_plan: {
                    type: "object",
                    properties: {
                      overview: { type: "string" },
                      naming_convention: { type: "string" },
                      priorities: { type: "array", items: { type: "string" } },
                    },
                    required: ["overview", "naming_convention", "priorities"],
                  },
                  conversion_points: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["form", "whatsapp", "cta_button", "thank_you_page", "phone", "email", "other"] },
                        label: { type: "string" },
                        description: { type: "string" },
                        css_selector: { type: "string" },
                        element_html: { type: "string" },
                        trigger_type: { type: "string" },
                        trigger_conditions: { type: "object", additionalProperties: true },
                        suggested_tag_name: { type: "string" },
                        suggested_event_name: { type: "string" },
                        priority: { type: "string", enum: ["low", "medium", "high"] },
                      },
                      required: ["type", "label", "description", "css_selector", "trigger_type", "suggested_tag_name", "suggested_event_name", "priority"],
                    },
                  },
                },
                required: ["summary", "measurement_plan", "conversion_points"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_conversion_points" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        await supabase.from("analyses").update({ status: "failed", error_message: "Rate limit da IA. Tente em alguns segundos." }).eq("id", analysisId);
        return new Response(JSON.stringify({ error: "Rate limit excedido" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        await supabase.from("analyses").update({ status: "failed", error_message: "Sem créditos de IA." }).eq("id", analysisId);
        return new Response(JSON.stringify({ error: "Créditos esgotados" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await aiResp.text();
      throw new Error(`AI falhou [${aiResp.status}]: ${t.slice(0, 500)}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("IA não retornou tool call");

    const args = JSON.parse(toolCall.function.arguments) as {
      summary: string;
      measurement_plan: Record<string, unknown>;
      conversion_points: ConversionPoint[];
    };

    // Persist
    await supabase
      .from("analyses")
      .update({
        status: "completed",
        page_title: pageTitle,
        summary: args.summary,
        measurement_plan: args.measurement_plan,
        raw_metadata: metadata,
      })
      .eq("id", analysisId);

    // Replace conversion points
    await supabase.from("conversion_points").delete().eq("analysis_id", analysisId);

    if (args.conversion_points?.length) {
      const rows = args.conversion_points.map((p) => ({
        analysis_id: analysisId,
        type: p.type,
        label: p.label,
        description: p.description,
        css_selector: p.css_selector,
        element_html: p.element_html ?? null,
        trigger_type: p.trigger_type,
        trigger_conditions: p.trigger_conditions ?? {},
        suggested_tag_name: p.suggested_tag_name,
        suggested_event_name: p.suggested_event_name,
        priority: p.priority,
      }));
      const { error: insErr } = await supabase.from("conversion_points").insert(rows);
      if (insErr) console.error("Insert conversion_points failed:", insErr);
    }

    return new Response(
      JSON.stringify({ success: true, count: args.conversion_points?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("analyze-url error:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.analysisId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase.from("analyses").update({ status: "failed", error_message: msg }).eq("id", body.analysisId);
      }
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});