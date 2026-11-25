import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService, LoginResult, StaffProfile } from './auth.service';
import {
  CurrentStaff,
  Public,
  WithoutVenueScope,
} from './decorators/auth.decorators';
import { LoginDto } from './dto/login.dto';
import type { AuthenticatedStaff } from './interfaces/authenticated-staff.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto.email, dto.password);
  }

  // Permite a la web recuperar perfil y roles al recargar con un token guardado.
  @ApiBearerAuth()
  @WithoutVenueScope()
  @Get('me')
  getProfile(@CurrentStaff() staff: AuthenticatedStaff): Promise<StaffProfile> {
    return this.authService.getProfile(staff.staffId);
  }
}
