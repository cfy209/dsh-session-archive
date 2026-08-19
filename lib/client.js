window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-session-archive",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/client/index.ts
		/**
		* @dsh-external/dsh-session-archive — 会话归档插件（client 半区）。
		*
		* 两个表面：
		*   1. sidebar.footer.action — 侧边栏底部「🗄️ 归档」入口按钮
		*   2. shell.overlay         — 归档文件夹面板：列出归档对话，可恢复 / 永久删除
		*
		* 数据走 host 的 loopback HTTP API（/api/dsh-session-archive/*）。
		*/
		const inject = ["slots"];
		const h = react.default.createElement;
		const API = {
			list: "/api/dsh-session-archive/list",
			archive: "/api/dsh-session-archive/archive",
			restore: "/api/dsh-session-archive/restore",
			delete: "/api/dsh-session-archive/delete"
		};
		async function apiGet(path) {
			const res = await fetch(path);
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error || "GET " + path + " → HTTP " + res.status);
			return body;
		}
		async function apiPost(path, payload) {
			const res = await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error || "POST " + path + " → HTTP " + res.status);
			return body;
		}
		let panelOpen = false;
		const listeners = /* @__PURE__ */ new Set();
		function emit() {
			for (const fn of listeners) try {
				fn();
			} catch {}
		}
		function subscribe(fn) {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		}
		function openPanel() {
			panelOpen = true;
			emit();
		}
		function closePanel() {
			panelOpen = false;
			emit();
		}
		const CSS = `
[data-arch-entry] { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border: none;
  background: transparent; color: inherit; cursor: pointer; border-radius: 8px; font-size: 13px; opacity: .82; }
[data-arch-entry]:hover { opacity: 1; background: color-mix(in srgb, var(--dsw-alias-label-secondary, #666) 14%, transparent); }
[data-arch-mask] { position: fixed; inset: 0; background: rgba(0,0,0,.28); z-index: 2990;
  display: flex; align-items: center; justify-content: center; }
[data-arch-panel] { position: relative; width: min(600px, calc(100vw - 24px)); max-height: min(82vh, 760px);
  display: flex; flex-direction: column; overflow: hidden; border-radius: 14px;
  background: var(--dsw-alias-bg-overlay, #fff);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(128,128,128,.35)) 65%, transparent);
  box-shadow: 0 24px 64px rgba(0,0,0,.28); color: var(--dsw-alias-label-primary, #1f2328);
  font: 13px/1.5 system-ui, 'Segoe UI', sans-serif; }
[data-arch-head] { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(128,128,128,.25)) 55%, transparent); }
[data-arch-head] strong { font-size: 14px; }
[data-arch-spacer] { flex: 1; }
[data-arch-btn] { border: none; background: transparent; cursor: pointer; color: inherit; opacity: .75;
  padding: 4px 8px; border-radius: 6px; font-size: 12px; white-space: nowrap; }
[data-arch-btn]:hover { opacity: 1; background: color-mix(in srgb, var(--dsw-alias-label-secondary, #666) 16%, transparent); }
[data-arch-btn]:disabled { opacity: .4; cursor: default; }
[data-arch-danger] { color: #c0392b; background: rgba(192,57,43,.12); font-weight: 600; }
[data-arch-restore] { color: #1d6f42; }
[data-arch-error] { padding: 8px 12px; color: #c0392b; font-size: 12px; border-bottom: 1px solid rgba(192,57,43,.2); }
[data-arch-list] { flex: 1; overflow-y: auto; min-height: 120px; }
[data-arch-empty] { padding: 30px 16px; text-align: center; opacity: .55; white-space: pre-line; }
[data-arch-row] { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(128,128,128,.14)) 55%, transparent); }
[data-arch-row-main] { min-width: 0; }
[data-arch-title] { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-arch-sub] { font-size: 11px; opacity: .6; margin-top: 2px; }
[data-arch-actions] { display: flex; align-items: center; gap: 4px; }
[data-arch-foot] { padding: 7px 12px; font-size: 11px; opacity: .55;
  border-top: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1, rgba(128,128,128,.18)) 55%, transparent); }
`;
		function injectCss() {
			if (typeof document === "undefined") return;
			if (document.getElementById("dsh-session-archive-css")) return;
			const el = document.createElement("style");
			el.id = "dsh-session-archive-css";
			el.textContent = CSS;
			document.head.appendChild(el);
		}
		function SidebarButton(props) {
			const wide = !!(props && props.wide);
			return h("button", {
				"data-arch-entry": true,
				title: "查看归档的对话（可恢复 / 删除）",
				onClick: openPanel
			}, wide ? "🗄️ 归档" : "🗄️");
		}
		function fmtTokens(n) {
			if (typeof n !== "number" || !isFinite(n) || n <= 0) return "";
			return n.toLocaleString("en-US") + " tokens";
		}
		function rowView(r, confirmId, setConfirmId, restore, remove) {
			const title = r.title || (r.cwd ? String(r.cwd).split(/[\\/]/).filter(Boolean).pop() || r.cwd : r.sessionId);
			const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
			const tokens = fmtTokens(r.tokens);
			const sub = [
				r.origin === "subagent" ? "🧩 子代理" : "💬 对话",
				when,
				tokens
			].filter(Boolean).join(" · ");
			const isConfirm = confirmId === r.sessionId;
			return h("div", {
				"data-arch-row": true,
				key: r.sessionId
			}, h("div", { "data-arch-row-main": true }, h("div", {
				"data-arch-title": true,
				title: r.sessionId
			}, title), h("div", { "data-arch-sub": true }, sub)), h("div", { "data-arch-actions": true }, h("button", {
				"data-arch-btn": true,
				"data-arch-restore": true,
				onClick: () => restore(r.sessionId)
			}, "↩ 恢复"), h("button", {
				"data-arch-btn": true,
				"data-arch-danger": isConfirm,
				onClick: () => {
					if (isConfirm) remove(r.sessionId);
					else setConfirmId(r.sessionId);
				}
			}, isConfirm ? "⚠ 确认删除" : "🗑 删除")));
		}
		function ArchivePanel(props) {
			const [items, setItems] = react.default.useState(null);
			const [loading, setLoading] = react.default.useState(false);
			const [error, setError] = react.default.useState(null);
			const [confirmId, setConfirmId] = react.default.useState(null);
			const load = () => {
				setLoading(true);
				setError(null);
				apiGet(API.list).then((body) => setItems(body.items || [])).catch((e) => setError(e && e.message ? e.message : String(e))).finally(() => setLoading(false));
			};
			react.default.useEffect(() => {
				load();
			}, []);
			const restore = (id) => {
				apiPost(API.restore, { sessionId: id }).then(load).catch((e) => setError(e && e.message ? e.message : String(e)));
			};
			const remove = (id) => {
				apiPost(API.delete, { sessionId: id }).then(() => {
					setConfirmId(null);
					load();
				}).catch((e) => setError(e && e.message ? e.message : String(e)));
			};
			const rows = items || [];
			return h("div", {
				"data-arch-mask": true,
				onClick: props.onClose
			}, h("div", {
				"data-arch-panel": true,
				onClick: (e) => e.stopPropagation()
			}, h("div", { "data-arch-head": true }, h("strong", null, "🗄️ 会话归档"), h("span", { "data-arch-spacer": true }), h("button", {
				"data-arch-btn": true,
				onClick: load,
				disabled: loading
			}, loading ? "⟳…" : "⟳ 刷新"), h("button", {
				"data-arch-btn": true,
				onClick: props.onClose
			}, "✕")), error ? h("div", { "data-arch-error": true }, "操作失败: " + error) : null, h("div", { "data-arch-list": true }, loading && !items ? h("div", { "data-arch-empty": true }, "加载中…") : rows.length === 0 ? h("div", { "data-arch-empty": true }, "没有归档的对话。\n在会话列表右键（或更多菜单）选择「归档会话」，即可把对话暂存到这里。") : rows.map((r) => rowView(r, confirmId, setConfirmId, restore, remove))), items ? h("div", { "data-arch-foot": true }, "共 " + String(rows.length) + " 个归档对话 · 恢复后回到原位置 · 删除后不可恢复") : null));
		}
		function apply(ctx) {
			injectCss();
			ctx.effect(() => ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "session-archive",
				order: 6,
				label: () => "归档"
			}, (props) => h(SidebarButton, props))), "dsh-session-archive: entry");
			ctx.effect(() => ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "session-archive",
				order: 7
			}, () => {
				const [open, setOpen] = react.default.useState(panelOpen);
				react.default.useEffect(() => subscribe(() => setOpen(panelOpen)), []);
				if (!open) return null;
				return h(ArchivePanel, { onClose: closePanel });
			})), "dsh-session-archive: overlay");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map