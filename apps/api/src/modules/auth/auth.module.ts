import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { PushModule } from '../push/push.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    MailModule,
    PushModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokenService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
