window.__ModuleLoader__.load({
  id: "@rsi-agent/deepseek-harness-plugin",
  factory: () => {
    const module = { exports: {} };
    const inject = ["sessions", "uiConversation", "commandUi"];

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
    }

    module.exports = { apply, inject };
    return module.exports;
  },
});
