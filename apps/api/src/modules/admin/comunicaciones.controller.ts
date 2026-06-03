import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { isRootUser } from '../../common/auth/root-user.util';
import { assertInventoryDepartmentAccess } from '../inventory/inventory-access';
import { AdminGthComunicacionesRecordsService } from './admin-gth-comunicaciones-records.service';

const MAX_GTH_PHOTO_BYTES = 6 * 1024 * 1024;

@ApiTags('comunicaciones')
@ApiBearerAuth('access-token')
@Controller('comunicaciones')
@UseGuards(JwtAuthGuard)
export class ComunicacionesController {
  constructor(private readonly gthRecords: AdminGthComunicacionesRecordsService) {}

  @Get('gth-records/filter-options')
  @ApiOperation({ summary: 'Valores distintos para filtros de registros GTH' })
  listGthRecordFilterOptions(
    @Query('departmentId') departmentId: string,
    @Query('includeInactive') includeInactive: string | undefined,
    @CurrentUser() user: UserPayload,
  ) {
    if (!departmentId?.trim()) {
      return { AREA: [], ESTADO: [], CARGO: [], TIPOCONTRATO: [] };
    }
    assertInventoryDepartmentAccess(user, departmentId.trim());
    return this.gthRecords.getFilterOptions(includeInactive === 'true');
  }

  @Get('gth-records')
  @ApiOperation({ summary: 'Registros GTH de Comunicaciones (directorio + fotografía)' })
  listGthRecords(
    @Query('departmentId') departmentId: string,
    @Query('includeInactive') includeInactive: string | undefined,
    @Query('q') q: string | undefined,
    @Query('area') area: string | undefined,
    @Query('cargo') cargo: string | undefined,
    @Query('estado') estado: string | undefined,
    @Query('tipoContrato') tipoContrato: string | undefined,
    @Query('hasPhoto') hasPhoto: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: UserPayload,
  ) {
    if (!departmentId?.trim()) {
      return { data: [], total: 0, page: 1, limit: 25, total_pages: 0 };
    }
    assertInventoryDepartmentAccess(user, departmentId.trim());
    const hasPhotoNorm =
      hasPhoto === 'true' || hasPhoto === 'false' ? (hasPhoto as 'true' | 'false') : 'all';
    return this.gthRecords.listRecords(departmentId.trim(), {
      includeInactive: includeInactive === 'true',
      q,
      area,
      cargo,
      estado,
      tipoContrato,
      hasPhoto: hasPhotoNorm,
      page: page ? Number.parseInt(page, 10) : 1,
      limit: limit ? Number.parseInt(limit, 10) : 25,
    });
  }

  @Get('gth-records/:recordId')
  @ApiOperation({ summary: 'Detalle de un registro GTH con payload completo' })
  getGthRecord(
    @Param('recordId') recordId: string,
    @Query('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
  ) {
    if (!departmentId?.trim()) {
      throw new BadRequestException('departmentId requerido');
    }
    assertInventoryDepartmentAccess(user, departmentId.trim());
    return this.gthRecords.getRecordDetail(recordId);
  }

  @Post('gth-records/:recordId/photo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir fotografía a un registro GTH de Comunicaciones' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_GTH_PHOTO_BYTES } }))
  uploadGthRecordPhoto(
    @Param('recordId') recordId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
  ) {
    if (!departmentId?.trim()) {
      throw new BadRequestException('departmentId requerido');
    }
    assertInventoryDepartmentAccess(user, departmentId.trim());
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo requerido');
    }
    return this.gthRecords.uploadPhoto(
      recordId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      user,
    );
  }

  @Delete('gth-records/:recordId/photo')
  @ApiOperation({ summary: 'Eliminar fotografía GTH (solo usuario root)' })
  deleteGthRecordPhoto(
    @Param('recordId') recordId: string,
    @Query('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
  ) {
    if (!isRootUser(user)) {
      throw new ForbiddenException('Solo el usuario root puede eliminar fotografías GTH');
    }
    if (!departmentId?.trim()) {
      throw new BadRequestException('departmentId requerido');
    }
    assertInventoryDepartmentAccess(user, departmentId.trim());
    return this.gthRecords.deletePhoto(recordId);
  }

  @Get('gth-records/:recordId/photo/content')
  @ApiOperation({ summary: 'Contenido binario de la fotografía GTH (proxy API)' })
  async getGthRecordPhotoContent(
    @Param('recordId') recordId: string,
    @Query('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
    @Res() res: Response,
  ) {
    if (!departmentId?.trim()) {
      res.status(400).send('departmentId requerido');
      return;
    }
    assertInventoryDepartmentAccess(user, departmentId.trim());
    const { buffer, mimeType, originalName } = await this.gthRecords.getPhotoContent(recordId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    res.send(buffer);
  }
}
