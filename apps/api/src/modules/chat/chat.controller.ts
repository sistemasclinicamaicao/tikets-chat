import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post('groups')
  async createGroup(@CurrentUser() user: { userId: string }, @Body() dto: CreateGroupDto) {
    const channel = await this.chatService.createGroup(user.userId, dto.name, dto.member_user_ids ?? []);
    const memberIds = [
      user.userId,
      ...(dto.member_user_ids ?? []).filter((id) => typeof id === 'string' && id.length > 0),
    ];
    this.chatGateway.ensureSocketsInRoom(channel.id, [...new Set(memberIds)]);
    return channel;
  }

  @Get('channels/:channelId/members')
  listMembers(@Param('channelId') channelId: string, @CurrentUser() user: { userId: string }) {
    return this.chatService.listGroupMembers(user.userId, channelId);
  }

  @Post('channels/:channelId/members')
  async addMember(
    @Param('channelId') channelId: string,
    @Body() dto: AddGroupMemberDto,
    @CurrentUser() user: { userId: string },
  ) {
    await this.chatService.addMemberToGroup(user.userId, channelId, dto.user_id);
    this.chatGateway.ensureSocketsInRoom(channelId, [dto.user_id]);
    return { ok: true };
  }

  @Delete('channels/:channelId/members/:targetUserId')
  async removeMember(
    @Param('channelId') channelId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser() user: { userId: string },
  ) {
    await this.chatService.removeMemberFromGroup(user.userId, channelId, targetUserId);
    return { ok: true };
  }

  @Post('channels/:channelId/leave')
  async leaveGroup(@Param('channelId') channelId: string, @CurrentUser() user: { userId: string }) {
    await this.chatService.leaveGroup(user.userId, channelId);
    return { ok: true };
  }

  @Get('channels')
  getChannels(@CurrentUser() user: { userId: string }) {
    return this.chatService.getChannels(user.userId);
  }

  @Get('users')
  getUsers(@CurrentUser() user: { userId: string }) {
    return this.chatService.listUsers(user.userId);
  }

  @Get('presence')
  getPresence(@CurrentUser() user: { userId: string }) {
    return this.chatService.getPresenceForUser(user.userId);
  }

  @Get('attachments/:attachmentId/download-url')
  getAttachmentDownloadUrl(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.chatService.getAttachmentDownloadUrl(user.userId, attachmentId);
  }

  @Post('dm/:userId')
  async createDm(@CurrentUser() me: { userId: string }, @Param('userId') otherUserId: string) {
    const channel = await this.chatService.getOrCreateDm(me.userId, otherUserId);
    this.chatGateway.ensureSocketsInRoom(channel.id, [me.userId, otherUserId]);
    return channel;
  }

  @Get('channels/:channelId/messages')
  getMessages(
    @Param('channelId') channelId: string,
    @CurrentUser() user: { userId: string },
    @Query('limit') limitStr?: string,
    @Query('before') before?: string,
  ) {
    const parsed = limitStr ? parseInt(limitStr, 10) : NaN;
    return this.chatService.getMessages(user.userId, channelId, {
      limit: Number.isFinite(parsed) ? parsed : undefined,
      before: before?.trim() || undefined,
    });
  }

  @Post('channels/:channelId/messages')
  async sendMessage(
    @Param('channelId') channelId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: { userId: string },
  ) {
    if (dto.message_type === 'nudge') {
      const message = await this.chatService.sendMessage(channelId, user.userId, '', { messageType: 'nudge' });
      this.chatGateway.broadcastChannelMessage(channelId, message);
      return message;
    }
    const trimmed = (dto.body ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('Message body required');
    }
    const message = await this.chatService.sendMessage(channelId, user.userId, trimmed);
    this.chatGateway.broadcastChannelMessage(channelId, message);
    return message;
  }

  @Post('channels/:channelId/messages/with-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async sendMessageWithFile(
    @Param('channelId') channelId: string,
    @CurrentUser() user: { userId: string },
    @Body('body') body: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const message = await this.chatService.sendMessageWithOptionalFile(
      channelId,
      user.userId,
      body ?? '',
      file
        ? {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          }
        : undefined,
    );
    this.chatGateway.broadcastChannelMessage(channelId, message);
    return message;
  }

  @Post('channels/:channelId/read')
  markRead(@CurrentUser() user: { userId: string }, @Param('channelId') channelId: string) {
    return this.chatService.markRead(user.userId, channelId);
  }

  /** Igual que DELETE channels/:channelId; POST evita proxies/firewalls que bloquean DELETE. */
  @Post('channels/:channelId/hide')
  hideConversationPost(@Param('channelId') channelId: string, @CurrentUser() user: { userId: string }) {
    return this.chatService.hideConversationForUser(user.userId, channelId);
  }

  @Post('tickets/:ticketId/channel')
  ensureTicketChannel(@Param('ticketId') ticketId: string, @CurrentUser() user: { userId: string }) {
    return this.chatService.ensureTicketChannel(user.userId, ticketId);
  }

  /** Oculta la conversación para el usuario actual; no borra mensajes (auditoría). */
  @Delete('channels/:channelId')
  hideConversation(@Param('channelId') channelId: string, @CurrentUser() user: { userId: string }) {
    return this.chatService.hideConversationForUser(user.userId, channelId);
  }
}
