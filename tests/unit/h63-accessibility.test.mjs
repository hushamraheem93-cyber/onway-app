/**
 * H-63 (ORIGINAL) — accessibility of the Admin / Vendor / Driver surfaces.
 *
 * Measured before the fix, over the three surfaces:
 *
 *     interactive controls                        307
 *       named EXPLICITLY (accessibilityLabel)       5   ← 1.6 %
 *       named only by rendered text               179
 *       named only by a TextInput placeholder      63
 *       NOT NAMEABLE AT ALL                        58
 *     accessibilityRole on a pressable              6 / 234
 *     accessibilityHint                             0
 *     accessibilityState                            1
 *
 * 46 of the 58 were icon-only: a screen reader announced "button" and nothing
 * else. Among them both tabs of the driver's own tab bar — the surface a driver
 * works one-handed — and the delete buttons in every admin list.
 *
 * The checks below are not greps. Two kinds run here:
 *
 *   • the real DriverTabBar and AdminTabBar are lifted out of their .tsx by AST,
 *     transpiled, and EXECUTED against a recording JSX factory, so the assertions
 *     read the props a screen reader would actually receive — and press the tabs
 *     to prove navigation still works;
 *   • the whole surface is parsed and every interactive control is resolved to
 *     how it gets its name, which is what keeps a new unnamed icon button from
 *     being added later.
 *
 * The analyser deliberately resolves locally-defined wrapper components
 * (`<StatCard onPress=… />`): the wrapper's own <Pressable> is analysed at its
 * definition and already renders text, so counting the call site too would both
 * double-count and report a control that reads perfectly well.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../..");

// ── surface discovery ────────────────────────────────────────────────────────
function walkDir(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkDir(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const surfaceOf = (p) => {
  const r = relative(ROOT, p).replace(/\\/g, "/");
  if (/client\/screens\/admin\//.test(r) || /Admin\w*Screen\.tsx$/.test(r))
    return "Admin";
  if (/\/Vendor\w+Screen\.tsx$/.test(r) || /VendorTabNavigator/.test(r))
    return "Vendor";
  if (
    /\/Driver\w+Screen\.tsx$/.test(r) ||
    /DriverTabNavigator|DriverRatingModal/.test(r)
  )
    return "Driver";
  return null;
};
const FILES = walkDir(join(ROOT, "client")).filter(surfaceOf).sort();

// ── AST helpers ──────────────────────────────────────────────────────────────
const HOST_INTERACTIVE = new Set([
  "Pressable",
  "AnimatedPressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
  "Button",
  "Switch",
  "TextInput",
  "Picker",
  "Slider",
  "Checkbox",
  "RadioButton",
]);
const PRESSABLE = new Set([
  "Pressable",
  "AnimatedPressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
]);
const TEXTY = /^(Text|ThemedText|Title|Label|Heading)$/;
const ICONISH =
  /^(Feather|Ionicons|MaterialCommunityIcons|MaterialIcons|FontAwesome\d?|AntDesign|Entypo|Octicons|Image|Icon|ActivityIndicator)$/;

const srcOf = (f) => readFileSync(f, "utf8");
const parse = (f) =>
  ts.createSourceFile(
    f,
    srcOf(f),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
const tagName = (n, sf) =>
  (ts.isJsxSelfClosingElement(n) ? n : n.openingElement).tagName.getText(sf);
const attrsOf = (n, sf) => {
  const e = ts.isJsxSelfClosingElement(n) ? n : n.openingElement;
  const m = new Map();
  for (const a of e.attributes.properties)
    if (ts.isJsxAttribute(a) && a.name) m.set(a.name.getText(sf), a);
  return m;
};
function localComponents(sf) {
  const names = new Set();
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text))
      names.add(n.name.text);
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      /^[A-Z]/.test(n.name.text)
    )
      names.add(n.name.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}
function hasAnnouncedText(node, sf) {
  let f = false;
  const visit = (n) => {
    if (f) return;
    if (ts.isJsxText(n) && n.getText(sf).trim()) {
      f = true;
      return;
    }
    if (ts.isJsxElement(n)) {
      const t = tagName(n, sf);
      if (TEXTY.test(t) || /Text$/.test(t))
        if (n.children.some((c) => !ts.isJsxText(c) || c.getText(sf).trim()))
          f = true;
      if (ICONISH.test(t)) return;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(node, visit);
  return f;
}

function controlsIn(file) {
  const sf = parse(file);
  const local = localComponents(sf);
  const out = [];
  const visit = (n) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = tagName(n, sf);
      const attrs = attrsOf(n, sf);
      const isHost = HOST_INTERACTIVE.has(tag);
      const isLocalWrapper = local.has(tag) && !isHost;
      if ((isHost || attrs.has("onPress")) && !isLocalWrapper) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        const labelAttr =
          attrs.get("accessibilityLabel") ?? attrs.get("aria-label");
        out.push({
          file: relative(ROOT, file).replace(/\\/g, "/"),
          line: line + 1,
          tag,
          explicit: !!labelAttr,
          labelText: labelAttr?.initializer?.getText(sf) ?? "",
          text: ts.isJsxElement(n) ? hasAnnouncedText(n, sf) : false,
          placeholder: tag === "TextInput" && attrs.has("placeholder"),
          placeholderText:
            attrs.get("placeholder")?.initializer?.getText(sf) ?? "",
          role:
            attrs.get("accessibilityRole")?.initializer?.getText(sf) ?? null,
          hint: attrs.has("accessibilityHint"),
          state:
            attrs.get("accessibilityState")?.initializer?.getText(sf) ?? null,
          onPress: attrs.get("onPress")?.initializer?.getText(sf) ?? "",
          hasDisabled: attrs.has("disabled"),
          surface: surfaceOf(file),
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const ALL = FILES.flatMap(controlsIn);
const named = (c) =>
  c.explicit || c.text || c.placeholder || (c.tag === "Button" && c.labelText);

// ── lift a component out of its file and RUN it ──────────────────────────────
function liftComponent(file, names) {
  const sf = parse(file);
  const src = srcOf(file);
  const parts = [];
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && names.includes(n.name.text))
      parts.push(n.getText(sf));
    if (
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && names.includes(d.name.text),
      )
    )
      parts.push(n.getText(sf));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  assert.ok(parts.length, `none of ${names} found in ${file}`);
  void src;
  // Lifted into a plain function body — `export`/`export default` cannot appear.
  return parts.map((p) => p.replace(/^export\s+(default\s+)?/, "")).join("\n");
}

/** Records the element tree instead of rendering it. */
const h = (type, props, ...kids) => ({
  type: typeof type === "string" ? type : type?.name || "Component",
  props: props || {},
  kids: kids.flat(),
});
function flatten(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => flatten(n, out));
    return out;
  }
  if (node.type) out.push(node);
  (node.kids || []).forEach((k) => flatten(k, out));
  return out;
}
const compile = (body, params) =>
  new Function(
    "h",
    ...params,
    ts.transpileModule(body, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        jsxFactory: "h",
      },
    }).outputText,
  );

