import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, SiteBadge } from "@/components/status-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { MoreHorizontal, Eye, UserPlus, Play, Upload, XCircle } from "lucide-react";
import type { File } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

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
  const { data: files, isLoading, error } = useQuery<File[]>({
    queryKey: filter ? ["/api/files", filter] : ["/api/files"],
  });

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
        <CardTitle className="text-lg font-medium">File Queue</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-300px)]">
          <Table>
            <TableHeader>
              <TableRow>
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
                    className="hover-elevate cursor-pointer"
                    onClick={() => onFileSelect?.(file)}
                    data-testid={`row-file-${file.id}`}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className="truncate max-w-[280px]" title={file.filename}>
                          {file.filename}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {file.sourcePath}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <SiteBadge site={file.sourceSite} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge state={file.state} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatFileSize(file.fileSize)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
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
                          {file.state === "transferred" && (
                            <DropdownMenuItem>
                              <UserPlus className="mr-2 h-4 w-4" />
                              Assign to Me
                            </DropdownMenuItem>
                          )}
                          {file.state === "colorist_assigned" && (
                            <DropdownMenuItem>
                              <Play className="mr-2 h-4 w-4" />
                              Start Working
                            </DropdownMenuItem>
                          )}
                          {file.state === "in_progress" && (
                            <DropdownMenuItem>
                              <Upload className="mr-2 h-4 w-4" />
                              Deliver to MAM
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive">
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
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
