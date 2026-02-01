import { useState } from "react";
import { StatsCards } from "@/components/stats-cards";
import { FileList } from "@/components/file-list";
import { FileDetails } from "@/components/file-details";
import { SiteStatus } from "@/components/site-status";
import { RecentActivity } from "@/components/recent-activity";
import { UploadProgress } from "@/components/upload-progress";
import type { File } from "@shared/schema";

export default function Dashboard() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of the color routing system</p>
      </div>

      <StatsCards />
      
      <UploadProgress />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FileList onFileSelect={setSelectedFile} />
        </div>
        <div className="space-y-6">
          {selectedFile ? (
            <FileDetails file={selectedFile} onClose={() => setSelectedFile(null)} />
          ) : (
            <>
              <SiteStatus />
              <RecentActivity />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
