import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { UserService } from './user.service';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { MailerService } from '@nestjs-modules/mailer';
import { UsersModule } from 'src/users/users.module';
import { UsersService } from 'src/users/users.service';

@Module({
  imports: [UsersModule],
  controllers: [AiController],
  providers: [
    AiService,
    UserService,
    {
      provide: 'CHAT_MODEL',
      useFactory: (configService: ConfigService) => {
        return new ChatOpenAI({
          modelName: configService.get('MODEL_NAME'),
          apiKey: configService.get('OPENAI_API_KEY'),
          configuration: {
            baseURL: configService.get('OPENAI_BASE_URL'),
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'QUERY_USER_TOOL',
      useFactory: (userService: UserService) => {
        const queryUserArgsSchema = z.object({
          userId: z.string().describe('用户 ID, 例如：001， 002，003'),
        });
        return tool(
          async ({ userId }: { userId: string }) => {
            const user = userService.findOne(userId);
            if (!user) {
              return `未找到用户，ID: ${userId}`;
            }
            return `用户信息 - ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Role: ${user.role}`;
          },
          {
            name: 'query_user',
            description:
              '查询用户信息的工具，输入用户 ID，返回用户的详细信息（姓名、邮箱、角色）',
            schema: queryUserArgsSchema,
          },
        );
      },
      inject: [UserService],
    },
    {
      // 发送邮件工具
      provide: 'SEND_MAIL_TOOL',
      useFactory: (
        mailerService: MailerService,
        configService: ConfigService,
      ) => {
        const sendMailArgsSchema = z.object({
          to: z.email().describe('收件人邮箱地址，例如：example@example.com'),
          subject: z.string().describe('邮件主题'),
          text: z.string().optional().describe('纯文本内容，可选'),
          html: z.string().optional().describe('HTML 内容，可选'),
        });
        return tool(
          async ({
            to,
            subject,
            text,
            html,
          }: {
            to: string;
            subject: string;
            text?: string;
            html?: string;
          }) => {
            const fallbackFrom = configService.get<string>('MAIL_FROM');
            await mailerService.sendMail({
              to,
              subject,
              text: text ?? '（无文本内容）',
              html: html ?? `<p>${text ?? '（无 HTML 内容）'}</p>`,
              from: fallbackFrom,
            });

            return `邮件已发送到 ${to}，主题为「${subject}」`;
          },
          {
            name: 'send_mail',
            description:
              '发送电子邮件。需要提供收件人邮箱、主题，可选文本内容和 HTML 内容。',
            schema: sendMailArgsSchema,
          },
        );
      },
      inject: [MailerService, ConfigService],
    },
    {
      // 网页搜索工具
      provide: 'WEB_SEARCH_TOOL',
      useFactory: (configService: ConfigService) => {
        const webSearchArgsSchema = z.object({
          query: z
            .string()
            .min(1)
            .describe('搜索查询关键词，例如：今天天气如何？'),
          count: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .describe('返回结果数量，默认10条'),
        });
        return tool(
          async ({ query, count = 10 }: { query: string; count?: number }) => {
            const apiKey = configService.get<string>('BOCHA_API_KEY');
            if (!apiKey) {
              return 'Bocha Web Search 的 API Key 未配置（环境变量 BOCHA_API_KEY），请先在服务端配置后再重试。';
            }
            const url = 'https://api.bochaai.com/v1/web-search';
            const body = {
              query,
              freshness: 'noLimit',
              summary: true,
              count: count ?? 10,
            };

            const response = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            });
            if (!response.ok) {
              const errorText = await response.text();
              return `搜索 API 请求失败，状态码: ${response.status}, 错误信息: ${errorText}`;
            }
            let json: any;
            try {
              json = await response.json();
            } catch (e) {
              return `搜索 API 请求失败，原因是：搜索结果解析失败 ${(e as Error).message}`;
            }
            try {
              if (json.code !== 200 || !json.data) {
                return `搜索 API 请求失败，原因是: ${json.msg ?? '未知错误'}`;
              }
              const webpages = json.data.webPages?.value ?? [];
              if (!webpages.length) {
                return '未找到相关结果。';
              }
              const formatted = webpages
                .map(
                  (page: any, idx: number) => ` 引用: ${idx + 1}
                                                标题: ${page.name}
                                                URL: ${page.url}
                                                摘要: ${page.summary}
                                                网站名称: ${page.siteName}
                                                网站图标: ${page.siteIcon}
                                                发布时间: ${page.dateLastCrawled}`,
                )
                .join('\n\n');

              return formatted;
            } catch (e) {
              return `搜索 API 请求失败，原因是：搜索结果解析失败 ${(e as Error).message}`;
            }
          },
          {
            name: 'web_search',
            description:
              '使用 Bocha Web Search API 搜索互联网网页。输入为搜索关键词（可选 count 指定结果数量），返回包含标题、URL、摘要、网站名称、图标和时间等信息的结果列表。',
            schema: webSearchArgsSchema,
          },
        );
      },
      inject: [ConfigService],
    },
    {
      // 数据库增删改查工具
      provide: 'DB_USERS_CRUD_TOOL',
      useFactory: (usersService: UsersService) => {
        const dbUsersCrudArgsSchema = z.object({
          action: z
            .enum(['create', 'list', 'get', 'update', 'delete'])
            .describe('要执行的操作: create、list、get、update、delete'),
          id: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('用户ID (get / update / delete 时需要)'),
          name: z
            .string()
            .min(1)
            .max(50)
            .optional()
            .describe('用户姓名 (create 或 update 时可用)'),
          email: z
            .string()
            .email()
            .max(50)
            .optional()
            .describe('用户邮箱 (create 或 update 时可用)'),
        });
        return tool(
          async ({
            action,
            id,
            name,
            email,
          }: {
            action: 'create' | 'list' | 'get' | 'update' | 'delete';
            id?: number;
            name?: string;
            email?: string;
          }) => {
            switch (action) {
              case 'create': {
                if (!name || !email) {
                  return '创建用户需要提供 name 和 email。';
                }
                const created = await usersService.create({ name, email });
                return `已创建用户: ID=${(created as any).id}，姓名=${(created as any).name}，邮箱=${(created as any).email}`;
              }
              case 'list': {
                const users = await usersService.findAll();
                if (users.length === 0) {
                  return '当前没有用户。';
                }
                return users
                  .map(
                    (user) =>
                      `ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Created At: ${user.createdAt?.toISOString?.() ?? ''}`,
                  )
                  .join('\n');
              }
              case 'get': {
                if (!id) {
                  return '获取用户需要提供 id。';
                }
                const user = await usersService.findOne(id);
                if (!user) {
                  return `未找到用户，ID: ${id}`;
                }
                return `用户信息：ID=${user.id}，姓名=${user.name}，邮箱=${user.email}，创建时间=${user.createdAt?.toISOString?.() ?? ''}`;
              }
              case 'update': {
                if (!id) {
                  return '更新用户需要提供 id。';
                }
                const payload: any = {};
                if (name !== undefined) payload.name = name;
                if (email !== undefined) payload.email = email;
                if (!Object.keys(payload).length) {
                  return '未提供需要更新的字段（name 或 email），本次不执行更新。';
                }
                const existing = await usersService.findOne(id);
                if (!existing) {
                  return `ID 为 ${id} 的用户在数据库中不存在。`;
                }
                await usersService.update(id, payload);
                const updated: any = await usersService.findOne(id);
                return `已更新用户：ID=${id}，姓名=${updated?.name}，邮箱=${updated?.email}`;
              }
              case 'delete': {
                if (!id) {
                  return '删除用户需要提供 id。';
                }
                const existing: any = await usersService.findOne(id);
                if (!existing) {
                  return `ID 为 ${id} 的用户在数据库中不存在，无需删除。`;
                }
                await usersService.remove(id);
                return `已删除用户：ID=${id}，姓名=${existing.name}，邮箱=${existing.email}`;
              }
              default:
                return `不支持的操作: ${action}`;
            }
          },
          {
            name: 'db_users_crud',
            description:
              '对数据库 users 表执行增删改查操作。通过 action 字段选择 create/list/get/update/delete，并按需提供 id、name、email 等参数。',
            schema: dbUsersCrudArgsSchema,
          },
        );
      },
      inject: [UsersService],
    },
  ],
})
export class AiModule {}
