import { users } from '@/schema'

declare module 'hono' {
  interface ContextVariableMap {
    currentUser: typeof users.$inferSelect
  }
}