import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { SessionsModule } from './sessions/sessions.module';
import { GatewayModule } from './gateway/gateway.module';
import { AuditModule } from './audit/audit.module';
import { FilesModule } from './files/files.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgresql://manobi_admin:ManobiRD2024!Secure@localhost:5432/manobi_rd',
      autoLoadEntities: true,
      synchronize: false,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    DevicesModule,
    SessionsModule,
    GatewayModule,
    AuditModule,
    FilesModule,
    ChatModule,
  ],
})
export class AppModule {}
