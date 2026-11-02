import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// bcrypt solo considera los primeros 72 bytes; mas alla no aporta nada.
const PASSWORD_MAX_LENGTH = 72;

export class LoginDto {
  // Los correos se guardan en minusculas; se normaliza para que una
  // mayuscula puesta por el teclado no impida entrar.
  @ApiProperty({ example: 'dj@bar.example' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
