/**
 * @dsh-external/dsh-session-archive — 会话归档插件（host 半区）。
 *
 * 商业 Agent（Cursor 等）同款体验：归档的对话暂存到归档文件夹，可恢复、可永久删除。
 *
 * - 归档：复用 DSH 官方 workspaceRegistry.archiveSession（归档后从所有分组/列表隐藏，
 *   会话日志与工作区账目保留，恢复后回到原位置）。
 * - 恢复：从 workspace domain 的 archivedSessionIds 移除该 id（官方没有 unarchive，
 *   此处直写 domain global state）。
 * - 删除：从 archivedSessionIds 与所有 workspace 的 sessionIds 移除，并删除持久化
 *   日志文件（.jsonl.zstd），彻底销毁。
 *
 * 对外暴露 loopback-only HTTP API（供 client 面板 fetch）：
 *   GET  /api/dsh-session-archive/list      → 归档会话列表（含标题/时间/token）
 *   POST /api/dsh-session-archive/archive   → {sessionId} 归档
 *   POST /api/dsh-session-archive/restore   → {sessionId} 恢复
 *   POST /api/dsh-session-archive/delete    → {sessionId} 永久删除
 */
import { rm } from 'node:fs/promises';
export const name = '@dsh-external/dsh-session-archive';
export const inject = ['webServer'];
export const API = {
    list: '/api/dsh-session-archive/list',
    archive: '/api/dsh-session-archive/archive',
    restore: '/api/dsh-session-archive/restore',
    delete: '/api/dsh-session-archive/delete',
};
// ---------- HTTP 辅助（同 dsh-auto-memory 模式） ----------
function isLoopbackRequest(req) {
    const address = req.socket && req.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    const host = req.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL('http://' + host);
    }
    catch {
        return false;
    }
    if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]')
        return false;
    if (req.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = req.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
function writeJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' });
    res.end(payload);
}
async function readJsonBody(req, maxBytes = 256 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes)
            return undefined;
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        return undefined;
    }
}
function requireLoopback(req, res) {
    if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' });
        return false;
    }
    return true;
}
function requireMethod(req, res, method) {
    if ((req.method || 'GET') !== method) {
        writeJson(res, 405, { error: 'method not allowed' });
        return false;
    }
    return true;
}
export function apply(ctx) {
    /** 归档会话列表：id + 标题 + 元数据 + token 统计（零 I/O cachedSnapshot） */
    async function listArchived() {
        const sessionQuery = ctx.get('sessionQuery');
        const wr = ctx.get('workspaceRegistry');
        const cache = ctx.get('sessionProjectionCache');
        if (!sessionQuery || !wr)
            return [];
        const archivedIds = Array.isArray(wr.archivedSessionIds) ? wr.archivedSessionIds : [];
        if (archivedIds.length === 0)
            return [];
        const records = await sessionQuery.listSessions();
        const byId = new Map(records.map((r) => [r.header.id, r]));
        const titles = new Map();
        try {
            const tRes = await sessionQuery.readTitleSnapshots(archivedIds);
            for (const item of tRes) {
                if (item.status === 'fulfilled' && item.value && item.value.title) {
                    titles.set(item.sessionId, item.value.title.title);
                }
            }
        }
        catch { /* 标题失败不阻塞 */ }
        const items = [];
        for (const id of archivedIds) {
            const rec = byId.get(id);
            const header = rec ? rec.header : undefined;
            let tokens = null;
            if (header && cache) {
                try {
                    const snap = cache.cachedSnapshot(header);
                    const usage = snap && snap.values ? snap.values.tokenUsage : undefined;
                    if (usage) {
                        tokens = usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
                    }
                }
                catch { /* 无统计可跳过 */ }
            }
            items.push({
                sessionId: id,
                title: titles.get(id) || null,
                cwd: header ? header.cwd || null : null,
                createdAt: header ? header.createdAt || 0 : 0,
                live: rec ? !!rec.live : false,
                origin: header ? header.origin || 'top' : 'top',
                delegationDepth: header ? header.delegationDepth ?? 0 : 0,
                tokens,
            });
        }
        items.sort((a, b) => b.createdAt - a.createdAt);
        return items;
    }
    /** 从 workspace domain 的 archivedSessionIds 移除 id（恢复）。
     * 官方没有 unarchive API，这里通过 registry 的 setState 通道双写
     * （domain 持久化 + 内存 state），与 archiveSession 共用同一状态源。 */
    async function removeFromArchived(sessionId) {
        const wr = ctx.get('workspaceRegistry');
        if (!wr || typeof wr.requireState !== 'function' || typeof wr.setState !== 'function')
            return false;
        const state = wr.requireState();
        if (!state || !Array.isArray(state.archivedSessionIds))
            return false;
        const next = state.archivedSessionIds.filter((id) => id !== sessionId);
        if (next.length === state.archivedSessionIds.length)
            return true; // 已不在归档集
        if (typeof wr.enqueueOperation === 'function') {
            await wr.enqueueOperation(() => wr.setState({ ...state, archivedSessionIds: next }));
        }
        else {
            await wr.setState({ ...state, archivedSessionIds: next });
        }
        return true;
    }
    /** 从所有 workspace 的 sessionIds 移除 id（删除时使用） */
    async function removeFromWorkspaces(sessionId) {
        const sd = ctx.get('storageDomain');
        if (!sd)
            return;
        const domain = sd.get('workspace');
        if (!domain)
            return;
        const table = domain.table('workspaces');
        for (const [wid, rec] of table.entries()) {
            if (rec && Array.isArray(rec.sessionIds) && rec.sessionIds.includes(sessionId)) {
                await table.update(wid, (cur) => ({
                    ...cur,
                    sessionIds: cur.sessionIds.filter((id) => id !== sessionId),
                }));
            }
        }
    }
    const routes = [
        {
            kind: 'exact',
            path: API.list,
            handler: async (req, res) => {
                if (!requireLoopback(req, res))
                    return;
                if (!requireMethod(req, res, 'GET'))
                    return;
                try {
                    const items = await listArchived();
                    writeJson(res, 200, { ok: true, items, count: items.length });
                }
                catch (e) {
                    writeJson(res, 500, { error: String(e?.message || e) });
                }
            },
        },
        {
            kind: 'exact',
            path: API.archive,
            handler: async (req, res) => {
                if (!requireLoopback(req, res))
                    return;
                if (!requireMethod(req, res, 'POST'))
                    return;
                const body = await readJsonBody(req);
                if (!body || typeof body.sessionId !== 'string')
                    return writeJson(res, 400, { error: 'missing sessionId' });
                try {
                    const wr = ctx.get('workspaceRegistry');
                    if (!wr)
                        return writeJson(res, 500, { error: 'workspaceRegistry unavailable' });
                    await wr.archiveSession(body.sessionId);
                    writeJson(res, 200, { ok: true });
                }
                catch (e) {
                    writeJson(res, 500, { error: String(e?.message || e) });
                }
            },
        },
        {
            kind: 'exact',
            path: API.restore,
            handler: async (req, res) => {
                if (!requireLoopback(req, res))
                    return;
                if (!requireMethod(req, res, 'POST'))
                    return;
                const body = await readJsonBody(req);
                if (!body || typeof body.sessionId !== 'string')
                    return writeJson(res, 400, { error: 'missing sessionId' });
                try {
                    await removeFromArchived(body.sessionId);
                    writeJson(res, 200, { ok: true });
                }
                catch (e) {
                    writeJson(res, 500, { error: String(e?.message || e) });
                }
            },
        },
        {
            kind: 'exact',
            path: API.delete,
            handler: async (req, res) => {
                if (!requireLoopback(req, res))
                    return;
                if (!requireMethod(req, res, 'POST'))
                    return;
                const body = await readJsonBody(req);
                if (!body || typeof body.sessionId !== 'string')
                    return writeJson(res, 400, { error: 'missing sessionId' });
                try {
                    const sessionQuery = ctx.get('sessionQuery');
                    const persistence = ctx.get('sessionPersistence');
                    // 进行中的会话不允许删除
                    let live = false;
                    if (sessionQuery) {
                        try {
                            const records = await sessionQuery.listSessions();
                            const rec = records.find((r) => r.header.id === body.sessionId);
                            live = !!(rec && rec.live);
                        }
                        catch { /* 查不到就继续 */ }
                    }
                    if (live)
                        return writeJson(res, 400, { error: '进行中的会话不能删除，请先结束对话' });
                    // 1) 从归档集移除
                    await removeFromArchived(body.sessionId);
                    // 2) 从所有工作区账目移除
                    await removeFromWorkspaces(body.sessionId);
                    // 3) 删除持久化日志文件
                    if (sessionQuery && persistence) {
                        try {
                            const records = await sessionQuery.listSessions();
                            const rec = records.find((r) => r.header.id === body.sessionId);
                            if (rec && rec.header) {
                                const loc = persistence.locate(rec.header);
                                if (loc && typeof loc.path === 'string') {
                                    await rm(loc.path, { force: true });
                                }
                            }
                        }
                        catch { /* 文件删除失败不致命，状态已清 */ }
                    }
                    writeJson(res, 200, { ok: true });
                }
                catch (e) {
                    writeJson(res, 500, { error: String(e?.message || e) });
                }
            },
        },
    ];
    for (const route of routes)
        ctx.webServer.register(route);
    ctx.logger?.info?.('[' + name + '] 路由就绪: ' + routes.map((r) => r.path).join(', '));
}
//# sourceMappingURL=index.js.map