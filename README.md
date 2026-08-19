# dsh-session-archive

DSH（DeepSeek Harness）会话归档插件 —— 商业 Agent 同款体验：**归档的对话暂存到归档文件夹，可恢复、可永久删除**。

## 功能

- 🗄️ **归档文件夹**：侧边栏底部新增「🗄️ 归档」入口，点开查看所有已归档对话
- ↩️ **恢复**：一键把归档对话移回原位置（工作区位置保留）
- 🗑 **永久删除**：彻底删除对话日志文件（不可恢复，需二次确认）
- 📊 **会话信息**：每个归档对话显示标题、时间、类型（对话/子代理）、消耗的 token 数
- 🔄 **与官方归档互通**：复用 DSH 官方归档机制（`workspaceRegistry.archiveSession`），
  你在会话列表右键「归档会话」归档的对话会出现在本插件的归档文件夹里，反之亦然

## 安装

### 方式一：直接装配（推荐）

```bash
cd ~/.dsh/profiles/web
pnpm add file:D:/path/to/dsh-session-archive
```

然后在 `cordis.patch.yml` 的 plugins 列表加入：

```yaml
- id: dsh-session-archive
  name: '@dsh-external/dsh-session-archive'
```

重启 dsh web 生效。

### 方式二：注入器热装（免重启）

使用 [dsh-super-injector](https://github.com/cfy209/dsh-super-injector)：

```bash
dev_inject_plugin {"dir": "D:/path/to/dsh-session-archive"}
```

## 使用

1. 打开 DSH Web GUI，左侧边栏底部点击 **「🗄️ 归档」**
2. 归档文件夹面板列出所有已归档对话，每行显示标题、时间、类型、token 消耗
3. 每个对话两个操作：
   - **↩ 恢复**：移回会话列表原位置
   - **🗑 删除**：点击一次变红「⚠ 确认删除」，再点一次才真正删除（删除日志文件，不可恢复）

归档入口：在会话列表右键（或更多菜单）选择「归档会话」，或在对话进行中随时归档。

## 工作原理

| 能力 | 实现 |
| --- | --- |
| 归档 | DSH 官方 `workspaceRegistry.archiveSession()`（归档后从所有列表隐藏，日志保留） |
| 恢复 | 官方没有 unarchive，插件经 `workspaceRegistry.setState` 通道把 id 移出归档集（内存 + 持久化双写，恢复后回到原工作区位置） |
| 删除 | 从归档集与工作区账目移除 + 用 `fs` 删除持久化日志文件（`.jsonl.zstd`） |
| 列表 | `workspaceRegistry.archivedSessionIds` + `sessionQuery`（标题）+ 投影缓存（token 统计，零 I/O） |

### HTTP API（loopback-only）

```
GET  /api/dsh-session-archive/list      → 归档会话列表
POST /api/dsh-session-archive/archive   → {sessionId} 归档
POST /api/dsh-session-archive/restore   → {sessionId} 恢复
POST /api/dsh-session-archive/delete    → {sessionId} 永久删除
```

所有接口仅接受本机回环请求（`isLoopbackRequest` 校验），手机/局域网访问会被拒绝。

## 开发

```bash
# host 编译（tsc）
DSH_CHECKOUT=C:/path/to/dsh-harness bash scripts/build.sh
# client 编译（tsdown）
npm run build:client
```

## 注意

- **删除不可恢复**：永久删除会物理删除会话日志文件，删除前有二次确认
- **进行中的会话不能删除**：请先结束对话再归档删除
- 会话列表里多出的"子代理"会话（🧩）是 DSH 派生子代理时自动创建的独立会话，可放心归档

## License

BSD-3-Clause
