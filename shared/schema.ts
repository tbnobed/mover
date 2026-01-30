import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, bigint, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const fileStateEnum = pgEnum("file_state", [
  "detected",
  "validated",
  "queued",
  "transferring",
  "transferred",
  "colorist_assigned",
  "in_progress",
  "delivered_to_mam",
  "archived",
  "rejected"
]);

export const siteEnum = pgEnum("site", ["tustin", "nashville", "dallas"]);

export const userRoleEnum = pgEnum("user_role", ["admin", "colorist", "engineer", "readonly"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  role: userRoleEnum("role").notNull().default("colorist"),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const sites = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: siteEnum("name").notNull().unique(),
  exportPath: text("export_path").notNull(),
  isActive: text("is_active").notNull().default("true"),
  lastHeartbeat: timestamp("last_heartbeat")
});

export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  sourceSite: siteEnum("source_site").notNull(),
  sourcePath: text("source_path").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  sha256Hash: text("sha256_hash").notNull(),
  state: fileStateEnum("state").notNull().default("detected"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  raysyncJobId: text("raysync_job_id"),
  transferProgress: integer("transfer_progress").default(0),
  errorMessage: text("error_message"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  validatedAt: timestamp("validated_at"),
  transferStartedAt: timestamp("transfer_started_at"),
  transferCompletedAt: timestamp("transfer_completed_at"),
  assignedAt: timestamp("assigned_at"),
  deliveredAt: timestamp("delivered_at"),
  archivedAt: timestamp("archived_at")
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").references(() => files.id).notNull(),
  action: text("action").notNull(),
  previousState: fileStateEnum("previous_state"),
  newState: fileStateEnum("new_state"),
  performedBy: varchar("performed_by").references(() => users.id),
  ipAddress: text("ip_address"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const transferJobs = pgTable("transfer_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").references(() => files.id).notNull(),
  raysyncJobId: text("raysync_job_id"),
  status: text("status").notNull().default("pending"),
  bytesTransferred: bigint("bytes_transferred", { mode: "number" }).default(0),
  retryCount: integer("retry_count").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, passwordHash: true });
export const insertSiteSchema = createInsertSchema(sites).omit({ id: true });
export const insertFileSchema = createInsertSchema(files).omit({ id: true, detectedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertTransferJobSchema = createInsertSchema(transferJobs).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof files.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertTransferJob = z.infer<typeof insertTransferJobSchema>;
export type TransferJob = typeof transferJobs.$inferSelect;

export type FileState = "detected" | "validated" | "queued" | "transferring" | "transferred" | "colorist_assigned" | "in_progress" | "delivered_to_mam" | "archived" | "rejected";
export type SiteName = "tustin" | "nashville" | "dallas";
export type UserRole = "admin" | "colorist" | "engineer" | "readonly";
