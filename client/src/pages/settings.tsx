import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  Settings, 
  Bell, 
  Shield, 
  Database, 
  Clock,
  Save,
  HardDrive,
  FolderOpen,
  RefreshCw
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useQuery } from "@tanstack/react-query";

interface StorageSettings {
  storagePath: string;
  allowedSites: string[];
  totalFiles: number;
  totalSize: number;
  siteStats: Record<string, { fileCount: number; totalSize: number }>;
  diskUsage: {
    total: number;
    used: number;
    free: number;
    percentUsed: number;
  } | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  
  const { data: storageSettings, isLoading: storageLoading, refetch: refetchStorage } = useQuery<StorageSettings>({
    queryKey: ["/api/settings/storage"],
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Configure system preferences</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                <CardTitle>File Storage</CardTitle>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => refetchStorage()}
                data-testid="button-refresh-storage"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>Storage path and disk usage for uploaded files</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {storageLoading ? (
              <div className="text-muted-foreground">Loading storage info...</div>
            ) : storageSettings ? (
              <>
                <div className="space-y-2">
                  <Label>Storage Path</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md font-mono text-sm">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span data-testid="text-storage-path">{storageSettings.storagePath}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set via STORAGE_PATH environment variable. Restart required to change.
                  </p>
                </div>
                
                <Separator />
                
                {storageSettings.diskUsage && (
                  <div className="space-y-2">
                    <Label>Disk Usage</Label>
                    <Progress 
                      value={storageSettings.diskUsage.percentUsed} 
                      className="h-2"
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{formatBytes(storageSettings.diskUsage.used)} used</span>
                      <span>{formatBytes(storageSettings.diskUsage.free)} free</span>
                      <span>{formatBytes(storageSettings.diskUsage.total)} total</span>
                    </div>
                  </div>
                )}
                
                <Separator />
                
                <div className="space-y-2">
                  <Label>Site Storage</Label>
                  <div className="grid gap-3 md:grid-cols-3">
                    {storageSettings.allowedSites.map((site) => {
                      const stats = storageSettings.siteStats[site];
                      return (
                        <div 
                          key={site} 
                          className="p-3 border rounded-md"
                          data-testid={`card-site-storage-${site}`}
                        >
                          <div className="font-medium capitalize">{site}</div>
                          <div className="text-sm text-muted-foreground">
                            {stats?.fileCount || 0} files
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatBytes(stats?.totalSize || 0)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Total: {storageSettings.totalFiles} files ({formatBytes(storageSettings.totalSize)})
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">Unable to load storage settings</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Appearance
            </CardTitle>
            <CardDescription>Customize the application appearance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="dark-mode">Dark Mode</Label>
              <Switch 
                id="dark-mode" 
                checked={theme === "dark"}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                data-testid="switch-dark-mode"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </CardTitle>
            <CardDescription>Configure alert preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email-alerts">Email Alerts</Label>
                <p className="text-sm text-muted-foreground">Receive email for critical events</p>
              </div>
              <Switch id="email-alerts" data-testid="switch-email-alerts" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="slack-alerts">Slack Notifications</Label>
                <p className="text-sm text-muted-foreground">Send alerts to Slack channel</p>
              </div>
              <Switch id="slack-alerts" data-testid="switch-slack-alerts" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Timing
            </CardTitle>
            <CardDescription>Configure system timing parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scan-interval">Scan Interval (seconds)</Label>
              <Input 
                id="scan-interval" 
                type="number" 
                defaultValue="300" 
                data-testid="input-scan-interval"
              />
              <p className="text-xs text-muted-foreground">How often site daemons scan for new files</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="freeze-timeout">Freeze Detection Timeout (seconds)</Label>
              <Input 
                id="freeze-timeout" 
                type="number" 
                defaultValue="120" 
                data-testid="input-freeze-timeout"
              />
              <p className="text-xs text-muted-foreground">Wait time before considering file stable</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </CardTitle>
            <CardDescription>Security and access settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="api-logging">API Request Logging</Label>
                <p className="text-sm text-muted-foreground">Log all API requests for auditing</p>
              </div>
              <Switch id="api-logging" defaultChecked data-testid="switch-api-logging" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="ip-whitelist">IP Whitelist</Label>
                <p className="text-sm text-muted-foreground">Restrict API access to known IPs</p>
              </div>
              <Switch id="ip-whitelist" data-testid="switch-ip-whitelist" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database
            </CardTitle>
            <CardDescription>Database connection status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">Connected</span>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>PostgreSQL 15</p>
              <p>Host: localhost</p>
              <p>Database: color_routing</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button data-testid="button-save-settings">
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
