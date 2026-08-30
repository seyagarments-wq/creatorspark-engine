import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  House,
  Sparkles,
  ShoppingBag,
  MessageCircle,
  Banknote,
  UserRound,
  Plus,
  Film,
  LogOut,
  Ellipsis,
  Target,
  Package,
  NotebookPen,
  ChartLine,
  Trophy,
  LifeBuoy,
  UserPlus,
  GraduationCap,
  ClipboardCheck,
  Camera,
  Users,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { NotificationBell } from "@/components/NotificationBell";

import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { useNewContentBadges, type BadgeSection } from "@/hooks/use-new-content-badges";

interface CreatorLayoutProps {
  children: ReactNode;
  showRightSidebar?: boolean;
  rightSidebar?: ReactNode;
  hideMobileNav?: boolean;
}

// Organized navigation sections
const navSections = [
  {
    title: "CONTENT",
    items: [
      { icon: House, label: "Home", href: "/creator" },
      { icon: Sparkles, label: "AI Coach", href: "/creator/ai" },
      { icon: Film, label: "My Videos", href: "/creator/videos" },
      { icon: Camera, label: "Photos", href: "/creator/photo-submissions" },
      { icon: ChartLine, label: "Performance", href: "/creator/analytics" },
      { icon: NotebookPen, label: "Briefs", href: "/creator/briefs", badgeKey: "briefs" as BadgeSection },
    ],
  },
  {
    title: "RESOURCES",
    items: [
      { icon: ShoppingBag, label: "Brands", href: "/creator/brand" },
      { icon: Package, label: "Samples", href: "/creator/samples", badgeKey: "samples" as BadgeSection },
      { icon: Target, label: "Rewards", href: "/creator/bounties", badgeKey: "rewards" as BadgeSection },
      { icon: Trophy, label: "Leaderboard", href: "/creator/leaderboard" },
      { icon: GraduationCap, label: "Learn", href: "/creator/learn", badgeKey: "learn" as BadgeSection },
      { icon: UserPlus, label: "Referrals", href: "/creator/referrals" },
    ],
  },
  {
    title: "ACCOUNT",
    items: [
      { icon: MessageCircle, label: "Messages", href: "/creator/chat" },
      { icon: Banknote, label: "Payouts", href: "/creator/payouts" },
      { icon: UserRound, label: "Profile", href: "/creator/profile" },
      { icon: LifeBuoy, label: "Support", href: "/creator/help" },
    ],
  },
];

