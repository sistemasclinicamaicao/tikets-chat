import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { JwtUserPayload } from '../../common/auth/jwt-user.payload';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private parseExpiresInMinutes(value: string | undefined, fallbackMinutes: number): number {
    if (!value) return fallbackMinutes * 60;
    if (value.endsWith('m')) return Number(value.slice(0, -1)) * 60;
    if (value.endsWith('h')) return Number(value.slice(0, -1)) * 3600;
    if (value.endsWith('d')) return Number(value.slice(0, -1)) * 86400;
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : fallbackMinutes * 60;
  }

  private async buildJwtPayload(userId: string, employeeId: string, name: string): Promise<JwtUserPayload> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        globalRole: true,
        departmentRoles: { select: { departmentId: true, role: true } },
      },
    });
    return {
      sub: userId,
      employee_id: employeeId,
      name,
      global_role: row?.globalRole ?? null,
      department_roles: (row?.departmentRoles ?? []).map((r) => ({
        departmentId: r.departmentId,
        role: r.role,
      })),
    };
  }

  async issueTokens(user: { id: string; employeeId: string; name: string }, deviceId?: string) {
    const payload = await this.buildJwtPayload(user.id, user.employeeId, user.name);

    const accessSecret = process.env.JWT_SECRET ?? 'dev_jwt_secret';
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: accessSecret,
      expiresIn: this.parseExpiresInMinutes(process.env.JWT_ACCESS_EXPIRES_IN, 15),
    });

    const refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me';
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: this.parseExpiresInMinutes(process.env.JWT_REFRESH_EXPIRES_IN, 12 * 60),
    });

    const decoded = this.jwtService.decode(refreshToken) as { exp?: number };
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 12 * 3600 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        deviceId,
        expiresAt,
      },
    });

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async rotateRefreshToken(refreshToken: string, deviceId?: string) {
    const refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me';
    let payload: JwtUserPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtUserPayload>(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, isRevoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    let matchedTokenId: string | null = null;
    for (const token of tokens) {
      const ok = await bcrypt.compare(refreshToken, token.tokenHash);
      if (ok) {
        matchedTokenId = token.id;
        break;
      }
    }

    if (!matchedTokenId) {
      throw new UnauthorizedException('Refresh token invalid or revoked');
    }

    await this.prisma.refreshToken.update({
      where: { id: matchedTokenId },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, employeeId: true, name: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(
      { id: user.id, employeeId: user.employeeId, name: user.name },
      deviceId,
    );
  }

  async revokeToken(refreshToken: string) {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { isRevoked: false },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    for (const token of candidates) {
      const ok = await bcrypt.compare(refreshToken, token.tokenHash);
      if (!ok) continue;
      await this.prisma.refreshToken.update({
        where: { id: token.id },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      return;
    }

    throw new UnauthorizedException('Refresh token not found');
  }
}
