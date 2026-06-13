import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearSession,
  getActiveSession,
  upsertSession,
} from '../../src/bot/session-repo.js';

const PHONE = `+5491100000${Math.floor(100 + Math.random() * 899)}`;

beforeAll(async () => {
  await clearSession(PHONE);
});

afterAll(async () => {
  await clearSession(PHONE);
});

describe('bot session repo', () => {
  it('returns null when no session exists', async () => {
    expect(await getActiveSession(PHONE)).toBeNull();
  });

  it('upserts + retrieves session state', async () => {
    await upsertSession(PHONE, {
      step: 'pick_consorcio',
      pendingText: 'agua',
      options: [{ consorcioId: 'c1', unidadId: 'u1', nombre: 'A' }],
    });
    const got = await getActiveSession(PHONE);
    expect(got?.state.step).toBe('pick_consorcio');
    expect(got?.state.pendingText).toBe('agua');
    expect(got?.state.options).toHaveLength(1);
  });

  it('replaces state on second upsert', async () => {
    await upsertSession(PHONE, { step: 'pick_consorcio', pendingText: 'luz', options: [] });
    const got = await getActiveSession(PHONE);
    expect(got?.state.pendingText).toBe('luz');
    expect(got?.state.options).toEqual([]);
  });

  it('clearSession drops the row', async () => {
    await upsertSession(PHONE, { step: 'pick_consorcio' });
    await clearSession(PHONE);
    expect(await getActiveSession(PHONE)).toBeNull();
  });
});
