import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

export default function DataDeletion() {
  const [searchParams] = useSearchParams();
  const confirmationCode = searchParams.get("code");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-success/10 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-success" />
          </div>
          <CardTitle>Data Deletion Request</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Your Instagram connection data has been deleted from our platform.
          </p>
          {confirmationCode && (
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Confirmation Code</p>
              <p className="font-mono text-sm break-all">{confirmationCode}</p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            If you have any questions, please contact our support team.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
