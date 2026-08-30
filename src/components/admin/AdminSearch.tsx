import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search, Users, Clapperboard, Banknote, ArrowRight } from "lucide-react";

type CreatorHit = { id: string; full_name: string; email: string };
type VideoHit = { id: string; title: string; unique_video_id: string; status: string };
type PayoutHit = { id: string; amount: number; status: string; creator_id: string };

const PAGES: { label: string; path: string }[] = [
  { label: "Dashboard", path: "/admin" },
  { label: "Creators", path: "/admin/creators" },
  { label: "Video Review", path: "/admin/submissions" },
  { label: "Payouts", path: "/admin/payouts" },
  { label: "Analytics", path: "/admin/analytics" },
  { label: "Cohorts", path: "/admin/cohorts" },
  { label: "Bounties", path: "/admin/bounties" },
  { label: "Messages", path: "/admin/chat" },
  { label: "Settings", path: "/admin/settings" },
];

export function AdminSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(false);
  const [creators, setCreators] = useState<CreatorHit[]>([]);
  const [videos, setVideos] = useState<VideoHit[]>([]);
  const [payouts, setPayouts] = useState<PayoutHit[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const term = debounced;
    if (term.length < 2) {
      setCreators([]);
      setVideos([]);
      setPayouts([]);
      return;
    }
    const escaped = term.replace(/[%,]/g, "");
    setLoading(true);
    (async () => {
      const [c, v, p] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
          .limit(6),
        supabase
          .from("videos")
          .select("id, title, unique_video_id, status")
          .or(`title.ilike.%${escaped}%,unique_video_id.ilike.%${escaped}%`)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("payouts")
          .select("id, amount, status, creator_id")
          .ilike("status", `%${escaped}%`)
          .order("created_at", { ascending: false })
          .limit(4),
      ]);
      if (cancelled) return;
      setCreators((c.data as CreatorHit[]) || []);
      setVideos((v.data as VideoHit[]) || []);
      setPayouts((p.data as PayoutHit[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const pageHits = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return PAGES;
    return PAGES.filter((p) => p.label.toLowerCase().includes(term));
  }, [query]);

  const go = (path: string) => {
    onOpenChange(false);
    setQuery("");
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search creators, videos, payouts…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!loading && pageHits.length === 0 && creators.length === 0 && videos.length === 0 && payouts.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {pageHits.length > 0 && (
          <CommandGroup heading="Go to">
            {pageHits.map((p) => (
              <CommandItem key={p.path} value={`page-${p.label}`} onSelect={() => go(p.path)}>
                <ArrowRight className="w-4 h-4 mr-2 text-muted-foreground" />
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {creators.length > 0 && (
          <CommandGroup heading="Creators">
            {creators.map((c) => (
              <CommandItem
                key={c.id}
                value={`creator-${c.id}-${c.full_name}`}
                onSelect={() => go(`/admin/creators?creator=${c.id}`)}
              >
                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="truncate">{c.full_name}</span>
                <span className="ml-2 text-xs text-muted-foreground truncate">{c.email}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {videos.length > 0 && (
          <CommandGroup heading="Videos">
            {videos.map((v) => (
              <CommandItem
                key={v.id}
                value={`video-${v.id}-${v.title}`}
                onSelect={() => go(`/admin/submissions?video=${v.id}`)}
              >
                <Clapperboard className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="truncate">{v.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">{v.unique_video_id}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {payouts.length > 0 && (
          <CommandGroup heading="Payouts">
            {payouts.map((p) => (
              <CommandItem key={p.id} value={`payout-${p.id}`} onSelect={() => go("/admin/payouts")}>
                <Banknote className="w-4 h-4 mr-2 text-muted-foreground" />
                ${Number(p.amount).toFixed(2)}
                <span className="ml-2 text-xs text-muted-foreground capitalize">{p.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function useAdminSearchHotkey(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

export function AdminSearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center gap-2 h-11 px-4 rounded-full bg-card border border-border/60 shadow-soft text-left"
    >
      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm text-muted-foreground">Search creators, videos, payouts…</span>
      <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">⌘K</kbd>
    </button>
  );
}
