# status 彩色排版示意

这个分支只放一个功能建议的附件，不用于合并。

- `old.png`：v1.6.3 的 `agent-autoloop status` 对着 `mock.json` 的实际输出。
- `new.png`：`status-color.ts` 对着同一份数据的输出。
- `mock.json`：编造的示意数据，格式与 `agent-autoloop status --json` 相同。
- `status-color.ts`：独立脚本，零依赖。`node status-color.ts mock.json` 渲染示意数据，不带参数时读取 `agent-autoloop status --json`。

两张图是用浏览器把终端输出按 100 列深色终端的样子画出来的。
