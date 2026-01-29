import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFileSchema, insertUserSchema, type FileState } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/files", async (req, res) => {
    try {
      const files = await storage.getFiles();
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.get("/api/files/:id", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      res.json(file);
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  app.post("/api/files", async (req, res) => {
    try {
      const parsed = insertFileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      
      const file = await storage.createFile(parsed.data);
      
      await storage.createAuditLog({
        fileId: file.id,
        action: "File registered",
        newState: file.state,
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.status(201).json(file);
    } catch (error) {
      console.error("Error creating file:", error);
      res.status(500).json({ error: "Failed to create file" });
    }
  });

  app.post("/api/files/:id/assign", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.state !== "transferred") {
        return res.status(400).json({ error: "File cannot be assigned in current state" });
      }
      
      const userId = req.body?.userId;
      let assigneeId = userId;
      
      if (!userId) {
        const users = await storage.getUsers();
        const colorist = users.find(u => u.role === "colorist");
        if (!colorist) {
          return res.status(400).json({ error: "No colorist available for assignment" });
        }
        assigneeId = colorist.id;
      } else {
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(400).json({ error: "User not found" });
        }
      }
      
      const previousState = file.state;
      const updatedFile = await storage.assignFile(req.params.id, assigneeId);
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "File assigned",
        previousState: previousState,
        newState: "colorist_assigned",
        performedBy: assigneeId,
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json(updatedFile);
    } catch (error) {
      console.error("Error assigning file:", error);
      res.status(500).json({ error: "Failed to assign file" });
    }
  });

  app.post("/api/files/:id/validate", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.state !== "detected") {
        return res.status(400).json({ error: "File must be in detected state to validate" });
      }
      
      const previousState = file.state;
      const updatedFile = await storage.updateFileState(req.params.id, "validated");
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "File validated",
        previousState: previousState,
        newState: "validated",
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json(updatedFile);
    } catch (error) {
      console.error("Error validating file:", error);
      res.status(500).json({ error: "Failed to validate file" });
    }
  });

  app.post("/api/files/:id/queue", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.state !== "validated") {
        return res.status(400).json({ error: "File must be validated before queuing" });
      }
      
      const previousState = file.state;
      const updatedFile = await storage.updateFileState(req.params.id, "queued");
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "File queued for transfer",
        previousState: previousState,
        newState: "queued",
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json(updatedFile);
    } catch (error) {
      console.error("Error queuing file:", error);
      res.status(500).json({ error: "Failed to queue file" });
    }
  });

  app.post("/api/files/:id/start-transfer", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.state !== "queued") {
        return res.status(400).json({ error: "File must be queued before starting transfer" });
      }
      
      const transferJob = await storage.createTransferJob({
        fileId: req.params.id,
        raysyncJobId: req.body.raysyncJobId || `rs-job-${Date.now()}`,
        status: "in_progress",
        startedAt: new Date()
      });
      
      const previousState = file.state;
      const updatedFile = await storage.updateFileState(req.params.id, "transferring", {
        raysyncJobId: transferJob.raysyncJobId
      });
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "Transfer started",
        previousState: previousState,
        newState: "transferring",
        details: `RaySync job: ${transferJob.raysyncJobId}`,
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json({ file: updatedFile, transferJob });
    } catch (error) {
      console.error("Error starting transfer:", error);
      res.status(500).json({ error: "Failed to start transfer" });
    }
  });

  app.post("/api/files/:id/complete-transfer", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.state !== "transferring") {
        return res.status(400).json({ error: "File must be transferring to complete transfer" });
      }
      
      const previousState = file.state;
      const updatedFile = await storage.updateFileState(req.params.id, "transferred");
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "Transfer completed",
        previousState: previousState,
        newState: "transferred",
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json(updatedFile);
    } catch (error) {
      console.error("Error completing transfer:", error);
      res.status(500).json({ error: "Failed to complete transfer" });
    }
  });

  app.post("/api/files/:id/archive", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.state !== "delivered_to_mam") {
        return res.status(400).json({ error: "File must be delivered to MAM before archiving" });
      }
      
      const previousState = file.state;
      const updatedFile = await storage.updateFileState(req.params.id, "archived");
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "File archived",
        previousState: previousState,
        newState: "archived",
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json(updatedFile);
    } catch (error) {
      console.error("Error archiving file:", error);
      res.status(500).json({ error: "Failed to archive file" });
    }
  });

  app.post("/api/files/:id/start", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.state !== "colorist_assigned") {
        return res.status(400).json({ error: "File must be assigned before starting work" });
      }
      
      const previousState = file.state;
      const updatedFile = await storage.updateFileState(req.params.id, "in_progress");
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "Work started",
        previousState: previousState,
        newState: "in_progress",
        performedBy: file.assignedTo || undefined,
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json(updatedFile);
    } catch (error) {
      console.error("Error starting work:", error);
      res.status(500).json({ error: "Failed to start work" });
    }
  });

  app.post("/api/files/:id/deliver", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (file.state !== "in_progress") {
        return res.status(400).json({ error: "File must be in progress to deliver" });
      }
      
      const previousState = file.state;
      const updatedFile = await storage.updateFileState(req.params.id, "delivered_to_mam");
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "Delivered to MAM",
        previousState: previousState,
        newState: "delivered_to_mam",
        performedBy: file.assignedTo || undefined,
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json(updatedFile);
    } catch (error) {
      console.error("Error delivering file:", error);
      res.status(500).json({ error: "Failed to deliver file" });
    }
  });

  app.post("/api/files/:id/reject", async (req, res) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      const previousState = file.state;
      const updatedFile = await storage.updateFileState(req.params.id, "rejected", {
        errorMessage: req.body.reason || "Rejected by colorist"
      });
      
      await storage.createAuditLog({
        fileId: req.params.id,
        action: "File rejected",
        previousState: previousState,
        newState: "rejected",
        details: req.body.reason,
        performedBy: file.assignedTo || undefined,
        ipAddress: req.ip || req.socket.remoteAddress,
      });
      
      res.json(updatedFile);
    } catch (error) {
      console.error("Error rejecting file:", error);
      res.status(500).json({ error: "Failed to reject file" });
    }
  });

  app.get("/api/files/:id/audit", async (req, res) => {
    try {
      const logs = await storage.getAuditLogsForFile(req.params.id);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/sites", async (req, res) => {
    try {
      const sitesList = await storage.getSites();
      res.json(sitesList);
    } catch (error) {
      console.error("Error fetching sites:", error);
      res.status(500).json({ error: "Failed to fetch sites" });
    }
  });

  app.post("/api/sites/:id/heartbeat", async (req, res) => {
    try {
      const site = await storage.updateSiteHeartbeat(req.params.id);
      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }
      res.json(site);
    } catch (error) {
      console.error("Error updating heartbeat:", error);
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const usersList = await storage.getUsers();
      res.json(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      
      const existingUser = await storage.getUserByUsername(parsed.data.username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }
      
      const user = await storage.createUser(parsed.data);
      res.status(201).json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.get("/api/audit", async (req, res) => {
    try {
      const logs = await storage.getAuditLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/transfers", async (req, res) => {
    try {
      const transfers = await storage.getTransferJobs();
      res.json(transfers);
    } catch (error) {
      console.error("Error fetching transfers:", error);
      res.status(500).json({ error: "Failed to fetch transfers" });
    }
  });

  app.post("/api/seed", async (req, res) => {
    try {
      const existingSites = await storage.getSites();
      if (existingSites.length === 0) {
        await storage.createSite({
          name: "tustin",
          exportPath: "/mnt/tustin_exports/color_ready/",
          isActive: "true",
          lastHeartbeat: new Date()
        });
        await storage.createSite({
          name: "nashville",
          exportPath: "/mnt/nsh_exports/color_ready/",
          isActive: "true",
          lastHeartbeat: new Date(Date.now() - 2 * 60 * 1000)
        });
        await storage.createSite({
          name: "dallas",
          exportPath: "/mnt/dal_exports/color_ready/",
          isActive: "true",
          lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000)
        });
      }

      let existingUsers = await storage.getUsers();
      let coloristUser: { id: string } | undefined;
      
      if (existingUsers.length === 0) {
        coloristUser = await storage.createUser({
          username: "jsmith",
          displayName: "John Smith",
          role: "colorist",
          email: "jsmith@example.com"
        });
        await storage.createUser({
          username: "mwilliams",
          displayName: "Maria Williams",
          role: "colorist",
          email: "mwilliams@example.com"
        });
        await storage.createUser({
          username: "admin",
          displayName: "Admin User",
          role: "admin",
          email: "admin@example.com"
        });
      } else {
        coloristUser = existingUsers.find(u => u.role === "colorist");
      }

      const existingFiles = await storage.getFiles();
      if (existingFiles.length === 0) {
        const file1 = await storage.createFile({
          filename: "Episode_01_Final_v3.mov",
          sourceSite: "tustin",
          sourcePath: "/mnt/tustin_exports/color_ready/Episode_01_Final_v3.mov",
          fileSize: 15728640000,
          sha256Hash: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
          state: "transferred"
        });
        await storage.createAuditLog({
          fileId: file1.id,
          action: "File registered",
          newState: "detected"
        });
        await storage.createAuditLog({
          fileId: file1.id,
          action: "File validated",
          previousState: "detected",
          newState: "validated"
        });
        await storage.createAuditLog({
          fileId: file1.id,
          action: "Transfer completed",
          previousState: "transferring",
          newState: "transferred"
        });

        const file2 = await storage.createFile({
          filename: "Commercial_Spring_2024.mxf",
          sourceSite: "nashville",
          sourcePath: "/mnt/nsh_exports/color_ready/Commercial_Spring_2024.mxf",
          fileSize: 8589934592,
          sha256Hash: "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567a",
          state: "transferring",
          transferProgress: 45
        });
        await storage.createAuditLog({
          fileId: file2.id,
          action: "Transfer started",
          previousState: "queued",
          newState: "transferring"
        });

        const file3 = await storage.createFile({
          filename: "Documentary_Interview_v2.mov",
          sourceSite: "dallas",
          sourcePath: "/mnt/dal_exports/color_ready/Documentary_Interview_v2.mov",
          fileSize: 4294967296,
          sha256Hash: "c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567890",
          state: "colorist_assigned",
          assignedTo: coloristUser?.id
        });
        await storage.createAuditLog({
          fileId: file3.id,
          action: "File assigned",
          previousState: "transferred",
          newState: "colorist_assigned"
        });

        const file4 = await storage.createFile({
          filename: "Music_Video_Final.mov",
          sourceSite: "tustin",
          sourcePath: "/mnt/tustin_exports/color_ready/Music_Video_Final.mov",
          fileSize: 12884901888,
          sha256Hash: "d4e5f6789012345678901234567890abcdef1234567890abcdef123456789012",
          state: "in_progress",
          assignedTo: coloristUser?.id
        });
        await storage.createAuditLog({
          fileId: file4.id,
          action: "Work started",
          previousState: "colorist_assigned",
          newState: "in_progress"
        });

        const file5 = await storage.createFile({
          filename: "Promo_Cut_A.mov",
          sourceSite: "nashville",
          sourcePath: "/mnt/nsh_exports/color_ready/Promo_Cut_A.mov",
          fileSize: 2147483648,
          sha256Hash: "e5f6789012345678901234567890abcdef1234567890abcdef12345678901234",
          state: "delivered_to_mam"
        });
        await storage.createAuditLog({
          fileId: file5.id,
          action: "Delivered to MAM",
          previousState: "in_progress",
          newState: "delivered_to_mam"
        });

        await storage.createTransferJob({
          fileId: file1.id,
          raysyncJobId: "rs-job-001",
          status: "completed",
          bytesTransferred: 15728640000,
          startedAt: new Date(Date.now() - 30 * 60 * 1000),
          completedAt: new Date(Date.now() - 15 * 60 * 1000)
        });

        await storage.createTransferJob({
          fileId: file2.id,
          raysyncJobId: "rs-job-002",
          status: "in_progress",
          bytesTransferred: 3865470566,
          startedAt: new Date(Date.now() - 10 * 60 * 1000)
        });
      }

      res.json({ message: "Seed data created successfully" });
    } catch (error) {
      console.error("Error seeding data:", error);
      res.status(500).json({ error: "Failed to seed data" });
    }
  });

  return httpServer;
}
