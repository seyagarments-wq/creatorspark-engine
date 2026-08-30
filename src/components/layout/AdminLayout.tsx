import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
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
  Gauge,
  Sparkles,
  Clapperboard,
  Contact,
  ChartColumn,
  Trophy,
  Banknote,
  Radar,
  MessageCircle,
  SlidersHorizontal,
  PlugZap,
  LogOut,
  Search,
  Bell,
  ChevronDown,
  Package,
  SwatchBook,
  NotebookPen,
  Library,
  MonitorPlay,
  Images,
  BadgeCheck,
  Signature,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminBottomNav } from "./AdminBottomNav";
import { AdminSearch, AdminSearchTrigger, useAdminSearchHotkey } from "@/components/admin/AdminSearch";
import logo from "@/assets/logo.png";


interface AdminLayoutProps {
  children: ReactNode;
}

interface NavSection {
  title: string;
  items: { icon: typeof LayoutDashboard; label: string; href: string }[];
}

const adminNavSections: NavSection[] = [
  {
    title: "",
    items: [
      { icon: Gauge, label: "Overview", href: "/admin" },
      { icon: Sparkles, label: "AI Workbook", href: "/admin/ai" },
    ],
  },
  {
    title: "CONTENT",
    items: [
      { icon: Clapperboard, label: "Video Review", href: "/admin/submissions" },
      { icon: Images, label: "Photo Review", href: "/admin/photo-review" },
      { icon: ChartColumn, label: "Performance", href: "/admin/video-rankings" },
      { icon: MonitorPlay, label: "Ads Manager", href: "/ads" },
      { icon: Radar, label: "Meta Insights", href: "/admin/meta-intelligence" },
      { icon: MessageCircle, label: "Messages", href: "/admin/chat" },
    ],
  },
  {
    title: "CREATORS",
    items: [
      { icon: Contact, label: "Roster", href: "/admin/creators" },
      { icon: BadgeCheck, label: "Eligibility", href: "/admin/eligibility" },
      { icon: Signature, label: "Agreements", href: "/admin/agreements" },
      { icon: NotebookPen, label: "Briefs", href: "/admin/briefs" },
      { icon: Package, label: "Sample Requests", href: "/admin/samples" },
      { icon: Trophy, label: "Rewards", href: "/admin/rewards" },
    ],
  },
  {
    title: "FINANCE",
    items: [
      { icon: Banknote, label: "Payouts", href: "/admin/payouts" },
    ],
  },
  {
    title: "WORKSPACE",
    items: [
      { icon: SwatchBook, label: "Brand", href: "/admin/brand" },
      { icon: Library, label: "Resources", href: "/admin/resources" },
      { icon: SlidersHorizontal, label: "Settings", href: "/admin/settings" },
      { icon: PlugZap, label: "Setup", href: "/admin/setup" },
    ],
  },
];


export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useAdminSearchHotkey(setSearchOpen);


  const handleSignOut = async () => {
    try {
      await signOut();
      await new Promise(resolve => setTimeout(resolve, 200));
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
      navigate("/");
    }
  };

  const userInitials = user?.email?.slice(0, 2).toUpperCase() || "A";

  return (
    <div className="min-h-screen bg-background overflow-x-hidden lg:overflow-y-auto overscroll-none lg:overscroll-auto">
      {/* Floating sidebar - desktop only */}
      <aside className="fixed top-0 left-0 z-40 h-full w-[272px] p-3 hidden lg:block">
        <div className="flex flex-col h-full rounded-[28px] bg-card border border-border/60 shadow-soft-lg overflow-hidden">
          {/* Logo + Title */}
          <div className="h-[68px] flex items-center gap-3 px-5">
            <img src={logo} alt="Creatorsctrl" width={36} height={36} className="w-9 h-9 rounded-2xl" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-sm tracking-tight">Creatorsctrl</span>
              <span className="text-[11px] text-muted-foreground">Admin workspace</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 pb-2 overflow-y-auto">
            {adminNavSections.map((section, sectionIndex) => (
              <div key={sectionIndex} className={cn(sectionIndex > 0 && "mt-5")}>
                {section.title && (
                  <p className="px-4 mb-2 text-[10px] font-semibold text-muted-foreground/70 tracking-[0.14em] uppercase">
                    {section.title}
                  </p>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = location.pathname === item.href ||
                      (item.href !== "/admin" && location.pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-soft"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}
                      >
                        <item.icon className="w-[18px] h-[18px]" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* User menu */}
          <div className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 p-2 rounded-2xl bg-secondary/60 hover:bg-secondary transition-colors">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{user?.email}</p>
                    <p className="text-xs text-muted-foreground">Administrator</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/admin/settings">
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-[272px] min-h-screen pt-[env(safe-area-inset-top)] pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pt-0 overflow-x-hidden">
        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center gap-3 px-3 pt-3">
          <AdminSearchTrigger onClick={() => setSearchOpen(true)} />

          <Link
            to="/admin/chat"
            className="h-11 w-11 rounded-full bg-card border border-border/60 shadow-soft flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Messages"
          >
            <MessageCircle className="w-[18px] h-[18px]" />
          </Link>
          <button
            className="h-11 w-11 rounded-full bg-card border border-border/60 shadow-soft flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="p-3 md:p-4 lg:px-6 lg:py-5 w-full max-w-full">
          {children}
        </div>
      </main>


      {/* Global search */}
      <AdminSearch open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Mobile bottom navigation */}
      <AdminBottomNav />

    </div>
  );
}
