import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Terminal } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [session, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("autenticado");
    navigate("/");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: name || email.split("@")[0] },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("conta criada — você já está dentro");
    navigate("/");
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Falha no login com Google");
      return;
    }
    if (result.redirected) return;
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-radial-glow">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-10 w-10 rounded-md bg-primary/10 border border-primary/30 border-glow flex items-center justify-center">
              <Terminal className="h-5 w-5 text-primary" />
            </div>
            <span className="font-mono text-2xl">
              <span className="text-primary">tagforge</span>
              <span className="text-muted-foreground">/agência</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            <span className="text-primary">$</span> automação de tagueamento GTM<span className="blink">_</span>
          </p>
        </div>

        <Card className="p-6 bg-surface-elevated border-border/60">
          <Button
            type="button"
            variant="outline"
            className="w-full font-mono"
            onClick={handleGoogle}
            disabled={loading}
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            continuar com Google
          </Button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px bg-border flex-1" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase">ou</span>
            <div className="h-px bg-border flex-1" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full bg-secondary">
              <TabsTrigger value="signin" className="font-mono text-xs">login</TabsTrigger>
              <TabsTrigger value="signup" className="font-mono text-xs">cadastrar</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3 mt-4">
                <div>
                  <Label className="font-mono text-xs">email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="font-mono" />
                </div>
                <div>
                  <Label className="font-mono text-xs">senha</Label>
                  <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                </div>
                <Button type="submit" disabled={loading} className="w-full font-mono">
                  {loading ? "autenticando..." : "entrar"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 mt-4">
                <div>
                  <Label className="font-mono text-xs">nome</Label>
                  <Input type="text" value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
                </div>
                <div>
                  <Label className="font-mono text-xs">email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="font-mono" />
                </div>
                <div>
                  <Label className="font-mono text-xs">senha</Label>
                  <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                </div>
                <Button type="submit" disabled={loading} className="w-full font-mono">
                  {loading ? "criando..." : "criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs font-mono text-muted-foreground mt-6">
          o primeiro usuário vira <span className="text-primary">admin</span> automaticamente
        </p>
      </div>
    </div>
  );
};

export default Auth;