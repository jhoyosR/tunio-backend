import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

// Servicio generico de correo transaccional, desacoplado de cualquier caso de
// uso concreto: hoy lo usa el flujo de reset password, pero cualquier modulo
// futuro puede inyectar MailService y llamar sendMail() sin conocer el proveedor SMTP.
@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('mail.host'),
      port: this.configService.get<number>('mail.port'),
      secure: this.configService.get<boolean>('mail.secure'),
      auth: this.configService.get<string>('mail.user')
        ? {
            user: this.configService.get<string>('mail.user'),
            pass: this.configService.get<string>('mail.password'),
          }
        : undefined,
    });
    this.from = this.configService.get<string>('mail.from')!;
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  }
}