const anyProxy = (v = "x") =>
  new Proxy({}, { get: (_, k) => (k === Symbol.toPrimitive ? () => v : v) });

// ═══════════════════════════════════════════════════════════════════════════
describe("H-63 (A) — the driver tab bar, executed", () => {
  const FILE = join(ROOT, "client/navigation/DriverTabNavigator.tsx");
  const body =
    liftComponent(FILE, ["TAB_CONFIG"]) +
    "\n" +
    liftComponent(FILE, ["DriverTabBar"]) +
    "\nreturn DriverTabBar;";

  const routes = [
    { key: "k-profile", name: "DriverProfileTab" },
    { key: "k-earn", name: "DriverEarningsTab" },
    { key: "k-home", name: "DriverHomeTab" },
    { key: "k-orders", name: "DriverOrdersTab" },
  ];

  function render(focusedIndex) {
    const navigated = [];
    const emitted = [];
    const env = {
      View: "View",
      Pressable: "Pressable",
      Feather: "Feather",
      StyleSheet: { create: (o) => o },
      useSafeAreaInsets: () => ({ bottom: 0 }),
      useTheme: () => ({ theme: { backgroundDefault: "#fff" }, isDark: false }),
      AppColors: anyProxy("#000"),
      Haptics: { impactAsync() {}, ImpactFeedbackStyle: { Light: 1 } },
      styles: anyProxy({}),
    };
    const keys = Object.keys(env);
    const DriverTabBar = compile(body, keys)(h, ...keys.map((k) => env[k]));
    const tree = DriverTabBar({
      state: { index: focusedIndex, routes },
      descriptors: {},
      navigation: {
        emit: (e) => {
          emitted.push(e);
          return { defaultPrevented: false };
        },
        navigate: (n) => navigated.push(n),
      },
    });
    const tabs = flatten(tree).filter((n) => n.type === "Pressable");
    return { tabs, navigated, emitted };
  }

  test("every tab is announced by name", () => {
    const { tabs } = render(2);
    assert.equal(tabs.length, 4, "expected one pressable per route");
    const labels = tabs.map((t) => t.props.accessibilityLabel);
    assert.deepEqual(labels, ["حسابي", "الأرباح", "الرئيسية", "الطلبات"]);
    for (const l of labels) assert.ok(l && l.trim(), "a tab has an empty name");
  });

  test("every tab declares the tab role", () => {
    const { tabs } = render(0);
    for (const t of tabs)
      assert.equal(
        t.props.accessibilityRole,
        "tab",
        "a tab is not announced as a tab",
      );
  });

  test("exactly the focused tab reports selected — including the centre home tab", () => {
    for (let i = 0; i < routes.length; i++) {
      const { tabs } = render(i);
      const sel = tabs.map((t) => !!t.props.accessibilityState?.selected);
      assert.deepEqual(
        sel,
        routes.map((_, j) => j === i),
        `focus on index ${i} was not reflected in accessibilityState`,
      );
    }
  });

  test("selection is not conveyed by the active dot alone", () => {
    // The dot is a plain <View>; it carries no accessible information at all.
    const { tabs } = render(3);
    const focused = tabs[3];
    assert.equal(focused.props.accessibilityState.selected, true);
    const dots = flatten(focused).filter((n) => n.type === "View");
    assert.ok(dots.every((d) => !d.props.accessibilityLabel));
  });

  test("pressing a tab still navigates — the fix did not break the handler", () => {
    const { tabs, navigated, emitted } = render(2);
    tabs[3].props.onPress();
    assert.deepEqual(navigated, ["DriverOrdersTab"]);
    assert.equal(emitted[0].type, "tabPress");
  });

  test("pressing the already-focused tab still does not re-navigate", () => {
    const { tabs, navigated } = render(2);
    tabs[2].props.onPress();
    assert.deepEqual(navigated, [], "focused tab should not re-navigate");
  });
});

