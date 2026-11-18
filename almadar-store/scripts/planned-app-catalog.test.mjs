import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("planned applications are clearly disclosed and do not link to non-existent workflows", () => {
  const source = readFileSync(new URL("../src/components/planned-app-catalog.tsx", import.meta.url), "utf8");
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX });
  const componentModule = { exports: {} };
  new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), componentModule, componentModule.exports);
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.PlannedAppCatalog));
  assert.match(html, /هذه التطبيقات غير مفعّلة/);
  assert.match(html, /الربط المخطط/);
  assert.match(html, /عروض الأسعار/);
  assert.match(html, /التحصيل والمتابعة/);
  assert.match(html, /التصنيع والتجميع/);
  assert.match(html, /الأوامر الإدارية/);
  assert.match(html, /توجيه الأوامر ومتابعتها وفق التسلسل الإداري للمنشأة/);
  assert.match(html, /زيارات المندوبين/);
  assert.match(html, /مطابقة موقع الزيارة بموقع العميل/);
  assert.doesNotMatch(html, /<a\b/);
});
