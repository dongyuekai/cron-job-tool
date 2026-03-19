import { Inject, Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import { Runnable } from '@langchain/core/runnables';

// const database = {
//   users: {
//     '001': {
//       id: '001',
//       name: 'Alice',
//       email: 'alice@example.com',
//       role: 'admin',
//     },
//     '002': { id: '002', name: 'Bob', email: 'bob@example.com', role: 'user' },
//     '003': {
//       id: '003',
//       name: 'Charlie',
//       email: 'charlie@example.com',
//       role: 'user',
//     },
//   },
// };

// const queryUserArgsSchema = z.object({
//   userId: z.string().describe('用户 ID, 例如：001， 002，003'),
// });

// type QueryUserArgs = {
//   userId: string;
// };

// tool已经被提取到ai.module.ts里了 这里就注释掉了 以免重复定义
// const queryUserTool = tool(
//   async ({ userId }: QueryUserArgs) => {
//     const user = database.users[userId];
//     if (!user) {
//       return `未找到用户，ID: ${userId}`;
//     }
//     return `用户信息 - ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Role: ${user.role}`;
//   },
//   {
//     name: 'query_user',
//     description:
//       '查询用户信息的工具，输入用户 ID，返回用户的详细信息（姓名、邮箱、角色）',
//     schema: queryUserArgsSchema,
//   },
// );

@Injectable()
export class AiService {
  private readonly modelWithTools: Runnable<BaseMessage[], AIMessage>;

  constructor(
    @Inject('CHAT_MODEL') model: ChatOpenAI,
    @Inject('QUERY_USER_TOOL') private readonly queryUserTool: any,
    @Inject('SEND_MAIL_TOOL') private readonly sendMailTool: any,
  ) {
    this.modelWithTools = model.bindTools([
      this.queryUserTool,
      this.sendMailTool,
    ]);
  }

  async runChain(query: string): Promise<string> {
    const messages: BaseMessage[] = [
      new SystemMessage(
        '你是一个智能助手，可以在需要时调用工具（如 query_user)来查询用户信息，再用结果回答用户的问题。',
      ),
      new HumanMessage(query),
    ];

    // 用 while true 来实现一个 agent loop
    while (true) {
      const aiMessage = await this.modelWithTools.invoke(messages);
      messages.push(aiMessage);
      const toolCalls = aiMessage.tool_calls ?? [];
      // 没有要调用的工具 直接把回答返回给调用方
      if (!toolCalls.length) {
        return aiMessage.content as string;
      }

      // 依次执行本轮需要调用的所有工具
      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id || '';
        const toolName = toolCall.name;

        if (toolName === 'query_user') {
          // const args = queryUserArgsSchema.parse(toolCall.args);
          // const result = await queryUserTool.invoke(args);
          const result = await this.queryUserTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else if (toolName === 'send_mail') {
          const result = await this.sendMailTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        }
      }
    }
  }

  async *runChainStream(query: string): AsyncIterable<string> {
    const messages: BaseMessage[] = [
      new SystemMessage(
        '你是一个智能助手，可以在需要时调用工具（如 query_user)来查询用户信息，再用结果回答用户的问题。',
      ),
      new HumanMessage(query),
    ];

    while (true) {
      // 一轮对话：先让模型思考并可能提出工具调用
      const stream = await this.modelWithTools.stream(messages);

      let fullAIMessage: AIMessageChunk | null = null;

      for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
        // 使用concat持续拼接 得到本轮完整的 AIMessageChunk
        fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;

        const hasToolCallChunk =
          !!fullAIMessage.tool_call_chunks &&
          fullAIMessage.tool_call_chunks.length > 0;

        // 只要当前轮次还没出现tool调用的chunk 就可以把文本内容流式往外推
        if (!hasToolCallChunk && chunk.content) {
          yield chunk.content as string;
        }
      }

      if (!fullAIMessage) {
        return;
      }

      messages.push(fullAIMessage);

      const toolCalls = fullAIMessage.tool_calls ?? [];

      // 没有工具调用：说明这一轮就是最终回答 已经在上面的for-await里面流式返回了 直接结束即可
      if (!toolCalls.length) {
        return;
      }

      // 有工具调用 依次执行工具调用 生成ToolMessage 进入下一轮
      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id || '';
        const toolName = toolCall.name;
        if (toolName === 'query_user') {
          // const args = queryUserArgsSchema.parse(toolCall.args);
          // const result = await queryUserTool.invoke(args);

          const result = await this.queryUserTool.invoke(toolCall.args);

          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        } else if (toolName === 'send_mail') {
          const result = await this.sendMailTool.invoke(toolCall.args);
          messages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              name: toolName,
              content: result,
            }),
          );
        }
      }
    }
  }
}
