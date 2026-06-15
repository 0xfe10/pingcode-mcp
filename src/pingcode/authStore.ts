import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  savedAt: number;
}

/**
 * 用户态 token 的本地持久化存储。
 * - token 文件以 0600 权限写入，避免泄露。
 * - 进程内缓存：首次读盘后复用，避免每次请求都做 IO；写入时同步刷新缓存。
 * - 读失败 / 文件不存在均返回 undefined，绝不抛错。
 */
export class AuthStore {
  private cache?: StoredTokens;
  private loaded = false;

  constructor(private readonly path: string) {}

  get(): StoredTokens | undefined {
    if (!this.loaded) {
      this.loaded = true;
      try {
        const text = readFileSync(this.path, "utf8");
        const parsed = JSON.parse(text) as StoredTokens;
        this.cache = parsed?.accessToken ? parsed : undefined;
      } catch {
        // 文件不存在或解析失败：视为未登录。
        this.cache = undefined;
      }
    }
    return this.cache;
  }

  hasToken(): boolean {
    return Boolean(this.get()?.accessToken);
  }

  save(tokens: StoredTokens): StoredTokens {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    this.cache = tokens;
    this.loaded = true;
    return tokens;
  }

  update(partial: Partial<StoredTokens>): StoredTokens {
    const current = this.get();
    const merged: StoredTokens = {
      accessToken: partial.accessToken ?? current?.accessToken ?? "",
      refreshToken: partial.refreshToken ?? current?.refreshToken,
      tokenType: partial.tokenType ?? current?.tokenType ?? "Bearer",
      expiresAt: partial.expiresAt ?? current?.expiresAt,
      savedAt: Date.now(),
    };
    return this.save(merged);
  }

  clear(): void {
    if (existsSync(this.path)) {
      unlinkSync(this.path);
    }
    this.cache = undefined;
    this.loaded = true;
  }
}
