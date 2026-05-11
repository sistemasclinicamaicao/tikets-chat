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
