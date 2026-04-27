import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Sparkles, PlusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

const urlSchema = z.string().url("URL inválida").max(2000);

type Client = { id: string; name: string };

const NewAnalysis = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [clients, setClients] = useState<Client[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // new client dialog
  const [openNewClient, setOpenNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientWebsite, setNewClientWebsite] = useState("");

  const loadClients = async () => {
    const { data } = await supabase.from("clients").select("id, name").order("name");
    setClients(data ?? []);
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return toast.error("Informe um nome");
    const { data, error } = await supabase
      .from("clients")
      .insert({ name: newClientName.trim(), website: newClientWebsite.trim() || null, created_by: user?.id })
      .select("id, name")
      .single();
    if (error) return toast.error(error.message);
    toast.success("cliente criado");
    setClients((c) => [...c, data].sort((a, b) => a.name.localeCompare(b.name)));
    setClientId(data.id);
    setOpenNewClient(false);
    setNewClientName("");
    setNewClientWebsite("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = urlSchema.safeParse(url);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user) return toast.error("Sessão expirada");

    setSubmitting(true);
    const { data: analysis, error } = await supabase
      .from("analyses")
      .insert({
        url: parsed.data,
        client_id: clientId || null,
        created_by: user.id,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !analysis) {
      setSubmitting(false);
      return toast.error(error?.message || "Falha ao criar análise");
    }

    // Trigger edge function (don't wait for full result — UI polls via realtime)
    supabase.functions
      .invoke("analyze-url", { body: { analysisId: analysis.id } })
      .then(({ error: fnErr }) => {
        if (fnErr) toast.error(`Análise falhou: ${fnErr.message}`);
      });

    toast.success("análise iniciada");
    navigate(`/analysis/${analysis.id}`);
  };

  return (
    <AppShell>
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4 font-mono">
        <ArrowLeft className="h-4 w-4 mr-1" /> voltar
      </Button>

      <div className="max-w-2xl">
        <p className="font-mono text-xs text-primary mb-2">
          <span className="opacity-60">~/agência/</span>nova-análise
        </p>
        <h1 className="text-3xl font-mono font-bold tracking-tight mb-2">
          nova <span className="text-primary text-glow">análise</span>
        </h1>
        <p className="text-muted-foreground font-mono text-sm mb-8">
          informe a URL e o sistema vai detectar pontos de conversão usando IA
        </p>

        <Card className="p-6 bg-surface-elevated border-border/60">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                URL da página
              </Label>
              <Input
                type="url"
                placeholder="https://exemplo.com.br"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="font-mono mt-1.5"
              />
            </div>

            <div>
              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                cliente (opcional)
              </Label>
              <div className="flex gap-2 mt-1.5">
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="font-mono">
                    <SelectValue placeholder="selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="font-mono">{c.name}</SelectItem>
                    ))}
                    {clients.length === 0 && (
                      <div className="px-2 py-1.5 text-xs font-mono text-muted-foreground">nenhum cliente ainda</div>
                    )}
                  </SelectContent>
                </Select>
                <Dialog open={openNewClient} onOpenChange={setOpenNewClient}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="icon">
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="font-mono">novo cliente</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label className="font-mono text-xs">nome</Label>
                        <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} className="font-mono" />
                      </div>
                      <div>
                        <Label className="font-mono text-xs">website (opcional)</Label>
                        <Input value={newClientWebsite} onChange={(e) => setNewClientWebsite(e.target.value)} className="font-mono" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleCreateClient} className="font-mono">criar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 font-mono text-xs text-muted-foreground">
              <span className="text-primary">→</span> o sistema renderiza a página com browser headless (via Firecrawl)
              e usa <span className="text-primary">Lovable AI</span> para classificar formulários, botões de WhatsApp,
              CTAs e thank-you pages.
            </div>

            <Button type="submit" size="lg" disabled={submitting} className="w-full font-mono">
              <Sparkles className="h-4 w-4 mr-2" />
              {submitting ? "iniciando análise..." : "analisar URL"}
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
};

export default NewAnalysis;