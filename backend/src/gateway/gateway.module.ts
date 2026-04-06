import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DevicesModule } from '../devices/devices.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ChatModule } from '../chat/chat.module';
import { AuditModule } from '../audit/audit.module';
import { ManobiGateway } from './manobi.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'ManobiJWT2024!SuperSecretKey!ChangeMe',
    }),
    DevicesModule,
    SessionsModule,
    ChatModule,
    AuditModule,
  ],
  providers: [ManobiGateway],
  exports: [ManobiGateway],
})
export class GatewayModule {}
