import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { StorageService } from '../storage/storage.service';

describe('ChatService', () => {
  const storageMock = {
    putObject: jest.fn(),
    getSignedGetUrl: jest.fn(),
  } as unknown as StorageService;

  it('ensureTicketChannel throws NotFoundException when ticket is not found for user', async () => {
    const prisma = {
      ticket: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new ChatService(prisma, storageMock);
    await expect(service.ensureTicketChannel('user-1', 'ticket-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getPresenceForUsers returns empty lists when nobody is online', async () => {
    const prisma = { $queryRaw: jest.fn() } as any;
    const service = new ChatService(prisma, storageMock);
    const map = await service.getPresenceForUsers(['u1', 'u2']);
    expect(map.get('u1')).toEqual([]);
    expect(map.get('u2')).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('getMessages throws ForbiddenException when user is not a channel member', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([]),
      chatMessage: { findMany: jest.fn() },
    } as any;
    const service = new ChatService(prisma, storageMock);
    await expect(service.getMessages('user-1', 'channel-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
