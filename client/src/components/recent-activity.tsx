import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, ArrowRight } from "lucide-react";
import type { AuditLog } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function ActivitySkeleton() {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-b-0">
      <Skeleton className="h-2 w-2 rounded-full mt-2" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function RecentActivity() {
  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit"],
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="px-6 pb-4">
            {isLoading ? (
              <div className="space-y-0">
                {Array.from({ length: 5 }).map((_, i) => (
                  <ActivitySkeleton key={i} />
                ))}
              </div>
            ) : logs && logs.length > 0 ? (
              <div className="space-y-0">
                {logs.slice(0, 10).map((log) => (
                  <div 
                    key={log.id} 
                    className="flex items-start gap-3 py-3 border-b border-border/50 last:border-b-0"
                    data-testid={`activity-${log.id}`}
                  >
                    <div className="w-2 h-2 mt-2 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{log.action}</span>
                        {log.previousState && log.newState && (
                          <span className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs px-1.5">{log.previousState}</Badge>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <Badge variant="outline" className="text-xs px-1.5">{log.newState}</Badge>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {log.createdAt && formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