function SidebarContent({ onNavigate, unreadCount, markChatRead, badges, markSeen, isMentor, hasMentor }: { onNavigate?: () => void; unreadCount: number; markChatRead: () => void; badges: Record<BadgeSection, number>; markSeen: (s: BadgeSection) => void; isMentor: boolean; hasMentor: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // Build nav sections dynamically to inject mentor tab
  const resolvedNavSections = navSections.map((section) => {
    if (section.title === "CONTENT") {
      const items = [...section.items];
      if (isMentor) {
        items.push(
          { icon: ClipboardCheck, label: "Content Review", href: "/creator/content-review" },
          { icon: Users, label: "Mentees", href: "/creator/mentees" },
        );
      }
      if (isMentor) {
        items.push({ icon: CalendarRange, label: "Planning Hub", href: "/creator/planning" });
      } else if (hasMentor) {
        items.push({ icon: CalendarRange, label: "Planning Hub", href: "/creator/plan" });
      }
      return { ...section, items };
    }
    return section;
  });

  const handleSignOut = async () => {
    try {
      await signOut();
      await new Promise(resolve => setTimeout(resolve, 200));
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
      navigate("/");
    } finally {
      onNavigate?.();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 lg:p-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Creators Control" width={40} height={40} className="w-10 h-10 rounded-xl shadow-glow-sm" />
          <div>
            <h1 className="font-semibold text-lg">Creators Control</h1>
            <p className="text-xs text-muted-foreground">Creator workspace</p>
          </div>
        </div>
      </div>

      <div className="mx-4 lg:mx-6 border-t border-border/50" />

      {/* Navigation */}
      <nav className="flex-1 p-3 lg:p-4 space-y-5 overflow-y-auto">
        {resolvedNavSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 lg:px-4 py-2 text-[10px] font-medium text-muted-foreground tracking-widest uppercase">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.href;
                const isChatItem = item.href === "/creator/chat";
                const showChatBadge = isChatItem && unreadCount > 0;
                const badgeCount = !isActive && item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => {
                      if (isChatItem) markChatRead();
                      if (item.badgeKey) markSeen(item.badgeKey);
                      onNavigate?.();
                    }}
                    className={cn(
                      "flex items-center gap-3 px-3 lg:px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 touch-manipulation",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-glow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary"
                    )}
                  >
                    <item.icon className={cn("w-[18px] h-[18px] flex-shrink-0", isActive && "text-primary-foreground")} />
                    <span className="truncate flex-1">{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                        {badgeCount > 9 ? "9+" : badgeCount}
                      </span>
                    )}
                    {showChatBadge && (
                      <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Submit button */}
      <div className="p-3 lg:p-4 space-y-2">
        <div className="border-t border-border/50 mb-3" />
        <Button className="w-full" asChild>
          <Link to="/creator/submit" onClick={onNavigate}>
            <Plus className="w-4 h-4 mr-2" />
            Submit Video
          </Link>
        </Button>
        <Button variant="outline" className="w-full" asChild>
          <Link to="/creator/photo-submissions" onClick={onNavigate}>
            <Camera className="w-4 h-4 mr-2" />
            Submit Photos
          </Link>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

// Mobile bottom navigation for quick access
function MobileBottomNav({ onMenuOpen, unreadCount, badges }: { onMenuOpen: () => void; unreadCount: number; badges: Record<BadgeSection, number> }) {
  const location = useLocation();
  
  const quickNavItems = [
    { icon: House, label: "Home", href: "/creator" },
    { icon: Film, label: "Videos", href: "/creator/videos" },
    { icon: Plus, label: "Submit", href: "/creator/submit", isAction: true },
    { icon: Banknote, label: "Payouts", href: "/creator/payouts" },
    { icon: Ellipsis, label: "More", href: "#menu", isMenu: true },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
      <div className="mx-3 mb-2 rounded-[26px] bg-card/90 backdrop-blur-xl border border-border/60 shadow-soft-lg safe-area-pb">
        <div className="flex items-center justify-around h-[64px] px-2">
          {quickNavItems.map((item) => {
            const isActive = !item.isMenu && !item.isAction && location.pathname === item.href;
            
            if (item.isMenu) {
                const totalBadges = unreadCount + badges.learn + badges.briefs + badges.rewards + badges.samples;
                return (
                  <button
                    key="menu"
                    onClick={onMenuOpen}
                    className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl touch-manipulation relative"
                  >
                    <div className="relative">
                      <Ellipsis className="w-[22px] h-[22px] text-muted-foreground" />
                      {totalBadges > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                          {totalBadges > 9 ? "9+" : totalBadges}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] mt-0.5 text-muted-foreground">
                      {item.label}
                    </span>
                  </button>
                );
            }
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex flex-col items-center justify-center w-14 h-14 rounded-2xl touch-manipulation transition-all duration-200",
                  item.isAction && "relative",
                  isActive && "bg-primary/10"
                )}
              >
                {item.isAction ? (
                  <div className="w-14 h-14 -mt-5 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                    <item.icon className="w-7 h-7 text-primary-foreground" />
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default function CreatorLayout({ children, showRightSidebar, rightSidebar, hideMobileNav }: CreatorLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { unreadCount, markAsRead } = useUnreadMessages();
  const { badges, markSeen } = useNewContentBadges();
  const { isMentor, profileId } = useAuth();
  const [hasMentor, setHasMentor] = useState(false);

  useEffect(() => {
    if (!profileId || isMentor) return;
    supabase
      .from("mentor_creator_assignments")
      .select("id")
      .eq("creator_id", profileId)
      .eq("status", "active")
      .limit(1)
      .then(({ data }) => setHasMentor(!!(data && data.length > 0)));
  }, [profileId, isMentor]);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Mobile menu sheet - triggered from bottom nav */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-72 safe-area-pt safe-area-pb">
          <SidebarContent onNavigate={() => setMobileMenuOpen(false)} unreadCount={unreadCount} markChatRead={markAsRead} badges={badges} markSeen={markSeen} isMentor={isMentor} hasMentor={hasMentor} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 h-full w-64 bg-card border-r border-border/60 z-40">
        <SidebarContent unreadCount={unreadCount} markChatRead={markAsRead} badges={badges} markSeen={markSeen} isMentor={isMentor} hasMentor={hasMentor} />
      </aside>

      {/* Main content with safe area padding for notch/Dynamic Island */}
      <main className={cn(
        "lg:ml-64 lg:pt-0 min-h-screen",
        hideMobileNav
          ? "pb-0 lg:pb-0"
          : "pt-[env(safe-area-inset-top)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0",
        showRightSidebar && "lg:mr-80"
      )}>
        <div className={cn(hideMobileNav ? "p-0 lg:p-8" : "p-4 lg:p-8")}>
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      {!hideMobileNav && <MobileBottomNav onMenuOpen={() => setMobileMenuOpen(true)} unreadCount={unreadCount} badges={badges} />}

      {/* Right sidebar */}
      {showRightSidebar && rightSidebar && (
        <aside className="hidden lg:block fixed right-0 top-0 h-full w-80 bg-card border-l border-border/60 p-6 overflow-y-auto">
          {rightSidebar}
        </aside>
      )}
    </div>
  );
}
