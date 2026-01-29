import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileList } from "@/components/file-list";
import { FileDetails } from "@/components/file-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, RefreshCw } from "lucide-react";
import type { File } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

export default function FilesPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { isRefetching, refetch } = useQuery<File[]>({
    queryKey: ["/api/files"],
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/files"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">File Queue</h1>
          <p className="text-muted-foreground">Manage files across all sites</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh} 
          disabled={isRefetching}
          data-testid="button-refresh-files"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-files"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-state-filter">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              <SelectItem value="detected">Detected</SelectItem>
              <SelectItem value="validated">Validated</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="transferring">Transferring</SelectItem>
              <SelectItem value="transferred">Transferred</SelectItem>
              <SelectItem value="colorist_assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="delivered_to_mam">Delivered</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-site-filter">
              <SelectValue placeholder="All Sites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              <SelectItem value="tustin">Tustin</SelectItem>
              <SelectItem value="nashville">Nashville</SelectItem>
              <SelectItem value="dallas">Dallas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={selectedFile ? "lg:col-span-2" : "lg:col-span-3"}>
          <FileList onFileSelect={setSelectedFile} />
        </div>
        {selectedFile && (
          <div>
            <FileDetails file={selectedFile} onClose={() => setSelectedFile(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
