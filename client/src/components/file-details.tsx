import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge, SiteBadge } from "@/components/status-badge";
import { 
  X, 
  UserPlus, 
  Play, 
  Upload, 
  XCircle, 
  FileText, 
  Hash, 
  HardDrive, 
  Calendar, 
  User,
  ArrowRight,
  CheckCircle,
  ListPlus,
  Send,
  CheckCheck,
  Trash2,
  Lock,
  Undo2,
  Eraser
} from "lucide-react";
import type { File, AuditLog } from "@shared/schema";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface FileDetailsProps {
  file: File;
  onClose: () => void;
}

export function FileDetails({ file: initialFile, onClose }: FileDetailsProps) {
  const { toast } = useToast();

  // Fetch fresh file data to ensure state is current
  const { data: freshFile } = useQuery<File>({
    queryKey: ["/api/files", initialFile.id],
    refetchInterval: 5000,
  });
  
  // Use fresh data if available, fallback to initial
  const file = freshFile || initialFile;

  const { data: auditLogs, isLoading: logsLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/files", file.id, "audit"],
    refetchInterval: 5000,
  });

  const assignMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/assign`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "File assigned to you" });
    },
    onError: () => {
      toast({ title: "Failed to assign file", variant: "destructive" });
    },
  });

  const startWorkMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Work started on file" });
    },
    onError: () => {
      toast({ title: "Failed to start work", variant: "destructive" });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/deliver`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "File delivered to MAM" });
    },
    onError: () => {
      toast({ title: "Failed to deliver file", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "File rejected" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to reject file", variant: "destructive" });
    },
  });

  const revertMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "File reverted to previous state" });
    },
    onError: () => {
      toast({ title: "Failed to revert file", variant: "destructive" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/validate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "File validated" });
    },
    onError: () => {
      toast({ title: "Failed to validate file", variant: "destructive" });
    },
  });

  const queueMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/queue`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "File queued for transfer" });
    },
    onError: () => {
      toast({ title: "Failed to queue file", variant: "destructive" });
    },
  });

  const startTransferMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/start-transfer`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Transfer started" });
    },
    onError: () => {
      toast({ title: "Failed to start transfer", variant: "destructive" });
    },
  });

  const completeTransferMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/complete-transfer`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Transfer completed" });
    },
    onError: () => {
      toast({ title: "Failed to complete transfer", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/files/${file.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "File deleted" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to delete file", variant: "destructive" });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/files/${file.id}/cleanup`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Cleanup initiated - daemon will delete local file on next heartbeat" });
    },
    onError: () => {
      toast({ title: "Failed to initiate cleanup", variant: "destructive" });
    },
  });

  const isPending = assignMutation.isPending || startWorkMutation.isPending || 
    deliverMutation.isPending || rejectMutation.isPending || validateMutation.isPending ||
    queueMutation.isPending || startTransferMutation.isPending || completeTransferMutation.isPending ||
    deleteMutation.isPending || revertMutation.isPending || cleanupMutation.isPending;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
        <div className="space-y-1 min-w-0 flex-1">
          <CardTitle className="text-lg font-medium truncate" title={file.filename}>
            {file.filename}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <SiteBadge site={file.sourceSite} />
            <StatusBadge state={file.state} />
            {file.cleanedUp && (
              <Badge variant="outline" className="text-xs border-green-500 text-green-600 dark:text-green-400">
                <Eraser className="mr-1 h-3 w-3" />
                Cleaned
              </Badge>
            )}
            {(file as any).locked && (
              <Badge variant="secondary" className="text-xs">
                <Lock className="mr-1 h-3 w-3" />
                Locked
              </Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-details">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <Separator />

      <ScrollArea className="flex-1">
        <CardContent className="pt-4 space-y-6">
          <div className="grid gap-4">
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">Source Path</p>
                <p className="text-sm font-mono truncate">{file.sourcePath}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <HardDrive className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">File Size</p>
                <p className="text-sm font-medium">{formatFileSize(file.fileSize)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Hash className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">SHA256 Hash</p>
                <p className="text-xs font-mono truncate text-muted-foreground">{file.sha256Hash}</p>
              </div>
            </div>

            {file.assignedTo && (
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Assigned To</p>
                  <p className="text-sm font-medium">{file.assignedTo}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Timeline</p>
                <div className="space-y-1 text-sm">
                  {file.detectedAt && (
                    <p>Detected: {format(new Date(file.detectedAt), "MMM d, yyyy HH:mm")}</p>
                  )}
                  {file.validatedAt && (
                    <p>Validated: {format(new Date(file.validatedAt), "MMM d, yyyy HH:mm")}</p>
                  )}
                  {file.transferCompletedAt && (
                    <p>Transferred: {format(new Date(file.transferCompletedAt), "MMM d, yyyy HH:mm")}</p>
                  )}
                  {file.assignedAt && (
                    <p>Assigned: {format(new Date(file.assignedAt), "MMM d, yyyy HH:mm")}</p>
                  )}
                  {file.deliveredAt && (
                    <p>Delivered: {format(new Date(file.deliveredAt), "MMM d, yyyy HH:mm")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Actions</h4>
            <div className="flex flex-wrap gap-2">
              {file.state === "detected" && (
                <Button 
                  onClick={() => validateMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-validate-file"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Validate
                </Button>
              )}
              {file.state === "validated" && (
                <Button 
                  onClick={() => assignMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-assign-file"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign to Colorist
                </Button>
              )}
              {file.state === "queued" && (
                <Button 
                  onClick={() => startTransferMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-start-transfer"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Start Transfer
                </Button>
              )}
              {file.state === "transferring" && (
                <Button 
                  onClick={() => completeTransferMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-complete-transfer"
                >
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Complete Transfer
                </Button>
              )}
              {file.state === "transferred" && (
                <Button 
                  onClick={() => assignMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-assign-file"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign to Me
                </Button>
              )}
              {file.state === "colorist_assigned" && (
                <Button 
                  onClick={() => startWorkMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-start-work"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start Working
                </Button>
              )}
              {file.state === "in_progress" && (
                <Button 
                  onClick={() => deliverMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-deliver-file"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Deliver to MAM
                </Button>
              )}
              {file.state === "delivered_to_mam" && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    if (confirm("This will delete the source file from the orchestrator and the site daemon's local storage. Continue?")) {
                      cleanupMutation.mutate();
                    }
                  }} 
                  disabled={isPending}
                  data-testid="button-cleanup-file"
                >
                  <Eraser className="mr-2 h-4 w-4" />
                  Cleanup Source Files
                </Button>
              )}
              {!["delivered_to_mam", "archived", "rejected"].includes(file.state) && (
                <Button 
                  variant="destructive" 
                  onClick={() => rejectMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-reject-file"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              )}
              {file.state === "detected" && !(file as any).locked && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this file? This cannot be undone.")) {
                      deleteMutation.mutate();
                    }
                  }} 
                  disabled={isPending}
                  data-testid="button-delete-file"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              )}
              {file.state !== "detected" && (
                <Button 
                  variant="outline" 
                  onClick={() => revertMutation.mutate()} 
                  disabled={isPending}
                  data-testid="button-revert-file"
                >
                  <Undo2 className="mr-2 h-4 w-4" />
                  Revert
                </Button>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Audit Trail</h4>
            {logsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : auditLogs && auditLogs.length > 0 ? (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-sm" data-testid={`audit-log-${log.id}`}>
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{log.action}</span>
                        {log.previousState && log.newState && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Badge variant="outline" className="text-xs">{log.previousState}</Badge>
                            <ArrowRight className="h-3 w-3" />
                            <Badge variant="outline" className="text-xs">{log.newState}</Badge>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {log.createdAt && format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No audit entries</p>
            )}
          </div>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
