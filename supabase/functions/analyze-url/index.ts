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

type ConversionCandidate = {
  kind: "form" | "link";
  label: string;
  selector: string;
  href?: string;
  action?: string;
  text?: string;
  html: string;
  reason: string;
};

const CTA_KEYWORDS = [
  "comprar",
  "agendar",
  "solicitar",
  "quero",
  "contratar",
  "falar",
  "contato",
  "orcamento",
  "orçamento",
  "consulta",
  "diagnostico",
  "diagnóstico",
  "demo",
  "trial",
  "lead",
  "cadastro",
  "inscrever",
  "matricular",
  "baixar",
  "download",
  "receber",
  "proposta",
];

const EXCLUDED_CLICK_URL_PATTERNS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "spotify.com",
  "instagram.com",
  "facebook.com",
  "linkedin.com",
  "tiktok.com",
  ".mp4",
  ".mov",
  ".avi",
  ".webm",
  ".mp3",
];

const htmlDecode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const getAttr = (tag: string, attr: string) => {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? htmlDecode(match[1].trim()) : "";
};

const normalizeText = (value: string) =>
  htmlDecode(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const toSnakeCase = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
