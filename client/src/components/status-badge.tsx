import { Badge } from "@/components/ui/badge";
import type { FileState, SiteName } from "@shared/schema";
import { 
  Circle, 
  CheckCircle2, 
  Clock, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  User, 
  Loader2, 
  Archive, 
  XCircle,
  Upload
} from "lucide-react";

const stateConfig: Record<FileState, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }> = {
  detected: { label: "Detected", variant: "secondary", icon: Circle },
  validated: { label: "Validated", variant: "secondary", icon: CheckCircle2 },
  queued: { label: "Queued", variant: "outline", icon: Clock },
  transferring: { label: "Transferring", variant: "default", icon: ArrowUpCircle },
  transferred: { label: "Transferred", variant: "default", icon: ArrowDownCircle },
  colorist_assigned: { label: "Assigned", variant: "default", icon: User },
  in_progress: { label: "In Progress", variant: "default", icon: Loader2 },
  delivered_to_mam: { label: "Delivered", variant: "default", icon: Upload },
  archived: { label: "Archived", variant: "secondary", icon: Archive },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
};

export function StatusBadge({ state }: { state: FileState }) {
  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1.5" data-testid={`badge-status-${state}`}>
      <Icon className={`h-3 w-3 ${state === "in_progress" || state === "transferring" ? "animate-spin" : ""}`} />
      {config.label}
    </Badge>
  );
}

const siteColorsList = [
  "bg-chart-1/15 text-chart-1 border-chart-1/30",
  "bg-chart-2/15 text-chart-2 border-chart-2/30",
  "bg-chart-3/15 text-chart-3 border-chart-3/30",
  "bg-chart-4/15 text-chart-4 border-chart-4/30",
  "bg-chart-5/15 text-chart-5 border-chart-5/30",
];

function getSiteColor(site: string): string {
  // Generate consistent color based on site name
  let hash = 0;
  for (let i = 0; i < site.length; i++) {
    hash = site.charCodeAt(i) + ((hash << 5) - hash);
  }
  return siteColorsList[Math.abs(hash) % siteColorsList.length];
}

function formatSiteName(site: string): string {
  // Capitalize first letter of each word
  return site.split(/[-_\s]/).map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

export function SiteBadge({ site }: { site: string }) {
  if (!site) return <span className="text-muted-foreground">-</span>;
  
  return (
    <Badge variant="outline" className={`${getSiteColor(site)} border`} data-testid={`badge-site-${site}`}>
      {formatSiteName(site)}
    </Badge>
  );
}
