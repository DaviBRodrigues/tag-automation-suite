import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, ExternalLink, AlertTriangle, MessageCircle, FileText, MousePointerClick, CheckCircle2, Phone, Mail, Tag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type ConvType = "form" | "whatsapp" | "cta_button" | "thank_you_page" | "phone" | "email" | "other";

type ConvPoint = {
  id: string;
  type: ConvType;
  label: string;
  description: string | null;
  css_selector: string | null;
  element_html: string | null;
  trigger_type: string | null;
  trigger_conditions: Record<string, unknown> | null;
  suggested_tag_name: string | null;
  suggested_event_name: string | null;
  priority: "low" | "medium" | "high";
};

type Analysis = {
  id: string;
  url: string;
  status: "pending" | "running" | "completed" | "failed";
  page_title: string | null;
  summary: string | null;
  measurement_plan: { overview?: string; naming_convention?: string; priorities?: string[] } | null;
  error_message: string | null;
  created_at: string;
  clients: { name: string } | null;
};

const typeIcon: Record<ConvType, typeof MessageCircle> = {
  form: FileText,
  whatsapp: MessageCircle,
  cta_button: MousePointerClick,
  thank_you_page: CheckCircle2,
  phone: Phone,
  email: Mail,
  other: Tag,
};

const typeLabel: Record<ConvType, string> = {
  form: "Formulário",
  whatsapp: "WhatsApp",
  cta_button: "CTA",
  thank_you_page: "Thank You Page",
  phone: "Telefone",
  email: "E-mail",
  other: "Outro",
};

const priorityStyles: Record<string, string> = {
  high: "bg-primary/10 text-primary border-primary/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

const statusStyles: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-warning/10 text-warning border border-warning/30 animate-pulse",
  completed: "bg-primary/10 text-primary border border-primary/30",
  failed: "bg-destructive/10 text-destructive border border-destructive/30",
};

const AnalysisDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [points, setPoints] = useState<ConvPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    const [{ data: a }, { data: p }] = await Promise.all([
      supabase.from("analyses").select("*, clients(name)").eq("id", id).maybeSingle(),
      supabase.from("conversion_points").select("*").eq("analysis_id", id).order("priority"),
    ]);
    setAnalysis(a as unknown as Analysis);
    setPoints((p as unknown as ConvPoint[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`analysis-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "analyses", filter: `id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversion_points", filter: `analysis_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const reanalyze = async () => {
    if (!id) return;
    toast.info("reanalisando...");
    await supabase.from("analyses").update({ status: "pending" }).eq("id", id);
    const { error } = await supabase.functions.invoke("analyze-url", { body: { analysisId: id } });
    if (error) toast.error(error.message);
  };

  if (loading) {
    return <AppShell><p className="font-mono text-sm text-muted-foreground">carregando...</p></AppShell>;
  }
  if (!analysis) {
    return <AppShell><p className="font-mono text-sm">análise não encontrada</p></AppShell>;
  }

  const grouped = points.reduce<Record<string, ConvPoint[]>>((acc, p) => {
    (acc[p.type] ??= []).push(p);
    return acc;
  }, {});

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4 font-mono">
        <ArrowLeft className="h-4 w-4 mr-1" /> voltar
      </Button>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <p className="font-mono text-xs text-primary mb-2">
            <span className="opacity-60">~/agência/análise/</span>{analysis.id.slice(0, 8)}
          </p>
          <h1 className="text-2xl md:text-3xl font-mono font-bold mb-2 break-words">
            {analysis.page_title || analysis.url}
          </h1>
          <a
            href={analysis.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-primary transition-colors break-all"
          >
            {analysis.url} <ExternalLink className="h-3 w-3" />
          </a>
          <div className="flex items-center gap-2 mt-3">
            <Badge className={`${statusStyles[analysis.status]} font-mono text-[10px] uppercase`}>
              {analysis.status}
            </Badge>
            {analysis.clients?.name && (
              <span className="font-mono text-xs text-muted-foreground">@ {analysis.clients.name}</span>
            )}
          </div>
        </div>
        <Button onClick={reanalyze} variant="outline" className="font-mono shrink-0">
          <RefreshCw className="h-4 w-4 mr-2" /> reanalisar
        </Button>
      </div>

      {analysis.status === "failed" && analysis.error_message && (
        <Card className="p-4 mb-6 bg-destructive/5 border-destructive/30">
          <div className="flex items-start gap-2 font-mono text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-destructive font-semibold">análise falhou</p>
              <p className="text-muted-foreground mt-1">{analysis.error_message}</p>
            </div>
          </div>
        </Card>
      )}

      {analysis.status === "running" || analysis.status === "pending" ? (
        <Card className="p-12 text-center bg-surface-elevated border-warning/30 animate-pulse-glow">
          <p className="font-mono text-sm text-muted-foreground">
            <span className="text-primary">$</span> renderizando página + classificando com IA<span className="blink">_</span>
          </p>
          <p className="font-mono text-xs text-muted-foreground/60 mt-2">isso leva ~15-40s</p>
        </Card>
      ) : (
        <Tabs defaultValue="points" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="points" className="font-mono text-xs">
              pontos ({points.length})
            </TabsTrigger>
            <TabsTrigger value="plan" className="font-mono text-xs">plano de mensuração</TabsTrigger>
            <TabsTrigger value="raw" className="font-mono text-xs">resumo</TabsTrigger>
          </TabsList>

          <TabsContent value="points" className="mt-4">
            {points.length === 0 ? (
              <Card className="p-8 text-center bg-surface-elevated border-dashed">
                <p className="font-mono text-sm text-muted-foreground">nenhum ponto de conversão detectado</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([type, items]) => (
                  <div key={type}>
                    <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-3">
                      <span className="text-primary">#</span> {typeLabel[type as ConvType]} · {items.length}
                    </h3>
                    <div className="grid gap-3">
                      {items.map((p) => <PointCard key={p.id} p={p} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="plan" className="mt-4">
            <Card className="p-6 bg-surface-elevated">
              {analysis.measurement_plan ? (
                <div className="space-y-5 font-mono text-sm">
                  <div>
                    <h4 className="text-primary text-xs uppercase mb-2">// visão geral</h4>
                    <p className="text-foreground/90 leading-relaxed">{analysis.measurement_plan.overview}</p>
                  </div>
                  <div>
                    <h4 className="text-primary text-xs uppercase mb-2">// naming convention</h4>
                    <p className="text-foreground/90 leading-relaxed">{analysis.measurement_plan.naming_convention}</p>
                  </div>
                  <div>
                    <h4 className="text-primary text-xs uppercase mb-2">// prioridades</h4>
                    <ul className="space-y-1">
                      {analysis.measurement_plan.priorities?.map((pr, i) => (
                        <li key={i} className="text-foreground/90"><span className="text-primary">→</span> {pr}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="font-mono text-sm text-muted-foreground">sem plano disponível</p>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="raw" className="mt-4">
            <Card className="p-6 bg-surface-elevated">
              <p className="font-mono text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {analysis.summary || "sem resumo"}
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
};

const PointCard = ({ p }: { p: ConvPoint }) => {
  const Icon = typeIcon[p.type];
  const copyConfig = () => {
    const cfg = {
      tag_name: p.suggested_tag_name,
      event_name: p.suggested_event_name,
      trigger_type: p.trigger_type,
      trigger_conditions: p.trigger_conditions,
      css_selector: p.css_selector,
    };
    navigator.clipboard.writeText(JSON.stringify(cfg, null, 2));
    toast.success("config copiada");
  };

  return (
    <Card className="p-4 bg-surface-elevated border-border/60 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-mono font-semibold text-sm text-foreground">{p.label}</h4>
            <Badge variant="outline" className={`${priorityStyles[p.priority]} font-mono text-[10px] uppercase shrink-0`}>
              {p.priority}
            </Badge>
          </div>
          {p.description && (
            <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
          )}

          <div className="grid md:grid-cols-2 gap-2 text-xs">
            <Field label="trigger" value={p.trigger_type ?? "—"} />
            <Field label="event" value={p.suggested_event_name ?? "—"} />
            <Field label="tag" value={p.suggested_tag_name ?? "—"} />
            <Field label="seletor" value={p.css_selector ?? "—"} mono />
          </div>

          {p.trigger_conditions && Object.keys(p.trigger_conditions).length > 0 && (
            <div className="mt-3 rounded-md bg-surface-terminal border border-border/60 p-3">
              <p className="font-mono text-[10px] text-muted-foreground uppercase mb-1">// trigger conditions</p>
              <pre className="font-mono text-xs text-primary-glow overflow-x-auto">
                {JSON.stringify(p.trigger_conditions, null, 2)}
              </pre>
            </div>
          )}

          <Button size="sm" variant="ghost" onClick={copyConfig} className="mt-3 font-mono text-xs h-7">
            copiar config GTM
          </Button>
        </div>
      </div>
    </Card>
  );
};

const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="rounded-md bg-secondary/40 px-2 py-1.5 border border-border/40">
    <p className="font-mono text-[9px] uppercase text-muted-foreground tracking-wider">{label}</p>
    <p className={`text-xs ${mono ? "font-mono text-primary-glow" : "text-foreground"} truncate`}>{value}</p>
  </div>
);

export default AnalysisDetail;