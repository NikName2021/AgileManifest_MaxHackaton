import { describe, expect, it, vi } from 'vitest';
import { listApplicationsQuerySchema, updateApplicationStatusSchema } from '../src/validation.js';

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn(), sendMessage: vi.fn() }));
vi.mock('../src/db.js', () => ({ db: { application: { updateMany: mocks.updateMany, findUnique: mocks.findUnique } } }));
vi.mock('../src/max/client.js', () => ({ maxApi: { sendMessage: mocks.sendMessage } }));
vi.mock('../src/application/timeline.js', () => ({ markViewed: vi.fn(), recordEvents: vi.fn() }));
vi.mock('../src/channels/service.js', () => ({ knownChannelId: vi.fn() }));

import { applyStatusChange, handleStatusChangeFromChat } from '../src/application/service.js';

describe('new application status is creation-only', () => {
  it('rejects new in PATCH while retaining the new filter', () => {
    expect(updateApplicationStatusSchema.safeParse({ status: 'new' }).success).toBe(false);
    expect(listApplicationsQuerySchema.safeParse({ status: 'new' }).success).toBe(true);
  });
  it.each(['contacted', 'invited', 'hired', 'rejected'])('allows changing to %s', status => {
    expect(updateApplicationStatusSchema.safeParse({ status }).success).toBe(true);
  });
  it('rejects direct resets before any write or notification', async () => {
    await expect(applyStatusChange(1, 'new')).rejects.toThrow();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
  it('ignores a stale or forged chat reset callback', async () => {
    await handleStatusChangeFromChat('chat', 'employer', 1, 'new');
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
