window.__ModuleLoader__.load({
  id: "@rsi-agent/deepseek-harness-plugin",
  factory: (require) => {
    const module = { exports: {} };
    const React = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");
    const inject = ["sessions", "uiConversation", "commandUi", "slots"];

    const childCardStyle = {
      marginTop: "9px",
      padding: "9px 10px",
      border: ".5px solid var(--dsw-alias-border-l1)",
      borderRadius: "9px",
      background: "var(--dsw-alias-bg-base)",
    };

    function RsiCard() {
      const [visible, setVisible] = React.useState(true);
      const [plugins, setPlugins] = React.useState([]);
      const [busyId, setBusyId] = React.useState("");
      const [error, setError] = React.useState("");

      const refreshPlugins = React.useCallback(async () => {
        try {
          const response = await fetch("/api/rsi/plugins", { headers: { accept: "application/json" } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const body = await response.json();
          setPlugins(Array.isArray(body.plugins) ? body.plugins : []);
          setError("");
        } catch (reason) {
          setError(`无法读取改进插件：${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }, []);

      React.useEffect(() => {
        void refreshPlugins();
        const listener = () => void refreshPlugins();
        window.addEventListener("rsi:plugins-changed", listener);
        return () => window.removeEventListener("rsi:plugins-changed", listener);
      }, [refreshPlugins]);

      const togglePlugin = React.useCallback(async (plugin) => {
        setBusyId(plugin.id);
        try {
          const response = await fetch("/api/rsi/plugins", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ id: plugin.id, enabled: !plugin.enabled }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
          await refreshPlugins();
        } catch (reason) {
          setError(`操作失败：${reason instanceof Error ? reason.message : String(reason)}`);
        } finally {
          setBusyId("");
        }
      }, [refreshPlugins]);

      if (!visible) return null;
      return jsxs("section", {
        "data-rsi-card": "",
        "aria-label": "RSI Agent plugin",
        style: {
          boxSizing: "border-box",
          width: "calc(100% - 32px)",
          maxWidth: "748px",
          margin: "0 auto 8px",
          padding: "12px 14px",
          border: ".5px solid var(--dsw-alias-border-l1)",
          borderRadius: "12px",
          background: "var(--dsw-specific-tip)",
          color: "var(--dsw-alias-label-primary)",
        },
        children: [
          jsxs("div", {
            style: { display: "flex", alignItems: "center", gap: "12px" },
            children: [
              jsxs("div", {
                style: { minWidth: 0, flex: 1 },
                children: [
                  jsx("strong", { children: "RSI Agent" }),
                  jsx("div", {
                    style: { marginTop: "3px", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" },
                    children: "输入 /rsi improve <改进内容>，由 DeepSeek 创建并立即装载",
                  }),
                ],
              }),
              jsx("button", {
                type: "button",
                "aria-label": "关闭 RSI Agent 卡片",
                title: "关闭",
                onClick: () => setVisible(false),
                style: { border: 0, background: "transparent", color: "var(--dsw-alias-label-secondary)", cursor: "pointer", fontSize: "18px", lineHeight: 1 },
                children: "×",
              }),
            ],
          }),
          error ? jsx("div", { role: "alert", style: { ...childCardStyle, color: "var(--dsw-alias-label-error)" }, children: error }) : null,
          ...plugins.map((plugin) => jsxs("article", {
            "data-rsi-child-card": plugin.id,
            style: childCardStyle,
            children: [
              jsxs("div", { style: { display: "flex", gap: "10px", alignItems: "center" }, children: [
                jsxs("div", { style: { minWidth: 0, flex: 1 }, children: [
                  jsxs("div", { style: { fontSize: "13px", fontWeight: 600 }, children: [plugin.title, " · ", plugin.enabled ? "已装载" : "已卸载"] }),
                  jsx("div", { style: { marginTop: "3px", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" }, children: plugin.description }),
                ] }),
                jsx("button", {
                  type: "button",
                  disabled: busyId === plugin.id,
                  onClick: () => void togglePlugin(plugin),
                  style: { border: ".5px solid var(--dsw-alias-border-l1)", borderRadius: "7px", padding: "5px 9px", background: "transparent", color: "inherit", cursor: "pointer" },
                  children: busyId === plugin.id ? "处理中…" : plugin.enabled ? "卸载" : "装载",
                }),
              ] }),
            ],
          }, plugin.id)),
        ],
      });
    }

    function apply(ctx) {
      ctx.on("command/executed", (sessionId, name, result) => {
        if (name !== "rsi" || !result.text) return;

        const sessionScope = ctx.get("sessions")?.scope(sessionId);
        const conversation = sessionScope?.get("conversation");
        if (!sessionScope || !conversation) return;

        conversation.input.for(sessionScope).notify(
          result.kind === "error" ? "error" : "info",
          result.text,
        );
        if (result.kind !== "error" && result.text.includes("RSI improvement created")) {
          window.dispatchEvent(new CustomEvent("rsi:plugins-changed"));
        }
      });

      ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
        name: "conversation.input.dock",
        id: "rsi-agent",
        order: 20,
      }, RsiCard));
    }

    module.exports = { apply, inject };
    return module.exports;
  },
});
