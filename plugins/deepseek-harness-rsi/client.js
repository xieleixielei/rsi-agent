window.__ModuleLoader__.load({
  id: "@rsi-agent/deepseek-harness-plugin",
  factory: (require) => {
    const module = { exports: {} };
    const React = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");
    const inject = ["sessions", "uiConversation", "commandUi", "slots"];

    function RsiCard() {
      const [visible, setVisible] = React.useState(true);
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
          display: "flex",
          alignItems: "center",
          gap: "12px",
        },
        children: [
          jsxs("div", {
            style: { minWidth: 0, flex: 1 },
            children: [
              jsx("strong", { children: "RSI Agent" }),
              jsx("div", {
                style: { marginTop: "3px", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" },
                children: "人工反馈驱动的 Harness 改进 · /rsi status · /rsi improve <改进内容>",
              }),
            ],
          }),
          jsx("button", {
            type: "button",
            "aria-label": "关闭 RSI Agent 卡片",
            title: "关闭",
            onClick: () => setVisible(false),
            style: {
              border: 0,
              background: "transparent",
              color: "var(--dsw-alias-label-secondary)",
              cursor: "pointer",
              fontSize: "18px",
              lineHeight: 1,
            },
            children: "×",
          }),
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
