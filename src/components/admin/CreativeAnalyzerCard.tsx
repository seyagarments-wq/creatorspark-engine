import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain,
  Loader2,
  Sparkles,
  TrendingUp,
  CheckCircle,
  XCircle,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AnalysisData {
  winning_patterns: Array<{
    pattern: string;
    description: string;
    examples: string[];
  }>;
  common_mistakes: Array<{
    mistake: string;
    description: string;
    fix: string;
  }>;
  content_recommendations: string[];
  hook_insights: {
    avg_top_performer_score: number;
    avg_bottom_performer_score: number;
    key_difference: string;
  };
  summary: string;
}

interface Stats {
  total_videos_analyzed: number;
  top_performer_count: number;
  avg_top_roas: number;
  avg_bottom_roas: number;
  avg_top_ctr: number;
  avg_bottom_ctr: number;
  top_performers: Array<{
    id: string;
    title: string;
    creator: string;
    roas: number;
    hook_score: number | null;
  }>;
}

export function CreativeAnalyzerCard() {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("analyze-creative-patterns");
      
      if (invokeError) throw invokeError;
      
      if (data?.analysis) {
        setAnalysis(data.analysis);
        setStats(data.stats || null);
        
        toast({
          title: "Analysis Complete",
          description: `Analyzed patterns across ${data.stats?.total_videos_analyzed || 0} videos`,
        });
      } else if (data?.message) {
        setError(data.message);
        toast({
          title: "Not Enough Data",
          description: data.message,
        });
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to analyze creative patterns";
      setError(errorMessage);
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Creative Analyzer
          </CardTitle>
          <CardDescription>
            Discover winning patterns from your top-performing content
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            {error ? (
              <p className="text-muted-foreground mb-4">{error}</p>
            ) : (
              <p className="text-muted-foreground mb-4">
                Analyze your video library to discover what makes content perform
              </p>
            )}
            <Button onClick={runAnalysis} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Run Creative Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              AI Creative Analyzer
            </CardTitle>
            <CardDescription>
              Patterns from {stats?.total_videos_analyzed || 0} videos analyzed
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Limited Data Warning */}
        {stats && stats.total_videos_analyzed < 5 && stats.total_videos_analyzed > 0 && (
          <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Limited data: only {stats.total_videos_analyzed} video{stats.total_videos_analyzed !== 1 ? "s" : ""} — patterns may not be representative
          </div>
        )}

        {/* Summary */}
        {analysis.summary && (
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-sm">{analysis.summary}</p>
          </div>
        )}

        {/* Performance Comparison */}
        {stats && (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-success/5 border border-success/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Top 20% Avg ROAS</p>
              <p className="text-2xl font-bold text-success">{(stats.avg_top_roas || 0).toFixed(2)}x</p>
            </div>
            <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Bottom 20% Avg ROAS</p>
              <p className="text-2xl font-bold text-destructive">{(stats.avg_bottom_roas || 0).toFixed(2)}x</p>
            </div>
          </div>
        )}

        {/* Hook Score Insights */}
        {analysis.hook_insights && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-warning" />
              Hook Score Insights
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Top Performer Avg: </span>
                <span className="font-medium text-success">{analysis.hook_insights.avg_top_performer_score || "N/A"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Bottom Performer Avg: </span>
                <span className="font-medium text-destructive">{analysis.hook_insights.avg_bottom_performer_score || "N/A"}</span>
              </div>
            </div>
            {analysis.hook_insights.key_difference && (
              <p className="text-sm text-muted-foreground">{analysis.hook_insights.key_difference}</p>
            )}
          </div>
        )}

        {/* Winning Patterns */}
        {analysis.winning_patterns && analysis.winning_patterns.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              Winning Patterns
            </h4>
            <ScrollArea className="h-40">
              <div className="space-y-3">
                {analysis.winning_patterns.map((pattern, i) => (
                  <div key={i} className="p-3 bg-secondary/50 rounded-lg">
                    <p className="font-medium text-sm">{pattern.pattern}</p>
                    <p className="text-xs text-muted-foreground mt-1">{pattern.description}</p>
                    {pattern.examples && pattern.examples.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {pattern.examples.slice(0, 2).map((ex, j) => (
                          <Badge key={j} variant="outline" className="text-xs">
                            {ex.length > 30 ? ex.slice(0, 30) + "..." : ex}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Common Mistakes */}
        {analysis.common_mistakes && analysis.common_mistakes.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              Common Mistakes to Avoid
            </h4>
            <div className="space-y-2">
              {analysis.common_mistakes.map((mistake, i) => (
                <div key={i} className="p-3 bg-destructive/5 border border-destructive/10 rounded-lg">
                  <p className="font-medium text-sm text-destructive">{mistake.mistake}</p>
                  <p className="text-xs text-muted-foreground mt-1">{mistake.description}</p>
                  {mistake.fix && (
                    <p className="text-xs text-success mt-1 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      Fix: {mistake.fix}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {analysis.content_recommendations && analysis.content_recommendations.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Action Items
            </h4>
            <ul className="space-y-1">
              {analysis.content_recommendations.map((rec, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-primary mt-1">→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
