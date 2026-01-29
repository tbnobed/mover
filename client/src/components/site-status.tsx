import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Wifi, WifiOff } from "lucide-react";
import type { Site } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function SiteStatusSkeleton() {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-40 mt-1" />
        </div>
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  );
}

export function SiteStatus() {
  const { data: sites, isLoading } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const siteColors: Record<string, string> = {
    tustin: "bg-chart-1",
    nashville: "bg-chart-2",
    dallas: "bg-chart-4",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          Site Daemons
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <SiteStatusSkeleton key={i} />
            ))}
          </div>
        ) : sites && sites.length > 0 ? (
          <div className="space-y-0">
            {sites.map((site) => {
              const isOnline = site.lastHeartbeat && 
                new Date(site.lastHeartbeat).getTime() > Date.now() - 5 * 60 * 1000;
              
              return (
                <div 
                  key={site.id} 
                  className="flex items-center justify-between py-3 border-b border-border/50 last:border-b-0"
                  data-testid={`site-status-${site.name}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-md ${siteColors[site.name]} flex items-center justify-center`}>
                      <Server className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="font-medium capitalize">{site.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {site.exportPath}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {site.lastHeartbeat && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(site.lastHeartbeat), { addSuffix: true })}
                      </span>
                    )}
                    <Badge 
                      variant={isOnline ? "default" : "secondary"}
                      className={`gap-1 ${isOnline ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" : ""}`}
                    >
                      {isOnline ? (
                        <>
                          <Wifi className="h-3 w-3" />
                          Online
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3 w-3" />
                          Offline
                        </>
                      )}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No sites configured</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
