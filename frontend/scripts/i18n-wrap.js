// Wraps plain English on screens in tx("ui.<file>.<key>", "English") so it can be translated.
//   node scripts/i18n-wrap.js src/pages/HomePage.jsx src/components/...   (files or folders)
// Covers words between tags, placeholder/title/aria-label/alt/label text, "a" : "b" choices inside
// JSX, and toast messages (simple `${x}` parts become {{x}}). Edits in place and keeps formatting.
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label", "description", "subtitle", "helper", "hint", "cta", "emptyText"]);
const PROPS = new Set(["label", "question", "subtitle", "title", "desc", "description", "hint", "cta", "line", "helper", "placeholder", "text", "body", "heading", "blurb", "tagline", "caption", "empty", "sub", "detail", "tip", "short", "long", "why", "how"]);
const SKIP_TAGS = new Set(["code", "pre", "style", "script", "Trans", "kbd"]);
const HAS_WORDS = /[A-Za-z]{2,}/;
const LOOKS_LIKE_CODE = /^[\w-]+(\.[\w-]+)+$|^[a-z]+(_[a-z]+)+$|^https?:|^\/|^#|^[a-z]+[A-Z]\w*$/;

const camel = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const slugOf = (text) => {
  const words = text.replace(/\{\{\w+\}\}/g, " ").replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const s = words.map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("");
  return s && /^[a-z]/.test(s) ? s : `s${s}`;
};

