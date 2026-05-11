import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createOtp(userId: string) {
    const otpCode = this.generateCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const request = await this.prisma.otpRequest.create({
      data: { userId, otpHash, expiresAt },
      select: { id: true, expiresAt: true },
    });

    return {
      requestId: request.id,
      expiresAt: request.expiresAt,
      otpCode,
    };
  }

  async verifyOtp(userId: string, otpCode: string) {
    const request = await this.prisma.otpRequest.findFirst({
      where: { userId, isVerified: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!request) {
      throw new UnauthorizedException('No OTP request found');
    }

    if (request.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('OTP expired');
    }

    if (request.attempts >= 3) {
      throw new UnauthorizedException('OTP attempts exceeded');
    }

    const isValid = await bcrypt.compare(otpCode, request.otpHash);

    if (!isValid) {
      await this.prisma.otpRequest.update({
        where: { id: request.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.prisma.otpRequest.update({
      where: { id: request.id },
      data: { isVerified: true, verifiedAt: new Date() },
    });
  }
}
