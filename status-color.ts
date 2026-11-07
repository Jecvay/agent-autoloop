// A sketch of a coloured `agent-autoloop status`, rendered from `agent-autoloop status --json`.
// Usage: node status-color.ts [state.json]   (without a file it runs `agent-autoloop status --json`)
// Colours only on a terminal; NO_COLOR turns them off, FORCE_COLOR turns them on when piped.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const raw = process.argv[2]
  ? readFileSync(process.argv[2], "utf8")
  : execFileSync("agent-autoloop", ["status", "--json"], { encoding: "utf8" });
const state = JSON.parse(raw);

const color = process.env.NO_COLOR === undefined && (process.stdout.isTTY || process.env.FORCE_COLOR !== undefined);
const sgr = (open: string) => (text: string) => (color ? `\x1b[${open}m${text}\x1b[0m` : text);
const bold = sgr("1");
const dim = sgr("2");
const underline = sgr("4");
const red = sgr("31");
const green = sgr("32");
const yellow = sgr("33");
const blue = sgr("34");
const magenta = sgr("35");
const cyan = sgr("36");
const heading = (text: string) => bold(blue(text));

const WIDTH = Math.min(process.stdout.columns || 100, 120);
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");
const width = (text: string) => [...plain(text)].reduce((sum, char) => sum + (WIDE.test(char) ? 2 : 1), 0);
const pad = (text: string, to: number) => text + " ".repeat(Math.max(0, to - width(text)));

const CLOSING = "，。；：！？、）」』”,.;:!?)";
/** Splits plain text into lines no wider than `room`, keeping at most `max` lines. */
function wrap(text: string, room: number, max = Infinity): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      // Closing punctuation stays on the line it closes rather than starting a line of its own.
      if (width(line + char) > room && !CLOSING.includes(char)) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    lines.push(line);
  }
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (width(last + "…") > room) last = [...last].slice(0, -1).join("");
  kept[max - 1] = last + "…";
  return kept;
}

const unlinked = (text: string) => text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

/** A rule named "项目：事项" shows its project part in colour; other names are left as they are. */
function ruleName(name: string) {
  const at = name.indexOf("：");
  return at < 0 ? name : `${cyan(name.slice(0, at))}${dim("：")}${name.slice(at + 1)}`;
}

const zone = state.timezone;
const now = new Date(state.now);
const dayOf = (date: Date) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(date).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const hm = (date: Date) =>
  date.toLocaleString("zh-CN", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const md = (date: Date) => date.toLocaleString("zh-CN", { timeZone: zone, month: "numeric", day: "numeric" });
const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function when(iso: string) {
  const date = new Date(iso);
  const days = dayOf(date) - dayOf(now);
  if (days === 0) return hm(date);
  if (days === -1) return `昨天 ${hm(date)}`;
  if (days === 1) return `明天 ${hm(date)}`;
  if (days > 1 && days < 7) {
    const weekday = new Date(dayOf(date) * 86_400_000).getUTCDay();
    return `${WEEK[weekday]} ${hm(date)}`;
  }
  return `${md(date)} ${hm(date)}`;
}
const minutes = (from: string) => Math.max(0, Math.round((now.getTime() - new Date(from).getTime()) / 60_000));
const lasted = (from: string) => {
  const total = minutes(from);
  return total < 60 ? `${total} 分钟` : `${Math.floor(total / 60)} 小时 ${total % 60} 分钟`;
};

const out: string[] = [];
const say = (line = "") => out.push(line);

// Overview: the counts that say whether anything needs a look.
const { totals, spending } = state;
const count = (label: string, n: number, style: (text: string) => string) =>
  n > 0 ? `${label} ${style(bold(String(n)))}` : dim(`${label} 0`);
const offline = [...state.agents, ...state.channels].filter((one: { online: boolean }) => !one.online);
say(`${bold("Agent Autoloop")}  ${dim(`${md(now)} ${hm(now)}`)}${offline.length ? `  ${red(bold(`${offline.length} 个离线`))}` : ""}`);
say(
  [
    count("等你", state.cards.length, (t) => yellow(t)),
    count("在跑", totals.running, cyan),
    count("排队", totals.queued, yellow),
    totals.retrying ? count("等重派", totals.retrying, yellow) : "",
    totals.unknown ? count("不确定", totals.unknown, red) : "",
    `今天做完 ${totals.doneToday}`,
  ]
    .filter(Boolean)
    .join(dim(" · ")),
);
const money = (s: { rounds: number; tokens: number; cost: number; missingCost: number }) => {
  const tokens = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 })
    .format(s.tokens)
    .replace(/(万|亿)/, " $1");
  const gap = s.missingCost ? `（${s.missingCost} 轮没上报费用）` : "";
  return `${s.rounds} 轮 · ${tokens} Token · $${s.cost.toFixed(2)}${gap}`;
};
say(dim(`今天     ${money(spending.today)}`));
say(dim(`近 7 天  ${money(spending.week)}`));

