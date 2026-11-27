import pg from 'pg'

const { Pool } = pg
let pool

export function isDatabaseConfigured() {
  return Boolean(String(process.env.DATABASE_URL || '').trim())
}

export function databaseUnavailableError() {
  const error = new Error('数据库未配置。请先在 server/.env 中设置 DATABASE_URL，并执行 pnpm db:migrate。')
  error.statusCode = 503
  return error
}

export function getDb() {
  if (!isDatabaseConfigured()) throw databaseUnavailableError()
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  }
  return pool
}

export async function query(text, values = []) {
  return getDb().query(text, values)
}

export async function withTransaction(callback) {
  const client = await getDb().connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function withUserContext(user, callback) {
  if (!user?.id || !user?.organization?.id) {
    const error = new Error('缺少服务端登录用户上下文。')
    error.statusCode = 401
    throw error
  }
  return withTransaction(async (client) => {
    await client.query(
      `SELECT
        set_config('app.user_id', $1, true),
        set_config('app.user_role', $2, true),
        set_config('app.organization_id', $3, true),
        set_config('app.campus_id', $4, true)`,
      [user.id, user.role || '', user.organization.id, user.campus?.id || ''],
    )
    return callback(client)
  })
}

export async function queryAsUser(user, text, values = []) {
  return withUserContext(user, (client) => client.query(text, values))
}

export async function closeDb() {
  if (pool) await pool.end()
  pool = undefined
}

/** 连接账号是超级用户或带 BYPASSRLS 时，数据库的行级权限（RLS）不生效：启动时提醒一次。代码里的权限判断不受影响。 */
export async function warnIfRowSecurityBypassed() {
  if (!isDatabaseConfigured()) return
  const row = (await query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0]
  if (row?.rolsuper || row?.rolbypassrls) {
    console.warn('[config] 数据库连接账号是超级用户（或能绕过行级权限）：数据库这一层的按人隔离不生效，只靠代码里的权限判断。正式环境建议给后端单独建一个普通数据库账号。')
  }
}
