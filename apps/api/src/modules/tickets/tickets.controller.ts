import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AddCommentDto } from './dto/add-comment.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketFiltersDto } from './dto/ticket-filters.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';

function inlineContentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'file';
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, escape);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const MAX_TICKET_ATTACHMENT_BYTES = 8 * 1024 * 1024;

@ApiTags('tickets')
@ApiBearerAuth('access-token')
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('statuses')
  @ApiOperation({ summary: 'Catálogo de estados' })
  getStatuses() {
    return this.ticketsService.getStatuses();
  }

  @Get('priorities')
  @ApiOperation({ summary: 'Catálogo de prioridades' })
  getPriorities() {
    return this.ticketsService.getPriorities();
  }

  @Get('departments')
  @ApiOperation({ summary: 'Departamentos activos' })
  getDepartments() {
    return this.ticketsService.getDepartments();
  }

  @Get('my')
  @ApiOperation({ summary: 'Tickets del usuario actual (solicitante)' })
  getMyTickets(@CurrentUser() user: UserPayload) {
    return this.ticketsService.getMyTickets(user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listado paginado con filtros y control de acceso por rol' })
  findAll(@Query() filters: TicketFiltersDto, @CurrentUser() user: UserPayload) {
    return this.ticketsService.findAll(filters, user);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Línea de tiempo (eventos + comentarios visibles)' })
  getTimeline(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.ticketsService.getTimeline(id, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del ticket' })
  findOne(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.ticketsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Crear ticket' })
  @ApiOkResponse({ description: 'Ticket creado' })
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: UserPayload) {
    return this.ticketsService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar ticket (no cerrado)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.ticketsService.update(id, dto, user);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Asignar técnico (admin o supervisor del área)' })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.ticketsService.assign(id, dto, user);
  }

  @Post(':id/change-status')
  @ApiOperation({ summary: 'Cambiar estado con validación de workflow' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.ticketsService.changeStatus(id, dto, user);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Cerrar ticket' })
  close(
    @Param('id') id: string,
    @Body() dto: CloseTicketDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.ticketsService.close(id, dto, user);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Añadir comentario' })
  addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.ticketsService.addComment(id, dto, user);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Subir adjunto al ticket' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        role: { type: 'string', example: 'gth_photo' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_TICKET_ATTACHMENT_BYTES } }))
  uploadAttachment(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
    @UploadedFile() file?: Express.Multer.File,
    @Body('role') role?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo requerido');
    }
    return this.ticketsService.uploadAttachment(
      id,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      user,
      role?.trim() || 'general',
    );
  }

  @Get(':id/attachments/:attachmentId/content')
  @ApiOperation({ summary: 'Contenido binario del adjunto del ticket' })
  async getAttachmentContent(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: UserPayload,
  ) {
    const { row, buffer } = await this.ticketsService.getAttachmentContent(id, attachmentId, user);
    return new StreamableFile(buffer, {
      type: row.mimeType || 'application/octet-stream',
      disposition: inlineContentDisposition(row.originalName),
      length: buffer.length,
    });
  }
}