describe("H-63 (B) — the admin tab bar, executed", () => {
  const FILE = join(ROOT, "client/screens/admin/AdminTabBar.tsx");
  // AdminTabBar is React.memo(AdminTabBarInner); the inner function is what renders.
  const body =
    liftComponent(FILE, ["AdminTabBarInner"]) + "\nreturn AdminTabBarInner;";

  function render(activeTab, tabs) {
    const selected = [];
    const env = {
      View: "View",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      StyleSheet: { create: (o) => o },
      Feather: "Feather",
      ThemedText: "ThemedText",
      AppColors: anyProxy("#000"),
      styles: anyProxy({}),
      useTheme: () => ({ theme: { textSecondary: "#888" } }),
      Spacing: anyProxy(4),
      // memo is identity here, so calling the lifted binding runs the component
      // itself rather than returning a memo wrapper.
      React: { memo: (f) => f, Fragment: "Fragment" },
    };
    const keys = Object.keys(env);
    const AdminTabBar = compile(body, keys)(h, ...keys.map((k) => env[k]));
    const tree = AdminTabBar({
      tabs,
      activeTab,
      onSelect: (k) => selected.push(k),
      accent: "#f00",
      theme: { textSecondary: "#888" },
    });
    return {
      nodes: flatten(tree).filter((n) => n.type === "Pressable"),
      selected,
    };
  }

  const TABS = [
    { key: "dashboard", label: "لوحة التحكم", icon: "grid" },
    { key: "orders", label: "الطلبات", icon: "package", badge: 12 },
    { key: "vendors", label: "المتاجر", icon: "briefcase" },
  ];

  test("each tab declares the tab role and its selected state", () => {
    const { nodes } = render("orders", TABS);
    assert.equal(nodes.length, 3);
    assert.deepEqual(
      nodes.map((n) => n.props.accessibilityRole),
      ["tab", "tab", "tab"],
    );
    assert.deepEqual(
      nodes.map((n) => !!n.props.accessibilityState?.selected),
      [false, true, false],
    );
  });

  test("a tab without a badge keeps its visible text as the name, not a duplicate label", () => {
    // Rule: do not add an accessibilityLabel where the rendered text already names
    // the control correctly.
    const { nodes } = render("dashboard", TABS);
    assert.equal(nodes[0].props.accessibilityLabel, undefined);
    assert.equal(nodes[2].props.accessibilityLabel, undefined);
  });

  test("a badge count is spelled out instead of read as a bare number", () => {
    const { nodes } = render("dashboard", TABS);
    assert.equal(nodes[1].props.accessibilityLabel, "الطلبات، 12 جديد");
  });

  test("selecting a tab still calls onSelect with its key", () => {
    const { nodes, selected } = render("dashboard", TABS);
    nodes[2].props.onPress();
    assert.deepEqual(selected, ["vendors"]);
  });
});

