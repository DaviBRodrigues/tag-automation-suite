import { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Terminal, LayoutGrid, PlusCircle } from "lucide-react";

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const navItem = (to: string, label: string, Icon: typeof LayoutGrid) => (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
          isActive
            ? "bg-primary/10 text-primary border border-primary/30"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        }`
      }
    >
      <Icon className="h-4 w-4" /> {label}
    </NavLink>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-surface-terminal/80 backdrop-blur sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center group-hover:border-glow transition-shadow">
              <Terminal className="h-4 w-4 text-primary" />
            </div>
            <div className="font-mono text-sm">
              <span className="text-primary">tagforge</span>
              <span className="text-muted-foreground">/agência</span>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {navItem("/", "dashboard", LayoutGrid)}
            {navItem("/new", "nova análise", PlusCircle)}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground hidden md:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1" /> sair
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 container py-8 animate-fade-in">{children}</main>
      <footer className="border-t border-border/60 py-4 mono text-xs text-muted-foreground text-center">
        <span className="text-primary">$</span> tagforge — automação de tagueamento GTM
      </footer>
    </div>
  );
};