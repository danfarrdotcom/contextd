import { Context, Next } from 'hono';
import { Env } from '../types';

export async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `ctxd_${hex}`;
}

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { orgId: string } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const key = authHeader.slice(7);
  const keyHash = await hashKey(key);

  const row = await c.env.DB.prepare(
    'SELECT org_id FROM api_keys WHERE key_hash = ?'
  ).bind(keyHash).first<{ org_id: string }>();

  if (!row) {
    return c.json({ error: 'Invalid API key' }, 401);
  }

  c.set('orgId', row.org_id);
  await next();
}
