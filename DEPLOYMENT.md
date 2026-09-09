# MyDev 上线清单

本项目使用 Astro 7、Cloudflare Workers 和 D1。`@astrojs/cloudflare` 14 已不再支持 Cloudflare Pages，因此不要使用 Pages 的直接上传命令。

## 1. 准备 Cloudflare 令牌

令牌应限制在当前账户，并包含：

- Workers Scripts：编辑
- D1：编辑

旧的 `Cloudflare Pages：编辑` 权限不再是本项目部署所需权限，可以移除。

把令牌只放在本机终端或 CI Secret 中：

```bash
export CLOUDFLARE_API_TOKEN='你的令牌'
```

不要把令牌写入 `.env`、代码或 Git 仓库。

## 2. 创建并绑定 D1

先检查是否已有数据库：

```bash
npx wrangler d1 list
```

如果没有 `mydev`，创建它：

```bash
npx wrangler d1 create mydev
```

把命令返回的 UUID 填入 `wrangler.jsonc` 的 `database_id`，然后初始化远程数据库：

```bash
npx wrangler d1 migrations apply mydev --remote
```

## 3. 上线前验证

```bash
pnpm install --frozen-lockfile
pnpm audit
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm deploy:check
```

`deploy:check` 不会发布项目，但会阻止占位 D1 ID 进入部署流程。

## 4. 首次部署与密钥

配置完成后发布：

```bash
pnpm deploy
```

首次部署完成后，为 Worker 添加文章管理密钥：

```bash
npx wrangler secret put AUTHOR_API_TOKEN
```

使用至少 32 字节的随机值，例如：

```bash
openssl rand -hex 32
```

本地用于发布文章的 `MYDEV_PRODUCTION_TOKEN` 必须与 Cloudflare 中的 `AUTHOR_API_TOKEN` 相同；它只保存在本机 `.env` 中。

## 5. 上线后验收

- 首页、项目、文章与留言板页面均能正常访问。
- Giscus 能加载 Discussion #1，并能通过 GitHub 登录留言。
- 未发布文章返回 404。
- 文章可以完成创建、发布、公开读取和删除。
- `/api/author/*` 在缺少或使用错误令牌时返回 401。
- Cloudflare Worker 绑定中存在 `DB`，且没有不需要的 `SESSION` 或 `IMAGES` 绑定。
