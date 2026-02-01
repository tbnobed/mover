import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, SiteBadge } from "@/components/status-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal, 
  Eye, 
  UserPlus, 
  Play, 
  Upload, 
  XCircle, 
  CheckCircle,
  Trash2,
  X
} from "lucide-react";
import type { File } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function FileRowSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
    </TableRow>
  );
}

interface FileListProps {
  onFileSelect?: (file: File) => void;
  filter?: string;
}

export function FileList({ onFileSelect, filter }: FileListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  
  const { data: files, isLoading, error } = useQuery<File[]>({
    queryKey: filter ? ["/api/files", filter] : ["/api/files"],
    refetchInterval: 5000,
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, fileIds }: { action: string; fileIds: string[] }) => {
      const results = await Promise.allSettled(
        fileIds.map(id => apiRequest("POST", `/api/files/${id}/${action}`))
      );
      const successes = results.filter(r => r.status === "fulfilled").length;
      const failures = results.filter(r => r.status === "rejected").length;
      return { successes, failures };
    },
    onSuccess: (result, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setSelectedIds(new Set());
      if (result.failures > 0) {
        toast({ 
          title: `${action}: ${result.successes} succeeded, ${result.failures} failed`,
          variant: result.successes > 0 ? "default" : "destructive"
        });
      } else {
        toast({ title: `${result.successes} files updated` });
      }
    },
    onError: () => {
      toast({ title: "Bulk action failed", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      const results = await Promise.allSettled(
        fileIds.map(id => apiRequest("DELETE", `/api/files/${id}`))
      );
      const successes = results.filter(r => r.status === "fulfilled").length;
      const failures = results.filter(r => r.status === "rejected").length;
      return { successes, failures };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setSelectedIds(new Set());
      if (result.failures > 0) {
        toast({ 
          title: `Delete: ${result.successes} succeeded, ${result.failures} failed (locked files cannot be deleted)`,
          variant: result.successes > 0 ? "default" : "destructive"
        });
      } else {
        toast({ title: `${result.successes} files deleted` });
      }
    },
    onError: () => {
      toast({ title: "Bulk delete failed", variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!files) return;
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map(f => f.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedFiles = files?.filter(f => selectedIds.has(f.id)) || [];
  const canValidate = selectedFiles.some(f => f.state === "detected");
  const canAssign = selectedFiles.some(f => f.state === "validated" || f.state === "transferred");
  const canStart = selectedFiles.some(f => f.state === "colorist_assigned");
  const canDeliver = selectedFiles.some(f => f.state === "in_progress");
  const canDelete = selectedFiles.some(f => f.state === "detected");
  const canReject = selectedFiles.some(f => !["delivered_to_mam", "archived", "rejected"].includes(f.state));

  const isPending = bulkActionMutation.isPending || bulkDeleteMutation.isPending;

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Failed to load files. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg font-medium">File Queue</CardTitle>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={clearSelection}
                data-testid="button-clear-selection"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {selectedIds.size > 0 && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {canValidate && (
            <Button 
              size="sm" 
              onClick={() => {
                const ids = selectedFiles.filter(f => f.state === "detected").map(f => f.id);
                bulkActionMutation.mutate({ action: "validate", fileIds: ids });
              }}
              disabled={isPending}
              data-testid="button-bulk-validate"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Validate ({selectedFiles.filter(f => f.state === "detected").length})
            </Button>
          )}
          {canAssign && (
            <Button 
              size="sm" 
              onClick={() => {
                const ids = selectedFiles.filter(f => f.state === "validated" || f.state === "transferred").map(f => f.id);
                bulkActionMutation.mutate({ action: "assign", fileIds: ids });
              }}
              disabled={isPending}
              data-testid="button-bulk-assign"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Assign ({selectedFiles.filter(f => f.state === "validated" || f.state === "transferred").length})
            </Button>
          )}
          {canStart && (
            <Button 
              size="sm" 
              onClick={() => {
                const ids = selectedFiles.filter(f => f.state === "colorist_assigned").map(f => f.id);
                bulkActionMutation.mutate({ action: "start", fileIds: ids });
              }}
              disabled={isPending}
              data-testid="button-bulk-start"
            >
              <Play className="mr-2 h-4 w-4" />
              Start Work ({selectedFiles.filter(f => f.state === "colorist_assigned").length})
            </Button>
          )}
          {canDeliver && (
            <Button 
              size="sm" 
              onClick={() => {
                const ids = selectedFiles.filter(f => f.state === "in_progress").map(f => f.id);
                bulkActionMutation.mutate({ action: "deliver", fileIds: ids });
              }}
              disabled={isPending}
              data-testid="button-bulk-deliver"
            >
              <Upload className="mr-2 h-4 w-4" />
              Deliver ({selectedFiles.filter(f => f.state === "in_progress").length})
            </Button>
          )}
          {canDelete && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                if (confirm("Are you sure you want to delete the selected files? Only unlocked files will be deleted.")) {
                  const ids = selectedFiles.filter(f => f.state === "detected").map(f => f.id);
                  bulkDeleteMutation.mutate(ids);
                }
              }}
              disabled={isPending}
              data-testid="button-bulk-delete"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete ({selectedFiles.filter(f => f.state === "detected").length})
            </Button>
          )}
          {canReject && (
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => {
                if (confirm("Are you sure you want to reject the selected files?")) {
                  const ids = selectedFiles.filter(f => !["delivered_to_mam", "archived", "rejected"].includes(f.state)).map(f => f.id);
                  bulkActionMutation.mutate({ action: "reject", fileIds: ids });
                }
              }}
              disabled={isPending}
              data-testid="button-bulk-reject"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject ({selectedFiles.filter(f => !["delivered_to_mam", "archived", "rejected"].includes(f.state)).length})
            </Button>
          )}
        </div>
      )}

      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-300px)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox 
                    checked={files && files.length > 0 && selectedIds.size === files.length}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead className="w-[300px]">Filename</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <FileRowSkeleton key={i} />)
              ) : files && files.length > 0 ? (
                files.map((file) => (
                  <TableRow 
                    key={file.id} 
                    className={`hover-elevate cursor-pointer ${selectedIds.has(file.id) ? "bg-muted/50" : ""}`}
                    data-testid={`row-file-${file.id}`}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox 
                        checked={selectedIds.has(file.id)}
                        onCheckedChange={() => toggleSelect(file.id)}
                        data-testid={`checkbox-file-${file.id}`}
                      />
                    </TableCell>
                    <TableCell 
                      className="font-medium"
                      onClick={() => onFileSelect?.(file)}
                    >
                      <div className="flex flex-col">
                        <span className="truncate max-w-[280px]" title={file.filename}>
                          {file.filename}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {file.sourcePath}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell onClick={() => onFileSelect?.(file)}>
                      <SiteBadge site={file.sourceSite} />
                    </TableCell>
                    <TableCell onClick={() => onFileSelect?.(file)}>
                      <StatusBadge state={file.state} />
                    </TableCell>
                    <TableCell 
                      className="text-muted-foreground"
                      onClick={() => onFileSelect?.(file)}
                    >
                      {formatFileSize(file.fileSize)}
                    </TableCell>
                    <TableCell 
                      className="text-muted-foreground text-sm"
                      onClick={() => onFileSelect?.(file)}
                    >
                      {file.detectedAt ? formatDistanceToNow(new Date(file.detectedAt), { addSuffix: true }) : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" data-testid={`button-file-actions-${file.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onFileSelect?.(file)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {file.state === "detected" && (
                            <DropdownMenuItem onClick={() => bulkActionMutation.mutate({ action: "validate", fileIds: [file.id] })}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Validate
                            </DropdownMenuItem>
                          )}
                          {(file.state === "validated" || file.state === "transferred") && (
                            <DropdownMenuItem onClick={() => bulkActionMutation.mutate({ action: "assign", fileIds: [file.id] })}>
                              <UserPlus className="mr-2 h-4 w-4" />
                              Assign
                            </DropdownMenuItem>
                          )}
                          {file.state === "colorist_assigned" && (
                            <DropdownMenuItem onClick={() => bulkActionMutation.mutate({ action: "start", fileIds: [file.id] })}>
                              <Play className="mr-2 h-4 w-4" />
                              Start Working
                            </DropdownMenuItem>
                          )}
                          {file.state === "in_progress" && (
                            <DropdownMenuItem onClick={() => bulkActionMutation.mutate({ action: "deliver", fileIds: [file.id] })}>
                              <Upload className="mr-2 h-4 w-4" />
                              Deliver to MAM
                            </DropdownMenuItem>
                          )}
                          {!["delivered_to_mam", "archived", "rejected"].includes(file.state) && (
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => bulkActionMutation.mutate({ action: "reject", fileIds: [file.id] })}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Reject
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No files in queue
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
