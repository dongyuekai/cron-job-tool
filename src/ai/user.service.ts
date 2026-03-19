import { Injectable } from '@nestjs/common';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

@Injectable()
export class UserService {
  private readonly users = new Map<string, User>([
    [
      '001',
      {
        id: '001',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'admin',
      },
    ],
    [
      '002',
      {
        id: '002',
        name: 'Bob',
        email: 'bob@example.com',
        role: 'user',
      },
    ],
    [
      '003',
      {
        id: '003',
        name: 'Charlie',
        email: 'charlie@example.com',
        role: 'user',
      },
    ],
    [
      '004',
      {
        id: '004',
        name: 'David',
        email: 'david@example.com',
        role: 'user',
      },
    ],
  ]);
  findAll(): User[] {
    return Array.from(this.users.values());
  }
  findOne(id: string): User | undefined {
    return this.users.get(id);
  }
  create(user: User): User {
    this.users.set(user.id, user);
    return user;
  }
  update(id: string, partial: Partial<Omit<User, 'id'>>): User | undefined {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      return undefined;
    }
    const updatedUser: User = {
      ...existingUser,
      ...partial,
      id: existingUser.id,
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  remove(id: string): boolean {
    return this.users.delete(id);
  }
}
