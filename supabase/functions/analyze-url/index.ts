import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type ConvType =
  | "form"
  | "whatsapp"
  | "cta_button"
  | "thank_you_page"
  | "phone"
  | "email"
  | "other";

interface ConversionPoint {
  type: ConvType;
  label: string;
  description: string;
  css_selector: string;
  element_html: string;
  trigger_type: string;
  trigger_conditions: Record<string, unknown>;
  priority: "low" | "medium" | "high";
}

// ---------- Heuristics ----------

const CTA_KEYWORDS = [
  "comprar","agendar","solicitar","quero","contratar","falar","contato",
  "orcamento","orçamento","consulta","diagnostico","diagnóstico","demo",
  "trial","lead","cadastro","inscrever","matricular","baixar","download",
  "receber","proposta","começar","comecar","assinar","reservar","marcar",
  "garantir","aproveitar","conversar","chamar","enviar","quero saber",
  "saiba mais","conheça","conheca",
];

const NAV_KEYWORDS = [
  "home","início","inicio","sobre","quem somos","serviços","servicos",
  "blog","portfólio","portfolio","cases","clientes","produtos","faq",
  "política","politica","privacidade","termos","cookies","login","entrar",
  "minha conta","menu","trabalhe conosco",
];

const SOCIAL_HOSTS = [
  "instagram.com","facebook.com","fb.com","linkedin.com","twitter.com",
  "x.com","tiktok.com","youtube.com","youtu.be","spotify.com","pinterest.com",
  "threads.net","github.com","behance.net","dribbble.com",
];

const WHATSAPP_PATTERNS = [
  /wa\.me\//i,
  /api\.whatsapp\.com/i,
  /web\.whatsapp\.com/i,
  /chat\.whatsapp\.com/i,
];

const THANKYOU_PATTERNS = [
  /\/(obrigad[oa]|thank[-_]?you|thanks|sucesso|success|confirmacao|confirmação)\b/i,
];

// ---------- Utils ----------

const htmlDecode = (v: string) =>
  v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

