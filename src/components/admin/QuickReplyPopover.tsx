import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Zap, Search, Settings } from "lucide-react";
import { MessageTemplateManager } from "./MessageTemplateManager";

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
}

interface QuickReplyPopoverProps {
  onSelect: (content: string) => void;
}

export function QuickReplyPopover({ onSelect }: QuickReplyPopoverProps) {
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open]);

  async function fetchTemplates() {
    setLoading(true);
    const { data } = await supabase
      .from("message_templates")
      .select("id, title, content, category")
      .order("category")
      .order("title");
    setTemplates((data as Template[]) || []);
    setLoading(false);
  }

  const filtered = templates.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, Template[]>>((acc, t) => {
    const cat = t.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const categoryColors: Record<string, string> = {
    approval: "bg-green-500/10 text-green-600",
    feedback: "bg-blue-500/10 text-blue-600",
    rejection: "bg-red-500/10 text-red-600",
    general: "bg-muted text-muted-foreground",
  };

  function handleSelect(content: string) {
    onSelect(content);
    setOpen(false);
    setSearch("");
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" title="Quick replies">
            <Zap className="w-5 h-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" side="top">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
          <ScrollArea className="max-h-64">
            <div className="p-2">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
              ) : Object.keys(grouped).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {templates.length === 0 ? "No templates yet. Create one!" : "No matches found."}
                </p>
              ) : (
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category} className="mb-2">
                    <Badge
                      variant="secondary"
                      className={`text-xs capitalize mb-1.5 ${categoryColors[category] || categoryColors.general}`}
                    >
                      {category}
                    </Badge>
                    {items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelect(t.content)}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                      >
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.content}</p>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => {
                setOpen(false);
                setManagerOpen(true);
              }}
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Templates
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <MessageTemplateManager
        open={managerOpen}
        onOpenChange={(v) => {
          setManagerOpen(v);
          if (!v) fetchTemplates();
        }}
      />
    </>
  );
}
