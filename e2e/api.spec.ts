import { test, expect } from '@playwright/test';

test.describe('api', () => {
  test('version and engines', async ({ request }) => {
    const version = await request.get('/api/version');
    expect(version.ok()).toBeTruthy();
    expect((await version.json()).version).toMatch(/\d+\.\d+\.\d+/);

    const engines = await request.get('/api/engines');
    expect(engines.ok()).toBeTruthy();
    const body = await engines.json();
    expect(body.engines.map((e: { id: string }) => e.id)).toEqual(
      expect.arrayContaining(['llamacpp', 'ollama', 'lmstudio', 'openai', 'vllm']),
    );
  });

  test('chat and agent require a running engine', async ({ request }) => {
    const chat = await request.post('/api/chat', {
      data: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(chat.status()).toBe(503);

    const agent = await request.post('/api/agent/run', { data: { input: 'hi' } });
    expect(agent.status()).toBe(503);

    const rag = await request.post('/api/agent/rag-chat', { data: { input: 'hi' } });
    expect(rag.status()).toBe(503);
  });

  test('chat input validation', async ({ request }) => {
    const empty = await request.post('/api/chat', { data: { messages: [] } });
    // Engine gate fires first (503); with an engine up this would be 400.
    expect([400, 503]).toContain(empty.status());
  });

  test('prompts library', async ({ request }) => {
    const list = await request.get('/api/prompts');
    expect(list.ok()).toBeTruthy();
    const names = ((await list.json()).prompts as Array<{ name: string }>).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['rag-qa', 'summarize']));

    const one = await request.get('/api/prompts/rag-qa');
    expect(one.ok()).toBeTruthy();
    expect((await one.json()).template).toContain('{{context}}');

    const missing = await request.get('/api/prompts/nope/../evil');
    expect(missing.status()).toBe(404);
  });

  test('model download validation rejects bad requests', async ({ request }) => {
    const bad = await request.post('/api/models/download', {
      data: { repo: 'bad', file: 'x.exe' },
    });
    expect(bad.status()).toBe(400);

    const traversal = await request.post('/api/models/download', {
      data: { repo: 'o/m', file: '../evil.gguf' },
    });
    expect(traversal.status()).toBe(400);

    const list = await request.get('/api/models/download');
    expect(list.ok()).toBeTruthy();
  });

  test('tool execution fails honestly for unconfigured stubs', async ({ request }) => {
    const res = await request.post('/api/plugins/tools/execute', {
      data: { tool: 'image-generation:generate_image', params: { prompt: 'a cat' } },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  test('scanner and metadata endpoints respond', async ({ request }) => {
    expect((await request.get('/api/scanner/sources')).ok()).toBeTruthy();
    expect((await request.get('/api/metadata')).ok()).toBeTruthy();
    expect((await request.get('/api/queue')).ok()).toBeTruthy();
  });

  test('metrics endpoint reports a summary shape', async ({ request }) => {
    // Generate one failure event, then check the aggregate.
    await request.post('/api/plugins/tools/execute', {
      data: { tool: 'nope:missing', params: {} },
    });
    const res = await request.get('/api/metrics');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.uptimeMs).toBe('number');
    expect(typeof body.total).toBe('number');
    expect(body.kinds.tool.count).toBeGreaterThan(0);
  });

  test('update check never fails hard', async ({ request }) => {
    const res = await request.get('/api/update');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.current).toBe('string');
    expect(typeof body.updateAvailable).toBe('boolean');
  });

  test('eval A/B compares retrieval modes', async ({ request }) => {
    const res = await request.post('/api/eval/ab', {
      data: { modeA: 'hybrid', modeB: 'keyword', provider: 'hash' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.caseCount ?? body.a.caseCount).toBeGreaterThan(0);
    expect(['a', 'b', 'tie']).toContain(body.winner);
  });
});
