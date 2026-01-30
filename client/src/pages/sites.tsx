import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Server, Wifi, WifiOff, RefreshCw, MapPin, FolderOpen, Plus, Trash2, Pencil } from "lucide-react";
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", exportPath: "" });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [editExportPath, setEditExportPath] = useState("");
  
  const { data: sites, isLoading, isRefetching, refetch } = useQuery<Site[]>({
    queryKey: ["/api/sites"],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const heartbeatMutation = useMutation({
    mutationFn: (siteId: string) => apiRequest("POST", `/api/sites/${siteId}/heartbeat`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Heartbeat sent" });
    },
  });

  const createSiteMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sites", newSite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site created successfully" });
      setCreateDialogOpen(false);
      setNewSite({ name: "", exportPath: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: (siteId: string) => apiRequest("DELETE", `/api/sites/${siteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSiteMutation = useMutation({
    mutationFn: ({ siteId, exportPath }: { siteId: string; exportPath: string }) => 
      apiRequest("PUT", `/api/sites/${siteId}`, { exportPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site updated successfully" });
      setEditDialogOpen(false);
      setEditingSite(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEditSite = (site: Site) => {
    setEditingSite(site);
    setEditExportPath(site.exportPath);
    setEditDialogOpen(true);
  };

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
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh} 
            disabled={isRefetching}
            data-testid="button-refresh-sites"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-site">
                <Plus className="mr-2 h-4 w-4" />
                Add Site
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Site</DialogTitle>
                <DialogDescription>
                  Configure a new site for daemon connectivity
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    value={newSite.name}
                    onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                    placeholder="e.g., tustin, nashville, dallas"
                    data-testid="input-site-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exportPath">Export Path</Label>
                  <Input
                    id="exportPath"
                    value={newSite.exportPath}
                    onChange={(e) => setNewSite({ ...newSite, exportPath: e.target.value })}
                    placeholder="/mnt/site_exports/color_ready/"
                    data-testid="input-site-export-path"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createSiteMutation.mutate()}
                  disabled={!newSite.name || !newSite.exportPath || createSiteMutation.isPending}
                  data-testid="button-create-site"
                >
                  {createSiteMutation.isPending ? "Creating..." : "Create Site"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => heartbeatMutation.mutate(site.id)}
                      disabled={heartbeatMutation.isPending}
                      data-testid={`button-heartbeat-${site.name}`}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${heartbeatMutation.isPending ? "animate-spin" : ""}`} />
                      Heartbeat
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditSite(site)}
                      data-testid={`button-edit-${site.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete site "${site.name}"?`)) {
                          deleteSiteMutation.mutate(site.id);
                        }
                      }}
                      disabled={deleteSiteMutation.isPending}
                      data-testid={`button-delete-${site.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">No sites configured</p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-add-site-empty">
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Site
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Site: {editingSite?.name}</DialogTitle>
            <DialogDescription>
              Update the export path for this site
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editExportPath">Export Path</Label>
              <Input
                id="editExportPath"
                value={editExportPath}
                onChange={(e) => setEditExportPath(e.target.value)}
                placeholder="/mnt/site_exports/color_ready/"
                data-testid="input-edit-export-path"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingSite) {
                  updateSiteMutation.mutate({ siteId: editingSite.id, exportPath: editExportPath });
                }
              }}
              disabled={!editExportPath || updateSiteMutation.isPending}
              data-testid="button-save-site"
            >
              {updateSiteMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
