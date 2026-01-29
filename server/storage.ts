import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
import { 
  users, files, auditLogs, sites, transferJobs,
  type InsertUser, type User,
  type InsertFile, type File,
  type InsertAuditLog, type AuditLog,
  type InsertSite, type Site,
  type InsertTransferJob, type TransferJob,
  type FileState
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  
  getFile(id: string): Promise<File | undefined>;
  getFiles(): Promise<File[]>;
  createFile(file: InsertFile): Promise<File>;
  updateFileState(id: string, state: FileState, updates?: Partial<File>): Promise<File | undefined>;
  assignFile(fileId: string, userId: string): Promise<File | undefined>;
  
  getSite(id: string): Promise<Site | undefined>;
  getSites(): Promise<Site[]>;
  createSite(site: InsertSite): Promise<Site>;
  updateSiteHeartbeat(id: string): Promise<Site | undefined>;
  
  getAuditLogs(): Promise<AuditLog[]>;
  getAuditLogsForFile(fileId: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  getTransferJobs(): Promise<TransferJob[]>;
  getTransferJob(id: string): Promise<TransferJob | undefined>;
  createTransferJob(job: InsertTransferJob): Promise<TransferJob>;
  updateTransferJob(id: string, updates: Partial<TransferJob>): Promise<TransferJob | undefined>;
  
  getStats(): Promise<{
    totalFiles: number;
    transferring: number;
    assigned: number;
    delivered: number;
    rejected: number;
    detected: number;
    validated: number;
    queued: number;
    transferred: number;
    inProgress: number;
    archived: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getFile(id: string): Promise<File | undefined> {
    const result = await db.select().from(files).where(eq(files.id, id));
    return result[0];
  }

  async getFiles(): Promise<File[]> {
    return db.select().from(files).orderBy(desc(files.detectedAt));
  }

  async createFile(file: InsertFile): Promise<File> {
    const result = await db.insert(files).values(file).returning();
    return result[0];
  }

  async updateFileState(id: string, state: FileState, updates?: Partial<File>): Promise<File | undefined> {
    const updateData: Partial<File> = { state, ...updates };
    
    if (state === "validated") updateData.validatedAt = new Date();
    if (state === "transferring") updateData.transferStartedAt = new Date();
    if (state === "transferred") updateData.transferCompletedAt = new Date();
    if (state === "colorist_assigned") updateData.assignedAt = new Date();
    if (state === "delivered_to_mam") updateData.deliveredAt = new Date();
    if (state === "archived") updateData.archivedAt = new Date();

    const result = await db.update(files).set(updateData).where(eq(files.id, id)).returning();
    return result[0];
  }

  async assignFile(fileId: string, userId: string): Promise<File | undefined> {
    const result = await db.update(files).set({
      state: "colorist_assigned",
      assignedTo: userId,
      assignedAt: new Date()
    }).where(eq(files.id, fileId)).returning();
    return result[0];
  }

  async getSite(id: string): Promise<Site | undefined> {
    const result = await db.select().from(sites).where(eq(sites.id, id));
    return result[0];
  }

  async getSites(): Promise<Site[]> {
    return db.select().from(sites);
  }

  async createSite(site: InsertSite): Promise<Site> {
    const result = await db.insert(sites).values(site).returning();
    return result[0];
  }

  async updateSiteHeartbeat(id: string): Promise<Site | undefined> {
    const result = await db.update(sites).set({
      lastHeartbeat: new Date()
    }).where(eq(sites.id, id)).returning();
    return result[0];
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  }

  async getAuditLogsForFile(fileId: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs)
      .where(eq(auditLogs.fileId, fileId))
      .orderBy(desc(auditLogs.createdAt));
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const result = await db.insert(auditLogs).values(log).returning();
    return result[0];
  }

  async getTransferJobs(): Promise<TransferJob[]> {
    return db.select().from(transferJobs).orderBy(desc(transferJobs.createdAt));
  }

  async getTransferJob(id: string): Promise<TransferJob | undefined> {
    const result = await db.select().from(transferJobs).where(eq(transferJobs.id, id));
    return result[0];
  }

  async createTransferJob(job: InsertTransferJob): Promise<TransferJob> {
    const result = await db.insert(transferJobs).values(job).returning();
    return result[0];
  }

  async updateTransferJob(id: string, updates: Partial<TransferJob>): Promise<TransferJob | undefined> {
    const result = await db.update(transferJobs).set(updates).where(eq(transferJobs.id, id)).returning();
    return result[0];
  }

  async getStats(): Promise<{
    totalFiles: number;
    transferring: number;
    assigned: number;
    delivered: number;
    rejected: number;
    detected: number;
    validated: number;
    queued: number;
    transferred: number;
    inProgress: number;
    archived: number;
  }> {
    const allFiles = await db.select().from(files);
    
    return {
      totalFiles: allFiles.length,
      detected: allFiles.filter(f => f.state === "detected").length,
      validated: allFiles.filter(f => f.state === "validated").length,
      queued: allFiles.filter(f => f.state === "queued").length,
      transferring: allFiles.filter(f => f.state === "transferring").length,
      transferred: allFiles.filter(f => f.state === "transferred").length,
      assigned: allFiles.filter(f => f.state === "colorist_assigned").length,
      inProgress: allFiles.filter(f => f.state === "in_progress").length,
      delivered: allFiles.filter(f => f.state === "delivered_to_mam").length,
      archived: allFiles.filter(f => f.state === "archived").length,
      rejected: allFiles.filter(f => f.state === "rejected").length,
    };
  }
}

export const storage = new DatabaseStorage();
