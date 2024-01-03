import { D1Database } from '@cloudflare/workers-types'
import { Hono } from 'hono'
import { createMiddleware } from "hono/factory"
import { handle } from 'hono/vercel'
import { drizzle } from 'drizzle-orm/d1'
import {events, receivedLogs, users} from '@/schema'
import {and, eq} from "drizzle-orm";
import {string, object, minLength, maxLength, parse, ValiError, email} from 'valibot'
import jwt, {JwtPayload} from '@tsndr/cloudflare-worker-jwt'
import * as crypt from "@/lib/crypt";

export const runtime = 'edge';

type Bindings = {
  DB: D1Database,
  JWT_SECRET: string,
  PASSWORD_SALT: string,
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api')

const jwtAlgorithm = 'HS512'

const unauthorizedPaths = [
  '/api/sign_up',
  '/api/sign_in',
]
/**
 * Authorization ヘッダーに JWT トークンがあるかどうかをチェックする
 */
const authorizationMiddleware = createMiddleware(async (c, next) => {
  console.log(`[authorizationMiddleware] path=${c.req.path}`)

  // unauthorizedPathsに含まれる場合は認証チェックをしない
  if (unauthorizedPaths.includes(c.req.path)) {
    return await next()
  }


  // リクエストヘッダーの値を取得
  const headers = c.req.header()

  // Authorization ヘッダーの値を取得
  const authorization = headers['authorization']

  // Authorization ヘッダーがない場合はエラー
  if (!authorization) {
    console.log(`[authorizationMiddleware] Authorization header is not found`)
    return c.json({message: 'Unauthorized'}, 401)
  }

  // Authorization ヘッダーの値が `Bearer <token>` でない場合はエラー
  const token = authorization.split(' ')[1]
  console.log(`[authorizationMiddleware] token=${token}`)
  if (!token) {
    console.log(`[authorizationMiddleware] Authorization header is invalid`)
    return c.json({message: 'Unauthorized'}, 401)
  }

  // JWTトークンを復号化する
  try {
    // JWTトークンを検証する
    if (!await jwt.verify(token, process.env.JWT_SECRET as string, jwtAlgorithm)) {
      console.log(`[authorizationMiddleware] JWT token is invalid`)
      return c.json({message: 'Unauthorized'}, 401)
    }

    const data = await jwt.decode(token)
    console.log(`[authorizationMiddleware] data=${JSON.stringify(data)}`)
    const userId = data.payload['userId']

    // ユーザーが存在しない場合はエラー
    const db = drizzle(process.env.DB as unknown as D1Database)
    const result = await db.select().from(users).where(
      and(
        eq(users.enabled, true),
        eq(users.id, userId),
      )
    ).limit(1).all()

    if (result.length === 0) {
      console.log(`[authorizationMiddleware] User is not found`)
      return c.json({message: 'Unauthorized'}, 401)
    }

    // ユーザー情報をコンテキストにセットする
    c.set('currentUser', result[0])

    return await next()
  } catch (e) {
    console.error(e)
    return c.json({message: 'Unauthorized'}, 401)
  }
})
app.use('*', authorizationMiddleware)

/**
 * JWTトークンを生成する
 * @param user
 */
const signJwtTokenForUser = async (user: typeof users.$inferSelect) => {
  const payload: JwtPayload = {
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30日間有効
    userId: user.id,
  }
  const secret = process.env.JWT_SECRET as string
  return await jwt.sign(payload, secret, jwtAlgorithm)
}

/**
 * パスワードを暗号化する
 * @param password
 */
const encryptPassword = async (password: string) => {
  return await crypt.encrypt(password, process.env.PASSWORD_SALT as string)
}

const verifyPassword = async (password: string, encryptedPassword: string) => {
  return await crypt.verify(password, encryptedPassword, process.env.PASSWORD_SALT as string)
}

app.post('/sign_up', async (c) => {
  const params = await c.req.json<{
    name: string,
    email: string,
    password: string,
  }>()

  // validation
  try {
    const v = object({
      name: string([minLength(1), maxLength(100)]),
      email: string([email(), maxLength(255)]),
      password: string([maxLength(64)]),
    })
    parse(v, params)
  } catch (e: ValiError) {
    return c.json({message: 'Unauthorized'}, 401)
  }

  const db = drizzle(process.env.DB as unknown as D1Database)
  const result = await db.insert(users).values({
    name: params.name,
    email: params.email,
    encrypted_password: await encryptPassword(params.password),
    enabled: true,
    created_at: new Date(),
    updated_at: new Date(),
  }).execute()
  console.log(`[sign_up] result=${JSON.stringify(result)}`)
  const lastInsertId = result.meta.last_row_id

  const user = await db.select().from(users).where(
    and(
      eq(users.enabled, true),
      eq(users.id, lastInsertId),
    )
  ).limit(1).all()

  // 成功した場合は JWT トークンとユーザー情報を返す
  const token = await signJwtTokenForUser(user[0])
  console.log(`[sign_up] token=${token}`)
  return c.json({
    token: token,
    user: user[0],
  })
})

app.post('/sign_in', async (c) => {
  const params = await c.req.json<{
    email: string,
    password: string,
  }>()

  // validation
  try {
    const v = object({
      email: string([email(), maxLength(255)]),
      password: string([maxLength(255)]),
    })
    parse(v, params)
  } catch (e: ValiError) {
    return c.json({message: 'Unauthorized'}, 401)
  }

  const db = drizzle(process.env.DB as unknown as D1Database)
  const result = await db.select().from(users).where(
      and(
        eq(users.enabled, true),
        eq(users.email, params.email),
      )
    ).limit(1).all()

  if (result.length === 0) {
    return c.json({message: 'Unauthorized'}, 401)
  }

  const user = result[0]

  // パスワードが一致しない場合はエラー
  if (!await verifyPassword(params.password, user.encrypted_password)) {
    return c.json({message: 'Unauthorized'}, 401)
  }

  // 成功した場合は JWT トークンとユーザー情報を返す
  const token = await signJwtTokenForUser(user)
  return c.json({
    token: token,
    user: user,
  })
})

app.get('/events', async (c) => {
  const db = drizzle(process.env.DB as unknown as D1Database)
  const result = await db.select().from(events).where(
    eq(events.user_id, c.get('currentUser').id)
  ).all()
  return c.json(result)
})

app.post('/events', async (c) => {
  const params = await c.req.json<typeof events.$inferInsert>()

  // validation
  try {
    const v = object({
      name: string([minLength(1), maxLength(100)]),
      description: string([maxLength(255)]),
    })
    parse(v, params)
  } catch (e: ValiError) {
    return c.json({ error: e }, 400)
  }

  const db = drizzle(process.env.DB as unknown as D1Database)
  const result = await db.insert(events).values({
    user_id: c.get('currentUser').id,
    name: params.name,
    description: params.description,
    created_at: new Date(),
    updated_at: new Date(),
  }).execute()
  return c.json(result)
})

app.put('/events/:id', async (c) => {
  const params = await c.req.json<typeof events.$inferSelect>();

  // validation
  try {
    const v = object({
      name: string([minLength(1), maxLength(100)]),
      description: string([maxLength(255)]),
    })
    parse(v, params)
  } catch (e: ValiError) {
    return c.json({ error: e }, 400)
  }

  const db = drizzle(process.env.DB as unknown as D1Database)
  const result = await db.update(events).set({
    name: params.name,
    description: params.description,
    updated_at: new Date(),
  }).where(eq(events.id, parseInt(c.req.param('id')))).execute()
  return c.json(result)
})

app.get('/received_logs', async (c) => {
  const db = drizzle(process.env.DB as unknown as D1Database)
  const result = await db.select().from(receivedLogs).all()
  return c.json(result)
})

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