// Who can take work and who delivers cards.
say();
say(heading("在线"));
const presence = [
  ...state.agents.map((agent: any) => ({ name: agent.name, where: agent.worker, online: agent.online, seen: agent.seenAt })),
  ...state.channels.map((channel: any) => ({ name: channel.name, where: "通道", online: channel.online, seen: channel.seenAt })),
];
const nameRoom = Math.max(...presence.map((one) => width(one.name)));
for (const one of presence) {
  const mark = one.online ? green("●") : red("○");
  const tail = one.online ? dim(one.where) : red(`离线，最后一次 ${one.seen ? when(one.seen) : "没见过"}`);
  say(`  ${mark} ${pad(one.name, nameRoom)}  ${tail}`);
}

const paused = state.lines.filter((line: any) => line.paused);
if (paused.length) {
  say();
  say(heading("暂停中"));
  for (const line of paused) say(`  ${ruleName(line.name)}${line.paused.reason ? dim(`：${line.paused.reason}`) : ""}`);
}

// What waits for the owner comes before everything that only reports.
if (state.cards.length) {
  say();
  say(bold(yellow(`等你 ${state.cards.length}`)));
  for (const card of state.cards) {
    const label = card.kind === "ask" ? yellow(bold("决定")) : magenta(bold("留意"));
    say(`  ${label} ${dim(`#${card.id}`)} ${bold(card.title)}`);
    if (card.rule) say(`       ${dim("来自")} ${ruleName(card.rule)}`);
    for (const paragraph of (card.text ?? "").split(/\n\s*\n/).filter(Boolean)) {
      for (const line of wrap(unlinked(paragraph), WIDTH - 7)) say(`       ${line}`);
      const found = [...paragraph.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
      for (const [, words, url] of found) say(`       ${underline(words)} ${dim(url)}`);
    }
    if (card.kind === "ask") {
      card.options.forEach((option: string, index: number) => {
        const pick = index === card.recommend ? `  ${green("推荐")}` : "";
        say(`       ${bold(String(index + 1))}. ${option}${pick}`);
      });
      say(dim(`       回答：agent-autoloop answer ${card.id} <序号>`));
    } else say(dim(`       处理完了：agent-autoloop answer ${card.id}`));
  }
}

const sourceName = (id: string) => state.sources.find((one: any) => one.id === id)?.name ?? id;
function trigger(event: { source: string; type: string; subject: string; summary: string }) {
  if (event.type === "card.answered") return `你回答了卡片「${event.summary}」`;
  if (event.source === "schedule") return "定时";
  return `${sourceName(event.source)} ${event.type} ${event.summary || event.subject}`.trim();
}

const running = state.runs.filter((run: any) => run.state === "claimed");
const queued = state.runs.filter((run: any) => run.state === "queued");
if (running.length || queued.length) {
  say();
  say(heading("正在做"));
  for (const run of running) {
    const stopping = run.stopping ? `  ${yellow("正在停")}` : "";
    say(`  ${cyan(bold("▶"))} ${dim(`#${run.id}`)} ${ruleName(run.rule)}  ${cyan(`已跑 ${lasted(run.claimedAt)}`)}${stopping}`);
    if (run.events[0]) say(`      ${dim(`因为 ${trigger(run.events[0])}`)}`);
  }
  for (const run of queued) {
    const retry = run.attempts > 0;
    const label = retry ? yellow(`等重派，${when(run.notBefore)} 再试`) : yellow("排队");
    say(`  ${yellow("…")} ${dim(`#${run.id}`)} ${ruleName(run.rule)}  ${label}`);
    if (retry && run.error) for (const line of wrap(run.error, WIDTH - 6, 2)) say(`      ${red(line)}`);
  }
}

const RUN_LOOK: Record<string, [string, (text: string) => string]> = {
  done: ["做完了", green],
  nothing: ["没事可做", dim],
  unknown: ["不确定", red],
  cancelled: ["停了", yellow],
};
const finished = state.runs.filter((run: any) => run.state !== "claimed" && run.state !== "queued").slice(0, 8);
if (finished.length) {
  say();
  say(heading("最近几轮"));
  for (const run of finished) {
    const [label, style] = RUN_LOOK[run.state] ?? [run.state, (text: string) => text];
    const time = run.finishedAt ? when(run.finishedAt) : "";
    say(`  ${dim(pad(time, 11))} ${dim(pad(`#${run.id}`, 4))} ${style(pad(label, 8))} ${ruleName(run.rule)}`);
    const outcome = run.error ? red(run.error) : run.summary;
    if (!outcome) continue;
    const lines = wrap(unlinked(plain(outcome)), WIDTH - 28, 2);
    for (const line of lines) say(`${" ".repeat(28)}${run.error ? red(line) : run.state === "nothing" ? dim(line) : line}`);
  }
}

const CARD_LOOK: Record<string, [string, (text: string) => string]> = {
  open: ["等你", yellow],
  decided: ["已回答", cyan],
  done: ["已完成", green],
  closed: ["已关闭", dim],
};
if (state.recentCards.length) {
  say();
  say(heading("最近的卡片"));
  for (const card of state.recentCards.slice(0, 5)) {
    const [label, style] = CARD_LOOK[card.state] ?? [card.state, (text: string) => text];
    const shownLabel = card.kind === "notice" && card.state === "closed" ? "已处理" : label;
    say(`  ${dim(pad(`#${card.id}`, 4))} ${style(pad(shownLabel, 6))} ${bold(card.title)}`);
    const chosen = card.choice !== null && card.choice !== undefined ? card.options[card.choice] : card.answer;
    const parts = [
      chosen ? `你选了 ${green(chosen)}` : "",
      card.result ? unlinked(card.result) : card.state === "decided" ? dim("Agent 接着在做") : "",
    ].filter(Boolean);
    if (parts.length) {
      const line = parts.join(dim(" → "));
      for (const piece of wrap(plain(line), WIDTH - 14, 2)) {
        // Wrapping works on plain text; the first line keeps its colours when it fits whole.
        say(`              ${width(line) <= WIDTH - 14 ? line : piece}`);
        if (width(line) <= WIDTH - 14) break;
      }
    }
  }
}

const timed = [...state.lines.filter((line: any) => line.every), ...state.elsewhere];
if (timed.length) {
  say();
  say(heading("定时"));
  const nameRoom = Math.max(...timed.map((line: any) => width(line.name)));
  const everyRoom = Math.max(...timed.map((line: any) => width(line.every)));
  for (const line of timed) {
    const where = line.where ? dim(`（在别处：${line.where}）`) : "";
    say(`  ${pad(ruleName(line.name), nameRoom)}  ${pad(line.every, everyRoom)}  ${dim("下次")} ${when(line.next)}${where}`);
  }
}

if (state.unrouted.length) {
  say();
  say(heading("没有规则接的事件"));
  for (const event of state.unrouted.slice(0, 5)) {
    say(`  ${yellow("!")} ${sourceName(event.source)} ${event.type} ${event.subject}${event.summary ? dim(`：${event.summary}`) : ""}`);
  }
}

console.log(out.join("\n"));
