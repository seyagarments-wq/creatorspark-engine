import CreatorLayout from "@/components/layout/CreatorLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiChatPanel } from "@/components/ai/AiChatPanel";
import { WorkbookDocs } from "@/components/ai/WorkbookDocs";
import { Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "Write 5 hook ideas for the Warfare hoodie",
  "How are my recent videos doing?",
  "Turn this into a 20 second script",
  "Why do my videos get rejected?",
];

export default function CreatorAI() {
  return (
    <CreatorLayout>
      <div className="mb-4 flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">AI Coach</h1>
          <p className="text-sm text-muted-foreground">Scripts, hooks and feedback on your own content.</p>
        </div>
      </div>

      <Tabs defaultValue="coach">
        <TabsList className="mb-4">
          <TabsTrigger value="coach">Coach</TabsTrigger>
          <TabsTrigger value="workbook">Workbook</TabsTrigger>
        </TabsList>
        <TabsContent value="coach">
          <AiChatPanel scope="creator" suggestions={SUGGESTIONS} />
        </TabsContent>
        <TabsContent value="workbook">
          <WorkbookDocs />
        </TabsContent>
      </Tabs>
    </CreatorLayout>
  );
}