describe("H-63 (C) — no control is left without an accessible name", () => {
  test("every interactive control on all three surfaces can be named", () => {
    const unnamed = ALL.filter((c) => !named(c));
    assert.deepEqual(
      unnamed.map((c) => `${c.file}:${c.line} <${c.tag}>`),
      [],
      "a screen reader would announce these as an unlabelled control",
    );
  });

  test("no icon-only pressable is left unnamed", () => {
    const bad = [];
    for (const file of FILES) {
      const sf = parse(file);
      const local = localComponents(sf);
      const visit = (n) => {
        if (ts.isJsxElement(n)) {
          const tag = tagName(n, sf);
          const attrs = attrsOf(n, sf);
          if (PRESSABLE.has(tag) && !local.has(tag) && attrs.has("onPress")) {
            const hasName =
              attrs.has("accessibilityLabel") || attrs.has("aria-label");
            if (!hasName && !hasAnnouncedText(n, sf)) {
              const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
              bad.push(`${relative(ROOT, file)}:${line + 1}`);
            }
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    assert.deepEqual(bad, []);
  });

  test("all three surfaces are actually covered by this suite", () => {
    const bySurface = {};
    for (const c of ALL) bySurface[c.surface] = (bySurface[c.surface] || 0) + 1;
    for (const s of ["Admin", "Vendor", "Driver"])
      assert.ok(bySurface[s] > 25, `${s} looks under-scanned: ${bySurface[s]}`);
    assert.ok(FILES.length >= 30, `only ${FILES.length} files scanned`);
  });

  test("no accessibilityLabel is blank or a placeholder for one", () => {
    const bad = ALL.filter(
      (c) => c.explicit && /^["'`]\s*["'`]$/.test(c.labelText.trim()),
    );
    assert.deepEqual(
      bad.map((c) => `${c.file}:${c.line}`),
      [],
    );
  });
});

describe("H-63 (D) — every pressable announces that it is a button", () => {
  test("no Pressable/Touchable with an onPress is missing a role", () => {
    const bad = ALL.filter((c) => PRESSABLE.has(c.tag) && c.onPress && !c.role);
    assert.deepEqual(
      bad.map((c) => `${c.file}:${c.line} <${c.tag}>`),
      [],
      "without a role the text is read but never announced as actionable",
    );
  });

  test("the tab bars use the tab role, not button", () => {
    const tabFiles = [
      "client/navigation/DriverTabNavigator.tsx",
      "client/navigation/VendorTabNavigator.tsx",
      "client/screens/admin/AdminTabBar.tsx",
    ];
    for (const f of tabFiles) {
      const roles = ALL.filter((c) => c.file === f).map((c) => c.role);
      assert.ok(
        roles.some((r) => r && r.includes("tab")),
        `${f} has no control with the tab role`,
      );
    }
  });
});

describe("H-63 (E) — destructive actions name what they destroy", () => {
  const DESTRUCTIVE =
    /confirmDelete|handleDelete|removeImage|removeVariant|removeAddon|handleRejectBatch|onDelete|deleteProductImage/;

  test("each destructive control has an explicit label", () => {
    const acts = ALL.filter((c) => DESTRUCTIVE.test(c.onPress));
    assert.ok(
      acts.length >= 12,
      `only ${acts.length} destructive controls found`,
    );
    const unlabelled = acts.filter((c) => !c.explicit);
    assert.deepEqual(
      unlabelled.map((c) => `${c.file}:${c.line}`),
      [],
      "a delete button read only as 'button' is the worst case of H-63",
    );
  });

  test("a delete in a repeated row names its row, not just the verb", () => {
    // Twenty identical "حذف" buttons in a list are as useless as none.
    const rowDeletes = ALL.filter((c) => /confirmDelete\(/.test(c.onPress));
    assert.ok(rowDeletes.length >= 5);
    for (const c of rowDeletes) {
      assert.match(
        c.labelText,
        /\$\{/,
        `${c.file}:${c.line} uses a constant label for a per-row delete`,
      );
    }
  });

  test("the admin row deletes explain that a confirmation follows", () => {
    const rowDeletes = ALL.filter((c) => /confirmDelete\(/.test(c.onPress));
    for (const c of rowDeletes)
      assert.ok(c.hint, `${c.file}:${c.line} has no accessibilityHint`);
  });

  test("a destructive control that CAN be disabled says so", () => {
    // Scoped to the ones that actually carry a `disabled` prop: a control that is
    // never disabled has no state to report, and demanding one would be noise.
    const guarded = ALL.filter(
      (c) => DESTRUCTIVE.test(c.onPress) && c.hasDisabled,
    );
    assert.ok(
      guarded.length >= 3,
      `only ${guarded.length} guarded destructive controls`,
    );
    for (const c of guarded)
      assert.ok(
        c.state,
        `${c.file}:${c.line} greys out but never announces that it is disabled`,
      );
  });
});

describe("H-63 (F) — text inputs", () => {
  const inputs = ALL.filter((c) => c.tag === "TextInput");

  test("every input has a name", () => {
    const bad = inputs.filter((c) => !c.explicit && !c.placeholder);
    assert.deepEqual(
      bad.map((c) => `${c.file}:${c.line}`),
      [],
    );
  });

  test("an input whose placeholder is an example or a bare value has a real label", () => {
    // "مثال: أحمد" / "5000" / "09:00" / "YYYY-MM-DD" name nothing.
    const WEAK = [
      /^["'`]مثال/,
      /^["'`]\d+["'`]$/,
      /^["'`]\d{2}:\d{2}["'`]$/,
      /YYYY-MM-DD/,
      /^["'`]0 =/,
    ];
    const weak = inputs.filter((c) =>
      WEAK.some((re) => re.test(c.placeholderText.trim())),
    );
    assert.ok(weak.length >= 15, `only ${weak.length} weak placeholders found`);
    const unlabelled = weak.filter((c) => !c.explicit);
    assert.deepEqual(
      unlabelled.map((c) => `${c.file}:${c.line} ${c.placeholderText}`),
      [],
    );
  });

  test("inputs whose placeholder already names the field were left alone", () => {
    // Rule 5: no duplicate labels. This is the counter-check to the test above.
    const plain = inputs.filter(
      (c) =>
        !c.explicit &&
        c.placeholder &&
        !/مثال|\d{2}:\d{2}|YYYY/.test(c.placeholderText),
    );
    assert.ok(
      plain.length > 20,
      "the fix looks like it labelled everything blindly",
    );
  });
});

describe("H-63 (G) — toggles report their state", () => {
  test("the working-hours switch is a switch and reports checked", () => {
    const sw = ALL.find((c) =>
      /setSettingsUseHours\(!settingsUseHours\)/.test(c.onPress),
    );
    assert.ok(sw, "the hand-built working-hours toggle disappeared");
    assert.equal(sw.role, '"switch"');
    assert.match(sw.state, /checked/);
    assert.ok(sw.explicit, "the sibling text never named this control");
  });

  test("the availability chips report selected, disabled and busy", () => {
    const chip = ALL.find(
      (c) =>
        c.file.endsWith("VendorHomeScreen.tsx") &&
        /availChip/.test(c.onPress + c.state) === false &&
        c.state &&
        /selected/.test(c.state),
    );
    assert.ok(chip, "no control on VendorHomeScreen reports a selected state");
    assert.match(chip.state, /disabled/);
    assert.match(chip.state, /busy/);
  });

  test("the star rating names each star and marks the ones that count", () => {
    const star = ALL.find((c) => /setStars\(n\)/.test(c.onPress));
    assert.ok(star, "the rating stars moved");
    assert.ok(star.explicit, "five identical unnamed buttons");
    assert.match(star.labelText, /\$\{n\}/);
    assert.match(star.state, /selected/);
  });

  test("native Switches are named but not given a redundant checked state", () => {
    // RN's Switch already reports its value; duplicating it invites drift.
    const switches = ALL.filter((c) => c.tag === "Switch");
    assert.ok(switches.length >= 2);
    for (const s of switches) {
      assert.ok(s.explicit, `${s.file}:${s.line} Switch has no name`);
      assert.equal(
        s.state,
        null,
        `${s.file}:${s.line} duplicates the native state`,
      );
    }
  });
});

describe("H-63 (H) — the fix did not touch behaviour", () => {
  test("no control lost its onPress", () => {
    const withRole = ALL.filter((c) => PRESSABLE.has(c.tag) && c.role);
    assert.ok(withRole.length > 150);
    for (const c of withRole)
      assert.ok(c.onPress, `${c.file}:${c.line} has a role but no handler`);
  });

  test("labels are plain strings or template literals, never calls", () => {
    // An accessible name must not be able to throw or fire a side effect.
    const bad = ALL.filter(
      (c) => c.explicit && /=>|await |\.then\(/.test(c.labelText),
    );
    assert.deepEqual(
      bad.map((c) => `${c.file}:${c.line}`),
      [],
    );
  });

  test("Pickers are named without altering their values", () => {
    const pickers = ALL.filter((c) => c.tag === "Picker");
    assert.ok(pickers.length >= 5);
    for (const p of pickers)
      assert.ok(p.explicit, `${p.file}:${p.line} Picker has no name`);
  });
});
