import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SiteBadge } from "@/components/status-badge";
import { Upload, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActiveUpload {
  id: string;
  filename: string;
  sourceSite: string;
  expectedSize: number;
  receivedSize: number;
  progress: number;
  startedAt: string;
  status: "uploading" | "verifying" | "complete" | "failed";
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function UploadProgress() {
  const { data: uploads = [], isLoading } = useQuery<ActiveUpload[]>({
    queryKey: ["/api/uploads/active"],
    refetchInterval: 1000,
  });

  return (
    <Card data-testid="card-upload-progress">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" />
          {uploads.length > 0 ? `Active Uploads (${uploads.length})` : "No Active Uploads"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {uploads.length === 0 && (
          <p className="text-sm text-muted-foreground">Waiting for uploads from site daemons...</p>
        )}
        {uploads.map((upload) => (
          <div key={upload.id} className="space-y-2" data-testid={`upload-item-${upload.id}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                <span className="font-medium truncate">{upload.filename}</span>
              </div>
              <SiteBadge site={upload.sourceSite} />
            </div>
            <Progress value={upload.progress} className="h-2" data-testid={`progress-bar-${upload.id}`} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {formatBytes(upload.receivedSize)} / {formatBytes(upload.expectedSize)}
              </span>
              <span className="flex items-center gap-1">
                {upload.status === "verifying" ? (
                  "Verifying..."
                ) : (
                  <>
                    {upload.progress}% 
                    <span className="text-muted-foreground/60">
                      • Started {formatDistanceToNow(new Date(upload.startedAt), { addSuffix: true })}
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
