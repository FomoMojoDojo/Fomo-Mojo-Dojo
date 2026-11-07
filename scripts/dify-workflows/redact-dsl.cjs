// Redact inline credentials from a Dify DSL export. Dify's include_secret=False strips only its own
// ENVIRONMENT-VARIABLE secrets; a key typed directly into an http-request node's `headers` string is
// plain node config and comes out verbatim. Applied to BOTH sides by the guard, so a repointed model,
// a changed URL or an edited prompt is still caught — only the credential value is neutralised.
const PATTERNS = [
  [/sb_secret_[A-Za-z0-9_\-]+/g, "sb_secret_REDACTED"],
  [/sb_publishable_[A-Za-z0-9_\-]+/g, "sb_publishable_REDACTED"],
  [/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]+/g, "JWT_REDACTED"],
  [/sk-[A-Za-z0-9_\-]{20,}/g, "sk-REDACTED"],
];
function redact(text) {
  let out = String(text);
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out;
}
module.exports = { redact, PATTERNS };
if (require.main === module) {
  const fs = require("fs");
  const [, , inPath, outPath] = process.argv;
  const src = fs.readFileSync(inPath, "utf8");
  const red = redact(src);
  fs.writeFileSync(outPath, red);
  const n = (src.match(/sb_secret_[A-Za-z0-9_\-]+/g) || []).length;
  console.log(`redacted ${n} sb_secret occurrence(s) → ${outPath}`);
}
