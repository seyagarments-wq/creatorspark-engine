import AdminLayout from "@/components/layout/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiChatPanel } from "@/components/ai/AiChatPanel";
import { WorkbookDocs } from "@/components/ai/WorkbookDocs";
import { AgentsPanel } from "@/components/ai/AgentsPanel";
import { Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "How many videos are pending review right now?",
  "Top 5 videos by ROAS in the last 30 days",
  "Which videos have $30+ spend and no purchases?",
  "Show pending payouts",
];

export default function AdminAI() {
  return (
    <AdminLayout>
      <div className="mb-4 flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">AI Workbook</h1>
          <p className="text-sm text-muted-foreground">Ask your data, draft creative, run scheduled agents.</p>
        </div>
      </div>

      <Tabs defaultValue="copilot">
        <TabsList className="mb-4">
          <TabsTrigger value="copilot">Copilot</TabsTrigger>
          <TabsTrigger value="workbook">Workbook</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>
        <TabsContent value="copilot">
          <AiChatPanel scope="admin" suggestions={SUGGESTIONS} />
        </TabsContent>
        <TabsContent value="workbook">
          <WorkbookDocs />
        </TabsContent>
        <TabsContent value="agents">
          <AgentsPanel />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
