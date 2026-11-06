# Obsidian 发布

笔记库默认 `/Users/yuinen/Documents/ob/blogs`，仅递归读取 `puts` 中的 `.md`。`crafts` 不读取。可通过 MYDEV_OBSIDIAN_ROOT 修改笔记库路径。笔记库无需纳入代码仓库。

文章格式：

```markdown
---
type: post
slug: my-first-post
title: 我的第一篇文章
excerpt: 文章简介
coverImageUrl: null
---

这里写正文。
```

slug 是稳定的文章标识，请保持不变。puts 即表示准备发布，无需额外 publish 属性。文件名可以改，slug 不要改。支持标准 Markdown；Obsidian 双链、嵌入及本地图片暂不转换或上传，请使用网站可访问的图片 URL。

- `npm run obsidian:check`：校验并预览，不上传。
- `npm run obsidian:sync`：向本地开发网站同步一次。
- `npm run obsidian:watch`：持续同步至本地开发网站。
- 上述命令追加 `-- --production`：选择生产网站。

生产环境需在本机 .env 配置 MYDEV_PRODUCTION_URL 和 MYDEV_PRODUCTION_TOKEN，后者与线上 AUTHOR_API_TOKEN 一致。不要提交密钥。默认使用本地环境，以免误发布。

监控每五秒检查一次，变化后等待两秒确认文件稳定，再创建或更新并发布。成功内容不重复提交，单篇校验失败或同步失败不会阻塞其他文章；有重复标识的文章全部跳过。发布前再次核对文件内容，避免误发校验后变动的笔记。发布接口每次请求限时 5 秒，超时后按现有策略最多重试两次。监控模式会在后续扫描重试失败的文章。同一项目目录只允许一个写入同步进程，预览不受影响。若强制退出留下 .obsidian-sync.lock，确认锁内记录的进程已停止后再删除锁文件。请保留 .mydev-state.json 和 .obsidian-sync-*.json 以维护文章对应关系。删除或移出 puts 不会删除或撤回线上文章。

监控需要终端进程持续运行，电脑开机且联网；停止后可重启，离线修改会在下次启动时处理。当前不安装开机启动服务。
