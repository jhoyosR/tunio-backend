import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca un endpoint como exento del JwtAuthGuard global (ej. login, swagger, health).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
