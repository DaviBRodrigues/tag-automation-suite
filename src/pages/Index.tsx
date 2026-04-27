import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Globe, PlusCircle, Zap, FileSearch } from "lucide-react";

type AnalysisRow = {
  id: string;
  url: string;
  status: "pending" | "running" | "completed" | "failed";
  page_title: string | null;
  created_at: string;
  client_id: string | null;
  clients?: { name: string } | null;
  conversion_points: { count: number }[];
};

const statusStyles: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-warning/10 text-warning border border-warning/30 animate-pulse",
  completed: "bg-primary/10 text-primary border border-primary/30",
  failed: "bg-destructive/10 text-destructive border border-destructive/30",
};

const Index = () => {
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("analyses")
      .select("id, url, status, page_title, created_at, client_id, clients(name), conversion_points(count)")
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data as unknown as AnalysisRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("analyses-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "analyses" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <AppShell>
      <section className="mb-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <p className="font-mono text-xs text-primary mb-2">
              <span className="opacity-60">~/agência/</span>dashboard
            </p>
            <h1 className="text-3xl md:text-4xl font-mono font-bold tracking-tight">
              análises de <span className="text-primary text-glow">tagueamento</span>
            </h1>
            <p className="text-muted-foreground mt-2 font-mono text-sm">
              detecte pontos de conversão e gere planos de mensuração para o GTM
            </p>
          </div>
          <Link to="/new">
            <Button size="lg" className="font-mono">
              <PlusCircle className="h-4 w-4 mr-2" /> nova análise
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard icon={FileSearch} label="análises" value={rows.length.toString()} />
          <StatCard
            icon={Zap}
            label="concluídas"
            value={rows.filter((r) => r.status === "completed").length.toString()}
            accent
          />
          <StatCard
            icon={Globe}
            label="em execução"
            value={rows.filter((r) => r.status === "running").length.toString()}
          />
        </div>
      </section>

      <section>
        <h2 className="font-mono text-sm text-muted-foreground mb-4">
          <span className="text-primary">$</span> ls -la analyses/
        </h2>

        {loading ? (
          <p className="font-mono text-sm text-muted-foreground">carregando...</p>
        ) : rows.length === 0 ? (
          <Card className="p-12 text-center bg-surface-elevated border-dashed">
            <FileSearch className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-mono text-sm text-muted-foreground mb-4">nenhuma análise ainda</p>
            <Link to="/new">
              <Button className="font-mono">criar primeira análise</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3">
            {rows.map((r) => (
              <Link key={r.id} to={`/analysis/${r.id}`}>
                <Card className="p-4 bg-surface-elevated border-border/60 hover:border-primary/40 transition-all group">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`${statusStyles[r.status]} font-mono text-[10px] uppercase`}>
                          {r.status}
                        </Badge>
                        {r.clients?.name && (
                          <span className="font-mono text-xs text-muted-foreground">
                            @ {r.clients.name}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-sm truncate text-foreground">
                        {r.page_title || r.url}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground truncate">{r.url}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {r.conversion_points?.[0]?.count ?? 0} pontos
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground/60">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
};

const StatCard = ({ icon: Icon, label, value, accent }: { icon: typeof Zap; label: string; value: string; accent?: boolean }) => (
  <Card className={`p-4 bg-surface-elevated border-border/60 ${accent ? "border-primary/30" : ""}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`font-mono text-3xl font-bold mt-1 ${accent ? "text-primary text-glow" : ""}`}>{value}</p>
      </div>
      <Icon className={`h-5 w-5 ${accent ? "text-primary" : "text-muted-foreground"}`} />
    </div>
  </Card>
);

export default Index;
