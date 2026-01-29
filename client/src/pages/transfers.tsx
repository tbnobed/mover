import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { ArrowUpCircle, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TransferJob } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { queryClient } from "@/lib/queryClient";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const statusConfig: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  pending: { label: "Pending", icon: Clock, color: "text-muted-foreground" },
  in_progress: { label: "In Progress", icon: ArrowUpCircle, color: "text-chart-1" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-chart-2" },
  failed: { label: "Failed", icon: XCircle, color: "text-destructive" },
};

function TransferRowSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-2 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    </TableRow>
  );
}

export default function TransfersPage() {
  const { data: transfers, isLoading, isRefetching, refetch } = useQuery<TransferJob[]>({
    queryKey: ["/api/transfers"],
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/transfers"] });
    refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Transfers</h1>
          <p className="text-muted-foreground">RaySync transfer jobs status</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh} 
          disabled={isRefetching}
          data-testid="button-refresh-transfers"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium">Transfer Jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">File ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Transferred</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <TransferRowSkeleton key={i} />)
                ) : transfers && transfers.length > 0 ? (
                  transfers.map((transfer) => {
                    const config = statusConfig[transfer.status] || statusConfig.pending;
                    const Icon = config.icon;
                    
                    return (
                      <TableRow key={transfer.id} data-testid={`row-transfer-${transfer.id}`}>
                        <TableCell className="font-mono text-sm truncate max-w-[280px]">
                          {transfer.fileId}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1 ${config.color}`}>
                            <Icon className={`h-3 w-3 ${transfer.status === "in_progress" ? "animate-spin" : ""}`} />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="w-32">
                            <Progress 
                              value={transfer.status === "completed" ? 100 : 0} 
                              className="h-2"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFileSize(transfer.bytesTransferred || 0)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {transfer.startedAt 
                            ? formatDistanceToNow(new Date(transfer.startedAt), { addSuffix: true })
                            : "-"
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No transfer jobs
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
