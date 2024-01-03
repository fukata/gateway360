import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id", { mode: "number" })
    .primaryKey({ autoIncrement: true })
    .notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  encrypted_password: text("encrypted_password").notNull(),
  enabled: integer("enabled", {mode: "boolean"}).notNull().default(true),
  created_at: integer("created_at", {mode: "timestamp_ms"}).notNull(),
  updated_at: integer("updated_at", {mode: "timestamp_ms"}).notNull(),
})

export const events = sqliteTable("events", {
  id: integer("id", { mode: "number" })
    .primaryKey({ autoIncrement: true })
    .notNull(),
  user_id: integer("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  created_at: integer("created_at", {mode: "timestamp_ms"}).notNull(),
  updated_at: integer("updated_at", {mode: "timestamp_ms"}).notNull(),
})

export const eventAccessSecrets = sqliteTable("event_access_secrets", {
  id: integer("id", { mode: "number" })
    .primaryKey({ autoIncrement: true })
    .notNull(),
  event_id: integer("event_id").notNull(),
  name: text("name").notNull(),
  access_secret: text("access_secret").notNull(),
  enabled: integer("enabled", {mode: "boolean"}).notNull().default(true),
  last_used_at: integer("last_used_at", {mode: "timestamp_ms"}),
  created_at: integer("created_at", {mode: "timestamp_ms"}).notNull(),
  updated_at: integer("updated_at", {mode: "timestamp_ms"}).notNull(),
})

export const receivedLogs = sqliteTable("received_logs", {
  id: integer("id", { mode: "number" })
    .primaryKey({ autoIncrement: true })
    .notNull(),
  event_id: integer("event_id").notNull(),
  source_ip: text("source_ip").notNull(),
  payload: text("payload").notNull(),
  received_at: integer("received_at", {mode: "timestamp_ms"}).notNull(),
  fired_at: integer("fired_at", {mode: "timestamp_ms"}),
  created_at: integer("created_at", {mode: "timestamp_ms"}).notNull(),
  updated_at: integer("updated_at", {mode: "timestamp_ms"}).notNull(),
})