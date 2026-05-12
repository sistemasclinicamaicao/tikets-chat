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

  /**
   * Envío genérico para notificaciones de dominio. No lanza: el llamador persiste `failed` / `skipped` en BD.
   */
  async sendTransactionalMail(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ ok: true } | { ok: false; code: string }> {
    const from = process.env.MAIL_DEFAULT_SENDER || process.env.MAIL_USERNAME;
    const to = params.to?.trim();
    if (!to || !from) {
      return { ok: false, code: 'MAIL_CONFIG_INCOMPLETE' };
    }
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: params.subject,
        text: params.text,
        ...(params.html ? { html: params.html } : {}),
      });
      return { ok: true };
    } catch {
      return { ok: false, code: 'MAIL_SEND_FAILED' };
    }
  }
}
