import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CreateAssetDto } from './dto/create-asset.dto';
import { ListAssetsQueryDto } from './dto/list-assets-query.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { InventoryAssetsService } from './inventory-assets.service';

@ApiTags('inventory')
@ApiBearerAuth('access-token')
@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryAssetsController {
  constructor(private readonly inventoryAssets: InventoryAssetsService) {}

  @Get('departments/:departmentId/dependencies')
  @ApiOperation({ summary: 'Catálogo dependencias operativas (legado / inventario)' })
  listDependencies(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.inventoryAssets.listDependencies(departmentId, user);
  }

  @Get('departments/:departmentId/external-pc')
  @ApiOperation({
    summary: 'Equipos PC desde integración API (GET a URL configurada; respuesta filtrada por máscara)',
  })
  getExternalPc(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
    @Query('name') integrationName?: string,
  ) {
    return this.inventoryAssets.getExternalPcFromIntegration(departmentId, user, integrationName);
  }

  @Post('departments/:departmentId/hoja-de-vida/sync')
  @ApiOperation({
    summary: 'Importar hoja de vida PC a la tabla interna `hoja_de_vida` desde la integración API',
  })
  syncHojaDeVida(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
    @Query('name') integrationName?: string,
  ) {
    return this.inventoryAssets.syncHojaDeVidaFromIntegration(departmentId, user, integrationName);
  }

  @Get('departments/:departmentId/hoja-de-vida')
  @ApiOperation({ summary: 'Listado de filas guardadas en la tabla `hoja_de_vida` (BD interna) por departamento' })
  listHojaDeVida(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: UserPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('name') integrationName?: string,
  ) {
    return this.inventoryAssets.listHojaDeVida(departmentId, user, {
      page: page != null && page !== '' ? Number(page) : undefined,
      limit: limit != null && limit !== '' ? Number(limit) : undefined,
      integrationName,
    });
  }

  @Get('departments/:departmentId/assets')
  @ApiOperation({ summary: 'Listado paginado de activos por departamento' })
  listAssets(
    @Param('departmentId') departmentId: string,
    @Query() query: ListAssetsQueryDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.inventoryAssets.listAssets(departmentId, query, user);
  }

  @Get('departments/:departmentId/assets/export')
  @ApiOperation({ summary: 'Exportar CSV (UTF-8 con BOM, compatible Excel)' })
  exportAssets(
    @Param('departmentId') departmentId: string,
    @Query() query: ListAssetsQueryDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.inventoryAssets.exportCsv(departmentId, query, user);
  }

  /** Rutas más específicas antes de `assets/:assetId` para evitar ambigüedad en el enrutador. */
  @Get('assets/:assetId/lifecycle')
  @ApiOperation({ summary: 'Historial de mantenimiento / ciclo de vida del activo' })
  listLifecycle(@Param('assetId') assetId: string, @CurrentUser() user: UserPayload) {
    return this.inventoryAssets.listLifecycle(assetId, user);
  }

  @Get('assets/:assetId/photo')
  @ApiOperation({ summary: 'URL firmada de la foto del activo' })
  getAssetPhoto(@Param('assetId') assetId: string, @CurrentUser() user: UserPayload) {
    return this.inventoryAssets.getPhotoPreviewUrl(assetId, user);
  }

  @Get('assets/:assetId')
  @ApiOperation({ summary: 'Detalle de activo (incluye `lifecycle`: mantenimientos / ciclo de vida)' })
  getAsset(@Param('assetId') assetId: string, @CurrentUser() user: UserPayload) {
    return this.inventoryAssets.getOne(assetId, user);
  }

  @Post('departments/:departmentId/assets')
  @ApiOperation({ summary: 'Registrar activo' })
  createAsset(
    @Param('departmentId') departmentId: string,
    @Body() dto: CreateAssetDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.inventoryAssets.create(departmentId, dto, user);
  }

  @Patch('assets/:assetId')
  @ApiOperation({ summary: 'Actualizar activo' })
  updateAsset(
    @Param('assetId') assetId: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.inventoryAssets.update(assetId, dto, user);
  }

  @Delete('assets/:assetId')
  @ApiOperation({ summary: 'Baja lógica del activo' })
  softDeleteAsset(@Param('assetId') assetId: string, @CurrentUser() user: UserPayload) {
    return this.inventoryAssets.softDelete(assetId, user);
  }

  @Post('assets/:assetId/photo')
  @ApiOperation({ summary: 'Subir o reemplazar foto del activo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  uploadPhoto(
    @Param('assetId') assetId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserPayload,
  ) {
    return this.inventoryAssets.uploadPhoto(assetId, file, user);
  }
}
