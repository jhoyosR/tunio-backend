import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  CurrentStaff,
  Public,
  Roles,
} from '../auth/decorators/auth.decorators';
import type { AuthenticatedStaff } from '../auth/interfaces/authenticated-staff.interface';
import { UpdateQrAccessDto } from './dto/update-qr-access.dto';
import {
  QrAccessDetails,
  QrAccessService,
  QrResolution,
} from './qr-access.service';

@ApiTags('QR access')
@Controller()
export class QrAccessController {
  constructor(private readonly qrAccessService: QrAccessService) {}

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('venues/:venueId/qr')
  getQrAccess(@Param('venueId') venueId: string): Promise<QrAccessDetails> {
    return this.qrAccessService.getQrAccess(venueId);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('venues/:venueId/qr/regenerate')
  @HttpCode(HttpStatus.OK)
  regenerateToken(@Param('venueId') venueId: string): Promise<QrAccessDetails> {
    return this.qrAccessService.regenerateToken(venueId);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Patch('venues/:venueId/qr')
  setEnabled(
    @Param('venueId') venueId: string,
    @CurrentStaff() staff: AuthenticatedStaff,
    @Body() dto: UpdateQrAccessDto,
  ): Promise<QrAccessDetails> {
    return this.qrAccessService.setEnabled(
      venueId,
      staff.staffId,
      dto.isEnabled,
    );
  }

  @ApiBearerAuth()
  @ApiProduces('image/png')
  @Roles('ADMIN')
  @Get('venues/:venueId/qr/image')
  async getQrImage(@Param('venueId') venueId: string): Promise<StreamableFile> {
    const { png, fileName } = await this.qrAccessService.renderImage(venueId);
    return new StreamableFile(png, {
      type: 'image/png',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  // Lo llama la app al escanear: sin credencial, solo con el token.
  @Public()
  @Get('qr/:token')
  resolveToken(
    @Param('token', ParseUUIDPipe) token: string,
  ): Promise<QrResolution> {
    return this.qrAccessService.resolveToken(token);
  }
}