const getAttr = (tag: string, attr: string) => {
  const m = tag.match(new RegExp(`\\s${attr}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? htmlDecode(m[1].trim()) : "";
};

const stripTags = (s: string) =>
  htmlDecode(s.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();

const lower = (s: string) => s.toLowerCase();

const containsAny = (txt: string, list: string[]) => {
  const t = lower(txt);
  return list.some((k) => t.includes(k));
};

const buildSelector = (tag: string, tagName: string): string => {
  const id = getAttr(tag, "id");
  if (id) return `#${id}`;
  const cls = getAttr(tag, "class").split(/\s+/).filter(Boolean).slice(0, 2);
  if (cls.length) return `${tagName}.${cls.join(".")}`;
  return tagName;
};

// ---------- Extractors ----------

type Candidate = {
  type: ConvType;
  label: string;
  reason: string;
  selector: string;
  html: string;
  href?: string;
  action?: string;
  associatedFormId?: string;
  builder?: string;
};

function detectBuilder(html: string): string | null {
  if (/elementor-/i.test(html)) return "elementor";
  if (/rd-station|rdstation/i.test(html)) return "rdstation";
  if (/wpcf7|contact-form-7/i.test(html)) return "cf7";
  if (/hbspt-form|hs-form/i.test(html)) return "hubspot";
  if (/typeform/i.test(html)) return "typeform";
  if (/hotmart|kiwify|eduzz|monetizze/i.test(html)) return "checkout";
  return null;
}

function extractForms(html: string): Candidate[] {
  const out: Candidate[] = [];
  const re = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const fullTag = `<form${m[1]}>`;
    const inner = m[2];
    const id = getAttr(fullTag, "id");
    const action = getAttr(fullTag, "action");
    const cls = getAttr(fullTag, "class");
    const text = stripTags(inner).slice(0, 200);
    // Skip search forms
    if (/search/i.test(id + " " + cls + " " + action) && !/lead|contact|contato/i.test(text)) continue;
    out.push({
      type: "form",
      label: id ? `Form #${id}` : (cls ? `Form .${cls.split(/\s+/)[0]}` : "Formulário"),
      reason: "Elemento <form> detectado na página",
      selector: buildSelector(fullTag, "form"),
      html: m[0].slice(0, 500),
      action,
      associatedFormId: id || undefined,
    });
  }
  return out;
}

function extractLinks(html: string): Candidate[] {
  const out: Candidate[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = `<a${m[1]}>`;
    const href = getAttr(tag, "href");
    const text = stripTags(m[2]);
    if (!href || !text) continue;

    const hrefLower = lower(href);

    // WhatsApp
    if (WHATSAPP_PATTERNS.some((p) => p.test(href))) {
      out.push({
        type: "whatsapp",
        label: text.slice(0, 60) || "Link WhatsApp",
        reason: "Link aponta para WhatsApp (wa.me / api.whatsapp / chat)",
        selector: buildSelector(tag, "a"),
        html: m[0].slice(0, 300),
        href,
      });
      continue;
    }

    // Phone
    if (hrefLower.startsWith("tel:")) {
      out.push({
        type: "phone",
        label: text.slice(0, 60) || href,
        reason: "Link tel: detectado",
        selector: `a[href="${href}"]`,
        html: m[0].slice(0, 200),
        href,
      });
      continue;
    }

    // Email
    if (hrefLower.startsWith("mailto:")) {
      out.push({
        type: "email",
        label: text.slice(0, 60) || href,
        reason: "Link mailto: detectado",
        selector: `a[href="${href}"]`,
        html: m[0].slice(0, 200),
        href,
      });
      continue;
    }

    // Skip social/media
    if (SOCIAL_HOSTS.some((h) => hrefLower.includes(h))) continue;
    // Skip simple anchors that are likely nav
    if (containsAny(text, NAV_KEYWORDS) && !containsAny(text, CTA_KEYWORDS)) continue;

    // CTA button-like link
    const isAnchor = href.startsWith("#") && href.length > 1;
    const looksCta = containsAny(text, CTA_KEYWORDS) ||
      /btn|button|cta/i.test(getAttr(tag, "class"));
    if (looksCta) {
      // Try to associate to a form by anchor id
      let associatedFormId: string | undefined;
      if (isAnchor) {
        const id = href.slice(1);
        const formRe = new RegExp(`<form\\b[^>]*\\sid=["']${id}["']`, "i");
        if (formRe.test(html)) associatedFormId = id;
      }
      out.push({
        type: "cta_button",
        label: text.slice(0, 60),
        reason: associatedFormId
          ? `CTA aponta para o formulário #${associatedFormId}`
          : "Texto/classe indica CTA de conversão",
        selector: buildSelector(tag, "a"),
        html: m[0].slice(0, 300),
        href,
        associatedFormId,
      });
    }
  }
  return out;
}

function extractButtons(html: string): Candidate[] {
  const out: Candidate[] = [];
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = `<button${m[1]}>`;
    const text = stripTags(m[2]);
    if (!text) continue;
    const cls = getAttr(tag, "class");
    const looksCta = containsAny(text, CTA_KEYWORDS) || /btn|button|cta/i.test(cls);
    const isSubmit = /type\s*=\s*["']submit["']/i.test(tag);
    if (!looksCta && !isSubmit) continue;
    if (containsAny(text, NAV_KEYWORDS) && !looksCta) continue;
    out.push({
      type: "cta_button",
      label: text.slice(0, 60),
      reason: isSubmit ? "Botão submit (provável envio de form)" : "Botão com texto de CTA",
      selector: buildSelector(tag, "button"),
      html: m[0].slice(0, 300),
    });
  }
  return out;
}

function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of cands) {
    const key = `${c.type}|${c.selector}|${(c.href || "").slice(0, 80)}|${lower(c.label)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ---------- AI refinement ----------

async function classifyWithAI(
  url: string,
  pageTitle: string,
  builder: string | null,
  candidates: Candidate[],
): Promise<{ points: ConversionPoint[]; summary: string; plan: any } | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;

  const system = `Você é especialista em GTM e tracking de conversões para Google Ads, Meta Ads e GA4.
Analise a lista de CANDIDATOS extraídos do HTML e retorne APENAS os que são pontos REAIS de conversão.

Regras:
- Foque em conversão final: formulários de lead, WhatsApp, telefone, email, CTAs principais (compra/agendamento/orçamento), thank-you pages.
- Botão com href="#id" → procure no HTML pelo form correspondente; trate como CTA que abre/leva ao form (associatedFormId).
- IGNORE: links de redes sociais, navegação (Home/Sobre/Blog), rodapé (Política, Termos), busca interna.
- NÃO sugira nomes de tag (tag_name vazio). O usuário vai criar tags Google Ads/Meta/GA4 manualmente.
- trigger_type deve ser GTM-friendly: "Form Submission", "Click - All Elements", "Click - Just Links", "Page View".
- trigger_conditions deve ter chaves como: { "Form ID": "...", "Click URL contains": "wa.me", "Page URL contains": "/obrigado" }.
- priority: high = conversão direta de receita/lead; medium = micro-conversão; low = engajamento.
- description: 1 frase explicando POR QUE é ponto de conversão.`;

  const userMsg = {
    url,
    pageTitle,
    pageBuilder: builder,
    candidates: candidates.slice(0, 60).map((c, i) => ({
      i,
      type: c.type,
      label: c.label,
      reason: c.reason,
      selector: c.selector,
      href: c.href,
      action: c.action,
      associatedFormId: c.associatedFormId,
      htmlSnippet: c.html.slice(0, 240),
    })),
  };

  const tool = {
    type: "function",
    function: {
      name: "report_conversion_points",
      description: "Lista filtrada e classificada de pontos reais de conversão",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Resumo curto da página e oferta principal" },
          measurement_plan: {
            type: "object",
            properties: {
              overview: { type: "string" },
              priorities: { type: "array", items: { type: "string" } },
            },
            required: ["overview", "priorities"],
            additionalProperties: false,
          },
          points: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["form","whatsapp","cta_button","thank_you_page","phone","email","other"] },
                label: { type: "string" },
                description: { type: "string" },
                css_selector: { type: "string" },
                element_html: { type: "string" },
                trigger_type: { type: "string" },
                trigger_conditions: { type: "object", additionalProperties: true },
                priority: { type: "string", enum: ["low","medium","high"] },
              },
              required: ["type","label","description","css_selector","element_html","trigger_type","trigger_conditions","priority"],
              additionalProperties: false,
            },
          },
        },
        required: ["summary","measurement_plan","points"],
        additionalProperties: false,
      },
    },
  };

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userMsg) },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "report_conversion_points" } },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("AI error", res.status, txt);
    return null;
  }
  const data = await res.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!call) return null;
  try {
    const parsed = JSON.parse(call);
    return {
      points: parsed.points ?? [],
      summary: parsed.summary ?? "",
      plan: parsed.measurement_plan ?? null,
    };
  } catch (e) {
    console.error("Parse AI", e);
    return null;
  }
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let analysisId: string | null = null;
  try {
    const body = await req.json();
    analysisId = body.analysisId;
    if (!analysisId) throw new Error("analysisId é obrigatório");

    const { data: analysis, error: aErr } = await supabase
      .from("analyses").select("*").eq("id", analysisId).maybeSingle();
    if (aErr || !analysis) throw new Error("análise não encontrada");

    await supabase.from("analyses").update({ status: "running", error_message: null }).eq("id", analysisId);
    await supabase.from("conversion_points").delete().eq("analysis_id", analysisId);

    // Scrape
    const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!fcKey) throw new Error("FIRECRAWL_API_KEY não configurada");
    const fcRes = await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: analysis.url,
        formats: ["html"],
        onlyMainContent: false,
        waitFor: 2500,
      }),
    });
    const fcJson = await fcRes.json();
    if (!fcRes.ok) throw new Error(`Firecrawl: ${fcJson?.error || fcRes.status}`);
    const html: string = fcJson?.data?.html || fcJson?.html || "";
    const pageTitle: string = fcJson?.data?.metadata?.title || fcJson?.metadata?.title || "";
    if (!html) throw new Error("HTML vazio retornado pelo scraper");

    // Heuristics
    const builder = detectBuilder(html);
    const candidates = dedupe([
      ...extractForms(html),
      ...extractLinks(html),
      ...extractButtons(html),
    ]);

    if (candidates.length === 0) {
      await supabase.from("analyses").update({
        status: "completed",
        page_title: pageTitle,
        summary: "Nenhum candidato a ponto de conversão encontrado no HTML renderizado.",
        measurement_plan: { overview: "Sem pontos detectados", priorities: [] },
      }).eq("id", analysisId);
      return new Response(JSON.stringify({ ok: true, points: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI refine
    const ai = await classifyWithAI(analysis.url, pageTitle, builder, candidates);
    const points: ConversionPoint[] = ai?.points ?? candidates.map((c) => ({
      type: c.type,
      label: c.label,
      description: c.reason,
      css_selector: c.selector,
      element_html: c.html,
      trigger_type: c.type === "form" ? "Form Submission" :
                    c.type === "whatsapp" || c.type === "phone" || c.type === "email" ? "Click - Just Links" :
                    "Click - All Elements",
      trigger_conditions: c.href ? { "Click URL contains": c.href.slice(0, 80) } :
                          c.associatedFormId ? { "Form ID": c.associatedFormId } : {},
      priority: c.type === "form" || c.type === "whatsapp" ? "high" : "medium",
    }));

    if (points.length > 0) {
      const rows = points.map((p) => ({
        analysis_id: analysisId,
        type: p.type,
        label: p.label,
        description: p.description,
        css_selector: p.css_selector,
        element_html: p.element_html,
        trigger_type: p.trigger_type,
        trigger_conditions: p.trigger_conditions,
        priority: p.priority,
      }));
      const { error: insErr } = await supabase.from("conversion_points").insert(rows);
      if (insErr) console.error("insert points", insErr);
    }

    await supabase.from("analyses").update({
      status: "completed",
      page_title: pageTitle,
      summary: ai?.summary || `${points.length} ponto(s) de conversão detectado(s).`,
      measurement_plan: ai?.plan || { overview: "Plano básico gerado por heurística", priorities: [] },
    }).eq("id", analysisId);

    return new Response(JSON.stringify({ ok: true, points: points.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-url error", e);
    if (analysisId) {
      await supabase.from("analyses").update({
        status: "failed",
        error_message: e instanceof Error ? e.message : String(e),
      }).eq("id", analysisId);
    }
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});