import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User
} from "lucide-react";
import type { File } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type SortField = "filename" | "sourceSite" | "state" | "fileSize" | "detectedAt" | "assignedTo";
type SortDirection = "asc" | "desc";

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
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
    </TableRow>
  );
}

function SortableHeader({ 
  field, 
  currentField, 
  direction, 
  onClick, 
  children 
}: { 
  field: SortField; 
  currentField: SortField | null; 
  direction: SortDirection; 
  onClick: (field: SortField) => void; 
  children: React.ReactNode;
}) {
  const isActive = currentField === field;
  return (
    <Button 
      variant="ghost" 
      size="sm" 
      className="-ml-3 h-8 hover:bg-transparent"
      onClick={() => onClick(field)}
    >
      {children}
      {isActive ? (
        direction === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
      ) : (
        <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
      )}
    </Button>
  );
}

interface FileListProps {
  onFileSelect?: (file: File) => void;
  stateFilter?: string;
  siteFilter?: string;
  searchQuery?: string;
}

export function FileList({ onFileSelect, stateFilter = "all", siteFilter = "all", searchQuery = "" }: FileListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const { toast } = useToast();
  
  const { data: rawFiles, isLoading, error } = useQuery<File[]>({
    queryKey: ["/api/files"],
    refetchInterval: 5000,
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredFiles = rawFiles?.filter(file => {
    if (stateFilter !== "all" && file.state !== stateFilter) return false;
    if (siteFilter !== "all" && file.sourceSite !== siteFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesFilename = file.filename.toLowerCase().includes(query);
      const matchesPath = file.sourcePath?.toLowerCase().includes(query);
      if (!matchesFilename && !matchesPath) return false;
    }
    return true;
  });

  const files = filteredFiles?.slice().sort((a, b) => {
    if (!sortField) return 0;
    
    let aVal: string | number | null = null;
    let bVal: string | number | null = null;
    
    switch (sortField) {
      case "filename":
        aVal = a.filename.toLowerCase();
        bVal = b.filename.toLowerCase();
        break;
      case "sourceSite":
        aVal = a.sourceSite?.toLowerCase() || "";
        bVal = b.sourceSite?.toLowerCase() || "";
        break;
      case "state":
        aVal = a.state;
        bVal = b.state;
        break;
      case "fileSize":
        aVal = a.fileSize;
        bVal = b.fileSize;
        break;
      case "detectedAt":
        aVal = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
        bVal = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
        break;
      case "assignedTo":
        aVal = a.assignedTo?.toLowerCase() || "";
        bVal = b.assignedTo?.toLowerCase() || "";
        break;
    }
    
    if (aVal === null || bVal === null) return 0;
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
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
                <TableHead className="w-[250px]">
                  <SortableHeader field="filename" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Filename
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="sourceSite" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Site
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="state" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Status
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="assignedTo" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Assigned To
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="fileSize" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Size
                  </SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="detectedAt" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Detected
                  </SortableHeader>
                </TableHead>
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
                      <div className="flex items-center gap-1">
                        <StatusBadge state={file.state} />
                        {file.cleanedUp && (
                          <Badge variant="outline" className="text-xs border-green-500 text-green-600 dark:text-green-400">
                            Cleaned
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell 
                      className="text-sm"
                      onClick={() => onFileSelect?.(file)}
                    >
                      {file.assignedTo ? (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{file.assignedTo}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
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
