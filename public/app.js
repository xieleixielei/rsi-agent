let state;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => value.replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[char]);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

function statusLabel(status) {
  return ({ proposed: "Suggested", trial: "In trial", adopted: "Learned", ignored: "Ignored", undone: "Undone" })[status];
}

function renderMetrics() {
  for (const [key, value] of Object.entries(state.metrics)) {
    $(`#metric-${key}`).textContent = value;
  }
  $("#nav-count").textContent = state.metrics.proposed;
}

function actionsFor(proposal) {
  if (proposal.status === "proposed") return `
    <button class="primary" data-action="trial" data-id="${proposal.id}">Try it</button>
    <button class="ghost" data-action="adopted" data-id="${proposal.id}">Adopt</button>
    <button class="ghost" data-action="ignored" data-id="${proposal.id}">Ignore</button>`;
  if (proposal.status === "trial") return `
    <button class="primary" data-action="adopted" data-id="${proposal.id}">Keep habit</button>
    <button class="ghost" data-action="undone" data-id="${proposal.id}">Undo trial</button>`;
  if (proposal.status === "adopted") return `<button class="ghost" data-action="undone" data-id="${proposal.id}">Undo</button>`;
  return "";
}

function proposalCard(proposal) {
  return `<article class="proposal">
    <div class="proposal-top">
      <h3>${escapeHtml(proposal.title)}</h3>
      <span class="status ${proposal.status}">${statusLabel(proposal.status)}</span>
    </div>
    <p>${escapeHtml(proposal.summary)}</p>
    <div class="proposal-meta">
      <span>${proposal.occurrences} corrections</span>
      <span>${proposal.distinctTasks} tasks</span>
      <span>${Math.round(proposal.confidence * 100)}% confidence</span>
    </div>
    <div class="proposal-actions">
      ${actionsFor(proposal)}
      <button class="ghost" data-detail="${proposal.id}">Why?</button>
    </div>
  </article>`;
}

function renderProposals() {
  const visible = state.proposals.filter((item) => item.status !== "adopted" && item.status !== "undone");
  $("#proposal-list").innerHTML = visible.length
    ? visible.map(proposalCard).join("")
    : '<div class="empty">No suggestions yet.<br />Repeated corrections will appear here.</div>';
}

function renderHabits() {
  const habits = state.proposals.filter((item) => item.status === "adopted" || item.status === "undone");
  $("#habit-list").innerHTML = habits.length ? habits.map((habit) => `
    <article class="habit-card">
      <div class="proposal-top"><h3>${escapeHtml(habit.title)}</h3><span class="status ${habit.status}">${statusLabel(habit.status)}</span></div>
      <p>${escapeHtml(habit.behavior)}</p>
      ${habit.status === "adopted" ? `<button class="ghost" data-action="undone" data-id="${habit.id}">Undo habit</button>` : ""}
    </article>`).join("") : '<div class="empty">Approved habits will live here, with a complete history and one-click undo.</div>';
}

function renderActivity() {
  const feedbackById = new Map(state.feedback.map((item) => [item.id, item]));
  const items = state.audit.slice(-8).reverse();
  $("#activity-list").innerHTML = items.length ? items.map((item) => {
    const feedback = feedbackById.get(item.target);
    const description = feedback
      ? `Correction recorded · ${feedback.category.replaceAll("_", " ")}`
      : item.action.replace("proposal.", "Suggestion ").replaceAll("_", " ");
    return `<div class="activity-item"><time>${new Date(item.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time><span>${escapeHtml(description)}</span><span>${escapeHtml(item.actor)}</span></div>`;
  }).join("") : '<div class="empty">Feedback and approval decisions will be recorded here.</div>';
}

function showDetail(id) {
  const proposal = state.proposals.find((item) => item.id === id);
  const evidence = proposal.evidenceIds.map((evidenceId) => state.feedback.find((item) => item.id === evidenceId)).filter(Boolean);
  $("#proposal-detail").innerHTML = `
    <p class="eyebrow">WHY THIS WAS SUGGESTED</p>
    <h2>${escapeHtml(proposal.title)}</h2>
    <p class="lede">${escapeHtml(proposal.summary)}</p>
    <div class="detail-grid">
      <div><strong>When</strong><span>${escapeHtml(proposal.trigger)}</span></div>
      <div><strong>New behavior</strong><span>${escapeHtml(proposal.behavior)}</span></div>
      <div><strong>Expected benefit</strong><span>${escapeHtml(proposal.benefit)}</span></div>
      <div><strong>Tradeoff</strong><span>${escapeHtml(proposal.tradeoff)}</span></div>
    </div>
    <h3>Evidence from your work</h3>
    <ul class="evidence">${evidence.map((item) => `<li><strong>${escapeHtml(item.runId)}</strong> — ${escapeHtml(item.note || "Correction recorded")}</li>`).join("")}</ul>
    <p class="muted">Scope: only <strong>${escapeHtml(proposal.project)}</strong>. Component: ${escapeHtml(proposal.component)}. The agent cannot approve this suggestion.</p>`;
  $("#proposal-dialog").showModal();
}

function render() {
  renderMetrics();
  renderProposals();
  renderHabits();
  renderActivity();
}

async function refresh() {
  state = await api("/api/state");
  $("#feedback-labels").innerHTML = state.feedbackLabels.map((item, index) => `
    <label class="choice"><input type="radio" name="category" value="${item.id}" ${index === 0 ? "checked" : ""} /> ${escapeHtml(item.label)}</label>`).join("");
  render();
}

$("#feedback-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    state = await api("/api/feedback", { method: "POST", body: JSON.stringify(data) });
    $("#form-status").textContent = "Correction recorded";
    const input = $("#run-id");
    const match = input.value.match(/^(.*?)(\d+)$/);
    if (match) input.value = `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
    render();
  } catch (error) {
    $("#form-status").textContent = error.message;
  }
});

document.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  const detailButton = event.target.closest("[data-detail]");
  if (detailButton) showDetail(detailButton.dataset.detail);
  if (!actionButton) return;
  try {
    state = await api(`/api/proposals/${actionButton.dataset.id}/${actionButton.dataset.action}`, { method: "POST" });
    render();
  } catch (error) {
    alert(error.message);
  }
});

$("#sample").addEventListener("click", async () => {
  state = await api("/api/demo/sample", { method: "POST" });
  render();
});

$("#reset").addEventListener("click", async () => {
  state = await api("/api/demo/reset", { method: "POST" });
  render();
});

$(".dialog-close").addEventListener("click", () => $("#proposal-dialog").close());
$("#proposal-dialog").addEventListener("click", (event) => {
  if (event.target === $("#proposal-dialog")) $("#proposal-dialog").close();
});

refresh().catch((error) => {
  document.body.innerHTML = `<p style="padding:2rem">Could not load the demo: ${escapeHtml(error.message)}</p>`;
});