function wrapFile(file) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parser.parse(code, { sourceType: "module", plugins: ["jsx", "classProperties", "optionalChaining"] });
  } catch (e) {
    console.warn(`skip ${file}: ${e.message}`);
    return 0;
  }
  const ns = `ui.${camel(path.basename(file).replace(/\.(jsx?|tsx?)$/, ""))}`;
  const keyByText = new Map();
  // Keys already in the file (from an earlier run) keep their English, and new ones never clash.
  const used = new Set();
  for (const m of code.matchAll(/\btx\("([\w.-]+)", ("(?:\\.|[^"\\])*")/g)) {
    if (!m[1].startsWith(`${ns}.`)) continue;
    used.add(m[1].slice(ns.length + 1));
    keyByText.set(JSON.parse(m[2]), m[1]);
  }
  const keyFor = (text) => {
    if (keyByText.has(text)) return keyByText.get(text);
    let base = slugOf(text);
    let k = base;
    for (let n = 2; used.has(k); n += 1) k = `${base}${n}`;
    used.add(k);
    keyByText.set(text, `${ns}.${k}`);
    return `${ns}.${k}`;
  };
  const call = (text, vars) => {
    const args = [JSON.stringify(keyFor(text)), JSON.stringify(text)];
    if (vars && vars.length) args.push(`{ ${vars.map(([n, src]) => (n === src ? n : `${n}: ${src}`)).join(", ")} }`);
    return `tx(${args.join(", ")})`;
  };
  const edits = [];
  const wanted = (s) => typeof s === "string" && HAS_WORDS.test(s) && !LOOKS_LIKE_CODE.test(s.trim()) && !s.includes("{{");

  const insideSkippedTag = (p) => p.findParent((q) => q.isJSXElement() && SKIP_TAGS.has(q.node.openingElement.name.name));

  const templateToText = (node) => {
    const vars = [];
    const names = new Set();
    let text = "";
    for (let i = 0; i < node.quasis.length; i += 1) {
      text += node.quasis[i].value.cooked;
      const ex = node.expressions[i];
      if (!ex) continue;
      if (!["Identifier", "MemberExpression", "OptionalMemberExpression"].includes(ex.type)) return null;
      const src = code.slice(ex.start, ex.end);
      let name = ex.type === "Identifier" ? ex.name : (ex.property && ex.property.name) || "value";
      if (names.has(name) && vars.find((v) => v[0] === name)[1] !== src) name = `${name}${i}`;
      if (!names.has(name)) { names.add(name); vars.push([name, src]); }
      text += `{{${name}}}`;
    }
    return { text, vars };
  };

  // A string that is the answer of a ? : or && chain sitting directly in JSX.
  const choiceInJsx = (p) => {
    let q = p;
    while (q.parentPath && (q.parentPath.isConditionalExpression() || q.parentPath.isLogicalExpression())) {
      if (q.parentPath.isConditionalExpression() && q.key === "test") return null;
      if (q.parentPath.isLogicalExpression() && q.key === "left" && q.parentPath.node.operator === "&&") return null;
      q = q.parentPath;
    }
    if (q === p || !q.parentPath || !q.parentPath.isJSXExpressionContainer()) return null;
    const holder = q.parentPath.parentPath;
    if (holder.isJSXAttribute()) return ATTRS.has(holder.node.name.name) ? "attr" : null;
    return holder.isJSXElement() || holder.isJSXFragment() ? "child" : null;
  };

  traverse(ast, {
    JSXText(p) {
      const raw = p.node.extra ? p.node.extra.raw : code.slice(p.node.start, p.node.end);
      // Only plain spaces/newlines are trimmed, so a deliberate &nbsp; stays part of the line.
      const value = p.node.value.replace(/[ \t\r\n]+/g, " ").replace(/^ | $/g, "");
      if (!wanted(value) || insideSkippedTag(p)) return;
      const lead = raw.match(/^[ \t\r\n]*/)[0].length;
      const trail = raw.match(/[ \t\r\n]*$/)[0].length;
      const start = p.node.start + lead;
      const end = p.node.end - trail;
      if (end <= start) return;
      edits.push([start, end, `{${call(value)}}`]);
    },
    JSXAttribute(p) {
      const v = p.node.value;
      if (!v || v.type !== "StringLiteral" || !ATTRS.has(p.node.name.name) || !wanted(v.value)) return;
      edits.push([v.start, v.end, `{${call(v.value)}}`]);
    },
    StringLiteral(p) {
      if (p.parentPath.isJSXAttribute() || p.parentPath.isImportDeclaration() || p.parentPath.isExportDeclaration()) return;
      if (!wanted(p.node.value) || insideSkippedTag(p)) return;
      if (p.parentPath.isCallExpression() && /^tx?$/.test(p.parentPath.node.callee.name || "")) return;
      const where = choiceInJsx(p) || toastArg(p);
      if (where) edits.push([p.node.start, p.node.end, call(p.node.value)]);
    },
    // Display words kept in lists (questions, options, cards). They become getters, so the words are
    // looked up when shown, not once when the file loads (before the language file has arrived).
    ObjectProperty(p) {
      const k = p.node.key.name || p.node.key.value;
      if (!PROPS.has(k) || p.node.computed || !displayList(p.parentPath)) return;
      const v = p.node.value;
      let expr = null;
      if (v.type === "StringLiteral" && wanted(v.value)) expr = call(v.value);
      if (v.type === "TemplateLiteral") {
        const t = templateToText(v);
        if (t && wanted(t.text.replace(/\{\{\w+\}\}/g, ""))) expr = call(t.text, t.vars);
      }
      if (expr) edits.push([p.node.start, p.node.end, `get ${JSON.stringify(k).includes("-") ? JSON.stringify(k) : k}() { return ${expr}; }`]);
    },
    TemplateLiteral(p) {
      if (!toastArg(p) && !choiceInJsx(p)) return;
      const t = templateToText(p.node);
      if (!t || !wanted(t.text.replace(/\{\{\w+\}\}/g, ""))) return;
      edits.push([p.node.start, p.node.end, call(t.text, t.vars)]);
    },
  });

  // A list of options/cards: object literals nested in arrays or objects that end up in a variable,
  // a return value or JSX. Objects passed to calls (API bodies, analytics) are left alone.
  function displayList(objPath) {
    let q = objPath;
    while (q.parentPath && (q.parentPath.isObjectProperty() || q.parentPath.isObjectExpression() || q.parentPath.isArrayExpression())) q = q.parentPath;
    const top = q.parentPath;
    if (!top) return false;
    if (top.isVariableDeclarator() || top.isReturnStatement() || top.isJSXExpressionContainer()) return true;
    if (top.isArrowFunctionExpression() && q.key === "body") return true;
    if (top.isConditionalExpression() && q.key !== "test") return displayList(top);
    return false;
  }

  function toastArg(p) {
    const parent = p.parentPath;
    const isToast = (c) => c && c.isCallExpression() && (
      (c.node.callee.type === "Identifier" && c.node.callee.name === "toast")
      || (c.node.callee.type === "MemberExpression" && c.node.callee.object.name === "toast"));
    if (isToast(parent) && p.key === 0) return "toast";
    if (parent.isObjectProperty() && p.key === "value" && ["description", "label"].includes(parent.node.key.name)) {
      const obj = parent.parentPath;
      if (isToast(obj.parentPath)) return "toast";
      if (obj.parentPath.isObjectProperty() && isToast(obj.parentPath.parentPath.parentPath)) return "toast";
    }
    // `typeof d === "string" ? d : "fallback"` inside a toast call.
    let q = p;
    while (q.parentPath && (q.parentPath.isConditionalExpression() || q.parentPath.isLogicalExpression())) {
      if (q.parentPath.isConditionalExpression() && q.key === "test") return null;
      q = q.parentPath;
    }
    return q !== p && isToast(q.parentPath) && q.key === 0 ? "toast" : null;
  }

  if (!edits.length) return 0;
  edits.sort((a, b) => b[0] - a[0]);
  let out = code;
  let last = Infinity;
  for (const [s, e, r] of edits) {
    if (e > last) continue;
    out = out.slice(0, s) + r + out.slice(e);
    last = s;
  }
  if (!/import\s*\{[^}]*\btx\b[^}]*\}\s*from\s*["']@\/i18n\/tx["']/.test(out)) {
    const imports = [...out.matchAll(/^import[\s\S]*?from\s*["'][^"']+["'];?[ \t]*$/gm)];
    const at = imports.length ? imports.at(-1).index + imports.at(-1)[0].length : 0;
    out = at ? `${out.slice(0, at)}\nimport { tx } from "@/i18n/tx";${out.slice(at)}` : `import { tx } from "@/i18n/tx";\n\n${out}`;
  }
  fs.writeFileSync(file, out);
  return edits.length;
}

const walk = (p) => (fs.statSync(p).isDirectory()
  ? fs.readdirSync(p).flatMap((n) => walk(path.join(p, n)))
  : (/\.jsx?$/.test(p) && !/\.test\./.test(p) ? [p] : []));

if (require.main === module) {
  let total = 0;
  for (const f of process.argv.slice(2).flatMap(walk)) {
    const n = wrapFile(f);
    if (n) console.log(`${n}\t${path.relative(process.cwd(), f)}`);
    total += n;
  }
  console.log(`${total} lines wrapped`);
}
module.exports = { wrapFile, slugOf };
