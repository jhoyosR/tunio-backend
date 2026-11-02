import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffUser } from '../staff/entities/staff-user.entity';
import { VenueStaff } from '../staff/entities/venue-staff.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { VenueAccessGuard } from './guards/venue-access.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

const SECONDS_PER_HOUR = 3600;

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([StaffUser, VenueStaff]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn:
            configService.get<number>('jwt.expiresInHours')! * SECONDS_PER_HOUR,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Globales y en este orden: primero identidad, luego establecimiento y rol.
    // Asi se aplican a todas las rutas, no caso por caso.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: VenueAccessGuard },
  ],
})
export class AuthModule {}
