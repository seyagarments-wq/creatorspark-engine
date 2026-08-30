import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Wand2, Check } from "lucide-react";

interface Brand {
  id: string;
  name: string;
}

interface GeneratedBrief {
  title: string;
  description: string;
  guidelines: string;
  dos: string[];
  donts: string[];
}

interface AIBriefGeneratorProps {
  brands: Brand[];
  onBriefGenerated: (brief: GeneratedBrief, brandId: string) => void;
}

export function AIBriefGenerator({ brands, onBriefGenerated }: AIBriefGeneratorProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [goal, setGoal] = useState("");
  const [contentType, setContentType] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [generatedBrief, setGeneratedBrief] = useState<GeneratedBrief | null>(null);

  async function handleGenerate() {
    if (!selectedBrandId) {
      toast({
        title: "Select a brand",
        description: "Please select a brand to generate a brief for",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setGeneratedBrief(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-brief", {
        body: {
          brandId: selectedBrandId,
          goal: goal || undefined,
          contentType: contentType || undefined,
          targetAudience: targetAudience || undefined,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedBrief(data.brief);
      toast({
        title: "Brief generated!",
        description: "Review the AI-generated brief below",
      });
    } catch (error: any) {
      console.error("Error generating brief:", error);
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate brief. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  function handleUseBrief() {
    if (generatedBrief && selectedBrandId) {
      onBriefGenerated(generatedBrief, selectedBrandId);
      setOpen(false);
      resetForm();
    }
  }

  function resetForm() {
    setSelectedBrandId("");
    setGoal("");
    setContentType("");
    setTargetAudience("");
    setGeneratedBrief(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="w-4 h-4" />
          AI Generate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            AI Brief Generator
          </DialogTitle>
          <DialogDescription>
            Let AI create a creative brief based on your brand and goals
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!generatedBrief ? (
            <>
              <div className="space-y-2">
                <Label>Brand *</Label>
                <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Campaign Goal (optional)</Label>
                <Input
                  placeholder="e.g., Drive summer sales, Launch new product..."
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Content Type (optional)</Label>
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unboxing">Unboxing</SelectItem>
                    <SelectItem value="review">Product Review</SelectItem>
                    <SelectItem value="tutorial">Tutorial/How-to</SelectItem>
                    <SelectItem value="lifestyle">Lifestyle Integration</SelectItem>
                    <SelectItem value="testimonial">Testimonial</SelectItem>
                    <SelectItem value="comparison">Before/After Comparison</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Audience (optional)</Label>
                <Textarea
                  placeholder="e.g., Young professionals aged 25-35 interested in fitness..."
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="bg-primary/5 rounded-lg p-4 text-sm">
                <p className="font-medium mb-1">💡 Pro tip</p>
                <p className="text-muted-foreground">
                  The AI will analyze your top-performing videos and incorporate winning
                  patterns into the brief.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-success/5 border border-success/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-success mb-2">
                  <Check className="w-4 h-4" />
                  <span className="font-medium">Brief Generated Successfully</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Title</Label>
                  <p className="font-semibold">{generatedBrief.title}</p>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Description</Label>
                  <p className="text-sm">{generatedBrief.description}</p>
                </div>

                <div>
                  <Label className="text-muted-foreground text-xs">Guidelines</Label>
                  <p className="text-sm whitespace-pre-wrap">{generatedBrief.guidelines}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Do's</Label>
                    <ul className="text-sm space-y-1 mt-1">
                      {generatedBrief.dos.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-success">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Don'ts</Label>
                    <ul className="text-sm space-y-1 mt-1">
                      {generatedBrief.donts.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-destructive">✗</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {!generatedBrief ? (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || !selectedBrandId}
                className="gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Brief
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setGeneratedBrief(null)}>
                Generate Another
              </Button>
              <Button onClick={handleUseBrief} variant="success" className="gap-2">
                <Check className="w-4 h-4" />
                Use This Brief
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
