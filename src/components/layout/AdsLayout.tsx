import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import AdsCommandBot from "@/components/ads/AdsCommandBot";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Zap,
  Megaphone,
  PlusCircle,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  ArrowLeft,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface AdsLayoutProps {
  children: ReactNode;
}

const adsNavItems = [
  { icon: Megaphone, label: "Active Ads", href: "/ads" },
  { icon: PlusCircle, label: "Build Ads", href: "/ads/builder" },
  { icon: Settings, label: "Ad Settings", href: "/ads/settings" },
];

export default function AdsLayout({ children }: AdsLayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      await new Promise(resolve => setTimeout(resolve, 200));
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() || "A";

  return (
    <div className="min-h-screen bg-background overflow-x-hidden lg:overflow-y-auto overscroll-none lg:overscroll-auto">
      {/* Sidebar - desktop only */}
      <aside className="fixed top-0 left-0 z-40 h-full w-64 bg-card/80 backdrop-blur-xl border-r border-border/50 dark:border-white/[0.06] transition-transform duration-200 hidden lg:block lg:translate-x-0">
        <div className="flex flex-col h-full">
          {/* Logo + Title */}
          <div className="h-16 flex items-center gap-3 px-6">
            <img src={logo} alt="Creators Control" className="w-9 h-9 rounded-xl shadow-glow-sm" />
            <div className="flex flex-col">
              <span className="font-semibold text-sm">Creators Control</span>
              <span className="text-xs text-muted-foreground">Ads Manager</span>
            </div>
          </div>

          <div className="mx-6 border-t border-border/50" />

          {/* Back to Admin */}
          <div className="px-4 pt-4">
            <Link
              to="/admin"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Admin
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 overflow-y-auto">
            <p className="px-4 mb-2 text-[10px] font-medium text-muted-foreground tracking-widest uppercase">
              ADS
            </p>
            <div className="space-y-0.5">
              {adsNavItems.map((item) => {
                const isActive = item.href === "/ads"
                  ? location.pathname === "/ads"
                  : location.pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary dark:bg-primary/15"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                    )}
                  >
                    <item.icon className={cn("w-[18px] h-[18px]", isActive && "text-primary")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User menu */}
          <div className="p-4">
            <div className="border-t border-border/50 mb-3" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/80 transition-colors">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{user?.email}</p>
                    <p className="text-xs text-muted-foreground">Admin</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/admin/settings">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64 min-h-screen pt-[env(safe-area-inset-top)] pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pt-0 overflow-x-hidden">
        <div className="p-3 md:p-4 lg:p-8 w-full max-w-full">
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-3 mb-2 rounded-[22px] bg-card/80 backdrop-blur-xl border border-border/50 shadow-lg">
          <div className="flex items-center justify-around h-[64px] px-2">
            {adsNavItems.map((item) => {
              const isActive = item.href === "/ads"
                ? location.pathname === "/ads"
                : location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center w-14 h-14 rounded-2xl touch-manipulation transition-all duration-200",
                    isActive && "bg-primary/10"
                  )}
                >
                  <item.icon className={cn("w-[22px] h-[22px] transition-colors", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-[10px] mt-0.5 transition-colors", isActive ? "text-primary font-semibold" : "text-muted-foreground")}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
            <Link
              to="/admin"
              className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl touch-manipulation"
            >
              <ArrowLeft className="w-[22px] h-[22px] text-muted-foreground" />
              <span className="text-[10px] mt-0.5 text-muted-foreground">Admin</span>
            </Link>
          </div>
        </div>
      </nav>

      <AdsCommandBot ads={[]} />
    </div>
  );
}
