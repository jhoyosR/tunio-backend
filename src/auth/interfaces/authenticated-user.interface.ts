// Forma del usuario que JwtStrategy adjunta a la request tras validar el token,
// ya con roles y permisos resueltos para que los guards no vuelvan a consultar la DB.
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}
