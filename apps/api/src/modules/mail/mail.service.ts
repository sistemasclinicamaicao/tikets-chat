import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    host: process.env.MAIL_SERVER,
    port: Number(process.env.MAIL_PORT || 587),
    secure: false,
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: (process.env.MAIL_PASSWORD || '').replace(/\s+/g, ''),
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  async sendOtpEmail(to: string, otpCode: string) {
    const from = process.env.MAIL_DEFAULT_SENDER || process.env.MAIL_USERNAME;
    if (!to || !from) {
      throw new ServiceUnavailableException('MAIL_CONFIG_INCOMPLETE');
    }

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Codigo OTP - Chat Tikets',
        text: `Tu codigo OTP es: ${otpCode}. Expira en 5 minutos.`,
        html: `<p>Tu codigo OTP es: <strong>${otpCode}</strong></p><p>Expira en 5 minutos.</p>`,
      });
    } catch (error) {
      throw new ServiceUnavailableException('MAIL_SEND_FAILED');
    }
  }
}
