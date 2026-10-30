import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  function buildContext(
    user: { permissions: string[] } | undefined,
  ): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('permite el paso si el endpoint es publico', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);
    const context = buildContext(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite el paso si el endpoint no declara permisos requeridos', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined);
    const context = buildContext({ permissions: [] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite el paso si el usuario tiene todos los permisos requeridos', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['users.create', 'users.read']);
    const context = buildContext({
      permissions: ['users.create', 'users.read', 'roles.read'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('lanza ForbiddenException si falta algun permiso requerido', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['users.create']);
    const context = buildContext({ permissions: ['users.read'] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
