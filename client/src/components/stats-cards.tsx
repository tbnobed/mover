import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Files, ArrowUpCircle, User, Upload, AlertCircle } from "lucide-react";

interface Stats {
  totalFiles: number;
  transferring: number;
  assigned: number;
  delivered: number;
  rejected: number;
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32 mt-2" />
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Files",
      value: stats?.totalFiles ?? 0,
      description: "Files in system",
      icon: Files,
      color: "text-chart-1",
    },
    {
      title: "Transferring",
      value: stats?.transferring ?? 0,
      description: "Active transfers",
      icon: ArrowUpCircle,
      color: "text-chart-3",
    },
    {
      title: "Assigned",
      value: stats?.assigned ?? 0,
      description: "Awaiting colorist",
      icon: User,
      color: "text-chart-2",
    },
    {
      title: "Delivered",
      value: stats?.delivered ?? 0,
      description: "Sent to MAM",
      icon: Upload,
      color: "text-chart-4",
    },
    {
      title: "Rejected",
      value: stats?.rejected ?? 0,
      description: "Needs re-export",
      icon: AlertCircle,
      color: "text-destructive",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {statCards.map((stat) => (
        <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(" ", "-")}`}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
