import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryAssetsController } from './inventory-assets.controller';
import { InventoryAssetsService } from './inventory-assets.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [InventoryAssetsController],
  providers: [InventoryAssetsService],
  exports: [InventoryAssetsService],
})
export class InventoryModule {}
