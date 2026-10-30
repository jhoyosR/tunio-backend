import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

// Declara los permisos (formato "resource.action") que un endpoint exige.
// El PermissionsGuard los lee via Reflector y los valida contra el usuario autenticado.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
