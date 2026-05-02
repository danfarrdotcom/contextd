import { Hono } from 'hono';
import { Env } from './types';

const app = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();

app.get('/', (c) => c.json({ name: 'contextd API', version: '1' }));

export default app;
