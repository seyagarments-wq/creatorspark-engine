import { Link, useLocation } from "react-router-dom";
import {
  Gauge,
  Clapperboard,
  MessageCircle,
  Banknote,
  Ellipsis,
  Images,
  Contact,
  NotebookPen,
  Package,
  Trophy,
  Radar,
  SwatchBook,
  SlidersHorizontal,
  LogOut,
  Zap,
  MonitorPlay,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

const quickNavItems = [
  { icon: Gauge, label: "Home", href: "/admin" },
  { icon: Clapperboard, label: "Videos", href: "/admin/submissions" },
  { icon: MessageCircle, label: "Chat", href: "/admin/chat" },
  { icon: Banknote, label: "Payouts", href: "/admin/payouts" },
  { icon: Ellipsis, label: "More", href: "#more", isMenu: true },
];

const moreMenuSections = [
  {
    title: "CONTENT",
    items: [
      { icon: MonitorPlay, label: "Ads Manager", href: "/ads" },
      { icon: Radar, label: "Meta Intelligence", href: "/admin/meta-intelligence" },
      { icon: Images, label: "Photo Review", href: "/admin/photo-review" },
    ],
  },
  {
    title: "MANAGE",
    items: [
      { icon: Contact, label: "Creators", href: "/admin/creators" },
      { icon: NotebookPen, label: "Briefs", href: "/admin/briefs" },
      { icon: Package, label: "Samples", href: "/admin/samples" },
      { icon: Trophy, label: "Rewards", href: "/admin/rewards" },
    ],
  },
  {
    title: "SETTINGS",
    items: [
      { icon: SwatchBook, label: "Brand", href: "/admin/brand" },
      { icon: SlidersHorizontal, label: "Settings", href: "/admin/settings" },
    ],
  },
];

export function AdminBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSignOut = async () => {
    setMoreOpen(false);
    try {
      await signOut();
      await new Promise(resolve => setTimeout(resolve, 200));
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-3 mb-2 rounded-[22px] bg-card/80 backdrop-blur-xl border border-border/50 shadow-lg">
          <div className="flex items-center justify-around h-[64px] px-2">
            {quickNavItems.map((item) => {
              const isActive = !item.isMenu && (
                item.href === "/admin" 
                  ? location.pathname === "/admin"
                  : location.pathname.startsWith(item.href)
              );

              if (item.isMenu) {
                return (
                  <button
                    key="more"
                    onClick={() => setMoreOpen(true)}
                    className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl touch-manipulation"
                  >
                    <Ellipsis className="w-[22px] h-[22px] text-muted-foreground" />
                    <span className="text-[10px] mt-0.5 text-muted-foreground">More</span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center w-14 h-14 rounded-2xl touch-manipulation transition-all duration-200",
                    isActive && "bg-primary/10"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-[22px] h-[22px] transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[10px] mt-0.5 transition-colors",
                      isActive ? "text-primary font-semibold" : "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* More Menu Sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)] rounded-t-2xl max-h-[70vh]">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary-foreground" />
              </div>
              Creatorsctrl
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-5 overflow-y-auto">
            {moreMenuSections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-semibold text-muted-foreground tracking-wider mb-2 px-1">
                  {section.title}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {section.items.map((item) => {
                    const isActive = location.pathname === item.href ||
                      (item.href !== "/admin" && location.pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl text-sm font-medium transition-colors touch-manipulation",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/50 text-foreground hover:bg-secondary"
                        )}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 p-3 rounded-xl text-sm font-medium text-destructive bg-destructive/10 w-full touch-manipulation"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
