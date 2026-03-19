import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/user.entity';
import {
  CronExpression,
  ScheduleModule,
  SchedulerRegistry,
} from '@nestjs/schedule';
import { CronJob } from 'cron';

@Module({
  imports: [
    AiModule,
    // 支持静态文件服务，方便前端页面访问
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('MAIL_HOST'),
          port: configService.get('MAIL_PORT'),
          secure: configService.get('MAIL_SECURE') === 'true',
          auth: {
            user: configService.get('MAIL_USER'),
            pass: configService.get('MAIL_PASS'),
          },
        },
        defaults: {
          from: configService.get('MAIL_FROM'),
        },
      }),
    }),
    // mysql的orm框架
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '123456',
      database: 'hello',
      synchronize: true, // true 表示在服务启动的时候自动建表
      connectorPackage: 'mysql2',
      logging: true,
      entities: [User],
    }),
    // 定时任务模块
    ScheduleModule.forRoot(),
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnApplicationBootstrap {
  @Inject(SchedulerRegistry)
  schedulerRegistry: SchedulerRegistry;

  // 应用启动时注册一些定时任务的示例
  async onApplicationBootstrap() {
    const job = new CronJob(CronExpression.EVERY_SECOND, () => {
      console.log('每秒执行一次的定时任务');
    });
    this.schedulerRegistry.addCronJob('job_every_second', job);
    job.start();
    setTimeout(() => {
      this.schedulerRegistry.deleteCronJob('job_every_second');
    }, 5000);

    const intervalRef = setInterval(() => {
      console.log('run interval job');
    }, 1000);
    this.schedulerRegistry.addInterval('interval_job', intervalRef);
    setTimeout(() => {
      this.schedulerRegistry.deleteInterval('interval_job');
    }, 5000);

    const timeoutRef = setTimeout(() => {
      console.log('run timeout job');
    }, 5000);
    this.schedulerRegistry.addTimeout('timeout_job', timeoutRef);
    setTimeout(() => {
      this.schedulerRegistry.deleteTimeout('timeout_job');
    }, 5000);
  }
}
