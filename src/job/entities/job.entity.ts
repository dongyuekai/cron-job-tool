import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type JobType = 'cron' | 'every' | 'at';

@Entity()
export class Job {
  // id 作为定时任务的 id ，所以用 uuid 的字符串
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // instruction 是指令文本，比如“每天晚上 10 点提醒我写今日总结”，这个“写今日总结”就是指令文本
  @Column({ type: 'text' })
  instruction: string;

  @Column({ type: 'varchar', length: 10, default: 'cron' })
  type: JobType;

  // cron 保存 cron 表达式，everyMs 保存时间间隔，at 保存时间点
  // cron类型使用 （Cron表达式）
  @Column({ type: 'varchar', length: 100, nullable: true })
  cron: string | null;

  // every 类型使用（间隔毫秒）
  @Column({ type: 'int', nullable: true })
  everyMs: number | null;

  // at 类型使用（指定触发时间点）
  @Column({ type: 'timestamp', nullable: true })
  at: Date | null;

  // isEnabled 是任务开启关闭状态
  @Column({ default: true })
  isEnabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRun: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
