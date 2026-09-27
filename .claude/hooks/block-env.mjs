// PreToolUse hook: block any tool call whose input references a .env file.
// Allows .env.example and code like `process.env.X` (".env" preceded by a word char).
// Exit 2 = block the tool call; stderr is shown to Claude as the reason.

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = "";
  try {
    input = JSON.stringify(JSON.parse(raw).tool_input ?? {});
  } catch {
    input = raw; // unparseable payload: scan it as plain text
  }

  const ENV_REF = /(?<![A-Za-z0-9_])\.env(?![A-Za-z0-9_]|\.example\b)/i;
  if (ENV_REF.test(input)) {
    process.stderr.write(
      "Blocked by .claude/hooks/block-env.mjs: tool input references a .env file. " +
        "Secrets files are off-limits (.env.example is allowed).\n"
    );
    process.exit(2);
  }
  process.exit(0);
});
