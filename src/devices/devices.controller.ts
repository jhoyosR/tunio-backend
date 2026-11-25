import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { QrResolution } from '../venues/qr-access.service';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@ApiTags('Devices')
@Controller()
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // La app lo llama al escanear el QR y al volver a entrar con el ultimo
  // token recordado (MOV-03). El cliente no tiene cuenta: solo el token.
  @Public()
  @Post('qr/:token/devices')
  @HttpCode(HttpStatus.OK)
  registerDevice(
    @Param('token', ParseUUIDPipe) token: string,
    @Body() dto: RegisterDeviceDto,
  ): Promise<QrResolution> {
    return this.devicesService.registerDevice(token, dto.installationId);
  }
}
