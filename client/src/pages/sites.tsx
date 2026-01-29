import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Wifi, WifiOff, RefreshCw, MapPin, FolderOpen } from "lucide-react";
import type { Site } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const siteColors: Record<string, { bg: string; text: string }> = {
  tustin: { bg: "bg-chart-1", text: "text-chart-1" },
  nashville: { bg: "bg-chart-2", text: "text-chart-2" },
  dallas: { bg: "bg-chart-4", text: "text-chart-4" },
};

function SiteCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}

export default function SitesPage() {
  const { toast } = useToast();
  const { data: sites, isLoading, isRefetching, refetch } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
  });

  const heartbeatMutation = useMutation({
    mutationFn: (siteId: string) => apiRequest("POST", `/api/sites/${siteId}/heartbeat`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Heartbeat sent" });
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
    refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Sites</h1>
          <p className="text-muted-foreground">Monitor site daemon status</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh} 
          disabled={isRefetching}
          data-testid="button-refresh-sites"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SiteCardSkeleton key={i} />)
        ) : sites && sites.length > 0 ? (
          sites.map((site) => {
            const colors = siteColors[site.name] || { bg: "bg-muted", text: "text-muted-foreground" };
            const isOnline = site.lastHeartbeat && 
              new Date(site.lastHeartbeat).getTime() > Date.now() - 5 * 60 * 1000;
            
            return (
              <Card key={site.id} data-testid={`card-site-${site.name}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-md ${colors.bg} flex items-center justify-center`}>
                        <Server className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg capitalize">{site.name}</CardTitle>
                        <CardDescription>Site Daemon</CardDescription>
                      </div>
                    </div>
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
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <FolderOpen className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-muted-foreground">Export Path</p>
                        <p className="font-mono text-xs truncate">{site.exportPath}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-muted-foreground">Last Heartbeat</p>
                        <p className="text-xs">
                          {site.lastHeartbeat 
                            ? (
                              <>
                                {formatDistanceToNow(new Date(site.lastHeartbeat), { addSuffix: true })}
                                <span className="text-muted-foreground ml-1">
                                  ({format(new Date(site.lastHeartbeat), "HH:mm:ss")})
                                </span>
                              </>
                            )
                            : "Never"
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => heartbeatMutation.mutate(site.id)}
                    disabled={heartbeatMutation.isPending}
                    data-testid={`button-heartbeat-${site.name}`}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${heartbeatMutation.isPending ? "animate-spin" : ""}`} />
                    Send Heartbeat
                  </Button>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No sites configured</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
