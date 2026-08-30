import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

import { NotificationBell } from "@/components/NotificationBell";
import {
  Home,
  MessageSquare,
  DollarSign,
  User,
  Plus,
  Zap,
  Video,
  LogOut,
  Trophy,
  Package,
  FileText,
  Medal,
  BarChart3,
  HelpCircle,
  Users,
  GraduationCap,
  ShieldCheck,
  Gift,
  Camera,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const navItems = [
  { icon: Home, label: "Home", href: "/creator" },
  { icon: CalendarDays, label: "Upload Calendar", href: "/creator/calendar" },
  { icon: Video, label: "My Videos", href: "/creator/videos" },
  { icon: Camera, label: "Photo Submissions", href: "/creator/photo-submissions" },
  { icon: BarChart3, label: "Analytics", href: "/creator/analytics" },
  { icon: FileText, label: "Briefs", href: "/creator/briefs" },
  { icon: Package, label: "Samples", href: "/creator/samples" },
  { icon: Trophy, label: "Bounties", href: "/creator/bounties" },
  { icon: Gift, label: "Reward Shop", href: "/creator/rewards" },
  { icon: Medal, label: "Leaderboard", href: "/creator/leaderboard" },
  { icon: Users, label: "Refer & Earn", href: "/creator/referrals" },
  { icon: MessageSquare, label: "Chat", href: "/creator/chat" },
  { icon: DollarSign, label: "Payouts", href: "/creator/payouts" },
  { icon: User, label: "Profile", href: "/creator/profile" },
  { icon: GraduationCap, label: "Learn", href: "/creator/learn" },
  { icon: HelpCircle, label: "Help", href: "/creator/help" },
];

export default function CreatorSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isMentor } = useAuth();

  const resolvedNavItems = isMentor
    ? [...navItems.slice(0, 4), { icon: ShieldCheck, label: "Content Review", href: "/creator/content-review" }, { icon: Users, label: "Mentees", href: "/creator/mentees" }, ...navItems.slice(4)]
    : navItems;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-card border-r flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Creators Control" className="w-10 h-10 rounded-xl" />
            <div>
              <h1 className="font-bold text-lg">Creators Control</h1>
              <p className="text-xs text-muted-foreground">Creator Portal</p>
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>


      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {resolvedNavItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Submit button */}
      <div className="p-4 border-t">
        <div className="space-y-2">
          <Button className="w-full" asChild>
            <Link to="/creator/submit">
              <Plus className="w-4 h-4 mr-2" />
              Submit Video
            </Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link to="/creator/photo-submissions">
              <Camera className="w-4 h-4 mr-2" />
              Submit Photos
            </Link>
          </Button>
        </div>
      </div>

      {/* Logout */}
      <div className="p-4 pt-0">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
