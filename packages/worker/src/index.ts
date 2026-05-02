import { Hono } from 'hono';
import { Env } from './types';
import { authMiddleware } from './middleware/auth';
import { orgsRouter } from './routes/orgs';
import { collectionsRouter } from './routes/collections';
import { contextsRouter } from './routes/contexts';

const app = new Hono<{ Bindings: Env; Variables: { orgId: string } }>();

// Auth required for all /orgs write routes (POST /orgs is public bootstrap)
app.use('/v1/orgs/:org/*', authMiddleware);

app.route('/v1', orgsRouter);
app.route('/v1', collectionsRouter);
app.route('/v1', contextsRouter);

app.get('/', (c) => c.json({ name: 'contextd API', version: '1' }));

export default app;
