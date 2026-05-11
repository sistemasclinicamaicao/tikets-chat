import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

const DEFAULT_OTP_BYPASS_EMPLOYEE_IDS = ['910204052230'];

type UserForSession = {
  id: string;
  employeeId: string;
  name: string;
  email: string | null;
  globalRole: string | null;
  departmentRoles: { departmentId: string; role: string }[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  private maskEmail(email: string) {
    const [localPart, domainPart] = email.split('@');
    if (!localPart || !domainPart) return 'correo oculto';
    const domainSections = domainPart.split('.');
    const domainName = domainSections[0] || '';
    const domainSuffix = domainSections.slice(1).join('.');

    const safeLocal = localPart.length <= 2 ? `${localPart[0] ?? '*'}*` : `${localPart.slice(0, 2)}***`;
    const safeDomain = domainName.length <= 2 ? `${domainName[0] ?? '*'}*` : `${domainName.slice(0, 2)}***`;

    return `${safeLocal}@${safeDomain}${domainSuffix ? `.${domainSuffix}` : ''}`;
  }

  /** Lista de employee_id que no reciben OTP por correo (ingreso con código interno). */
  private getOtpBypassEmployeeIds(): Set<string> {
    const ids = new Set(DEFAULT_OTP_BYPASS_EMPLOYEE_IDS);
    const extra = this.config.get<string>('AUTH_OTP_BYPASS_EMPLOYEE_IDS')?.trim();
    if (extra) {
      for (const part of extra.split(',')) {
        const t = part.trim();
        if (t) ids.add(t);
      }
    }
    return ids;
  }

  private isOtpBypassEmployee(employeeId: string): boolean {
    return this.getOtpBypassEmployeeIds().has(employeeId.trim());
  }

  /** Código de 6 caracteres que solo acepta el API para usuarios en lista de bypass (no es un OTP real). */
  private getOtpBypassVerifyCode(): string {
    const c = this.config.get<string>('AUTH_OTP_BYPASS_VERIFY_CODE')?.trim();
    return c && c.length === 6 ? c : '000000';
  }

  private async buildSessionPayload(user: UserForSession, meta: { otp_bypass?: boolean }) {
    const tokens = await this.tokenService.issueTokens({
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
    });

    this.auditLog.record({
      action: 'auth.session_started',
      actorUserId: user.id,
      resource: 'session',
      meta: { employee_id: user.employeeId, ...meta },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        employee_id: user.employeeId,
        name: user.name,
        email: user.email,
        global_role: user.globalRole ?? null,
        department_roles: user.departmentRoles.map((r) => ({
          department_id: r.departmentId,
          role: r.role,
        })),
      },
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { employeeId: dto.employee_id } });
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    if (this.isOtpBypassEmployee(user.employeeId)) {
      const code = this.getOtpBypassVerifyCode();
      return {
        success: true,
        employee_id: user.employeeId,
        employee_name: user.name,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        masked_email: '— (sin envío de correo; ingreso directo)',
        otp_bypass: true as const,
        bypass_verify_code: code,
      };
    }

    const otp = await this.otpService.createOtp(user.id);
    if (!user.email) {
      throw new UnauthorizedException('USER_WITHOUT_EMAIL');
    }
    await this.mailService.sendOtpEmail(user.email, otp.otpCode);

    return {
      success: true,
      employee_id: user.employeeId,
      employee_name: user.name,
      expires_at: otp.expiresAt,
      masked_email: this.maskEmail(user.email),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { employeeId: dto.employee_id },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        globalRole: true,
        departmentRoles: { select: { departmentId: true, role: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    if (this.isOtpBypassEmployee(user.employeeId)) {
      const magic = this.getOtpBypassVerifyCode();
      if (dto.otp_code !== magic) {
        throw new UnauthorizedException('INVALID_OTP');
      }
      return this.buildSessionPayload(user, { otp_bypass: true });
    }

    await this.otpService.verifyOtp(user.id, dto.otp_code);

    return this.buildSessionPayload(user, {});
  }

  async refresh(dto: RefreshDto) {
    return this.tokenService.rotateRefreshToken(dto.refresh_token, dto.device_id);
  }

  async logout(dto: LogoutDto) {
    await this.tokenService.revokeToken(dto.refresh_token);
    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        phone: true,
        jobTitle: true,
        dependencyName: true,
        laborType: true,
        isActive: true,
        globalRole: true,
        departmentRoles: { select: { departmentId: true, role: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    return {
      id: user.id,
      employee_id: user.employeeId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      job_title: user.jobTitle,
      dependency_name: user.dependencyName,
      labor_type: user.laborType,
      is_active: user.isActive,
      global_role: user.globalRole ?? null,
      department_roles: user.departmentRoles.map((r) => ({
        department_id: r.departmentId,
        role: r.role,
      })),
    };
  }
}
