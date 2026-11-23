// Workflow visualizer and workflow job output graph.
//
// A port of the old UI's screens/Template/WorkflowJobTemplateVisualizer,
// components/Workflow and screens/Job/WorkflowOutput. The graph is laid out
// with dagre using the same constants and drawn as the same SVG; pan and
// zoom reproduce d3-zoom's behaviour by hand. The node prompts reuse the
// launch wizard from templates.js (ASCENDER.promptWizard).
(function () {
  "use strict";
  var A = window.ASCENDER || {};
  var U = A.ui;
  if (!U) return;
  var api = U.api, esc = U.esc, el = U.el, $ = U.$, $$ = U.$$;
  var IC = window.ASCENDER_WF_ICONS || {};
  if (!IC.times && U.ICON) IC.times = U.ICON.times;
  if (!IC.close && U.ICON) IC.close = U.ICON.close;
  if (!IC["exclamation-circle"] && U.ICON) IC["exclamation-circle"] = U.ICON.warn;
  var STATUS_ICON = IC.status || {};
  var C = { nodeW: 180, nodeH: 60, rootW: 72, rootH: 40 };

  // ------------------------------------------------------------------ helpers
  function isUUID(s) { return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function secondsToHHMMSS(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    return pad2(Math.floor(sec / 3600)) + ":" + pad2(Math.floor(sec / 60) % 60) + ":" + pad2(sec % 60);
  }
  function has(o, k) { return o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k); }
  function toTitleCase(s) { return String(s || "").split("_").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" "); }
  function sortedIds(list) { return (list || []).map(function (x) { return x.id; }); }
  function getAddedAndRemoved(original, current) {
    var before = original || [], after = current || [], added = [], removed = [];
    before.forEach(function (o) { if (!after.some(function (c) { return c.id === o.id; })) removed.push(o); });
    after.forEach(function (c) { if (!before.some(function (o) { return o.id === c.id; })) added.push(c); });
    return { added: added, removed: removed };
  }
  // req rejects on an error status, the way the axios calls in the old
  // save did, so one failed request fails the save.
  function req(method, url, body) {
    return api(method, url, body).then(function (r) {
      if (!r.ok) { var e = new Error(method + " " + url + " " + r.status); e.response = r; throw e; }
      return r.data;
    });
  }
  function readAll(url) {
    var out = [];
    function page(u) { return req("GET", u).then(function (d) { out = out.concat(d.results || []); return d.next ? page(d.next) : out; }); }
    return page(url);
  }
  function yamlDump(obj) {
    var CM = window.AscenderCM;
    try { if (CM && CM.jsyaml) return CM.jsyaml.dump(obj); } catch (e) { /* fall through */ }
    return JSON.stringify(obj, null, 2);
  }
  function errorDetail(err) {
    var r = err && err.response;
    if (!r) return String(err && err.message || err || "");
    var d = r.data;
    var text = typeof d === "string" ? d : JSON.stringify(d);
    return (r.status ? r.status + " " : "") + (text || "");
  }

  // ------------------------------------------------------------- modals
  var openModals = [];
  function modalBox(o) {
    var root = $("#ascender-modal-root") || document.body;
    var cls = "pf-v6-c-modal-box" + (o.size ? " pf-m-" + o.size : "");
    var style = o.width ? ' style="--pf-v6-c-modal-box--Width: ' + o.width + 'px;"' : "";
    var header = o.header || '<h1 class="pf-v6-c-modal-box__title"><span class="pf-v6-c-modal-box__title-text">' + esc(o.title) + "</span></h1>";
    var m = el('<div class="pf-v6-c-backdrop" data-wf-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(o.label || o.title || "") + '" aria-modal="true" class="' + cls + '"' + style + '><div class="pf-v6-c-modal-box__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-wf-close><span class="pf-v6-c-button__icon">' + ((IC.close || IC.times) || "&times;") + '</span></button></div><header class="pf-v6-c-modal-box__header">' + header + '</header><div class="pf-v6-c-modal-box__body" data-wf-body></div>' + (o.footer ? '<footer class="pf-v6-c-modal-box__footer">' + o.footer + "</footer>" : "") + "</div></div></div>");
    var body = $("[data-wf-body]", m);
    if (typeof o.body === "string") body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    m._onClose = o.onClose;
    $("[data-wf-close]", m).addEventListener("click", function () { closeBox(m, true); });
    root.appendChild(m);
    openModals.push(m);
    document.body.classList.add("pf-v6-c-backdrop__open");
    $("[data-wf-close]", m).focus();
    return m;
  }
  function closeBox(m, viaDismiss) {
    if (!m || !m.parentNode) return;
    m.remove();
    openModals = openModals.filter(function (x) { return x !== m; });
    if (!document.querySelector(".pf-v6-c-backdrop:not([hidden])")) document.body.classList.remove("pf-v6-c-backdrop__open");
    if (viaDismiss && m._onClose) m._onClose();
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openModals.length) closeBox(openModals[openModals.length - 1], true);
  });
  function alertModal(o) {
    var icons = { danger: IC["exclamation-circle"], error: IC["times-circle"], warning: IC["exclamation-triangle"] };
    var colors = { danger: "danger", error: "danger", warning: "warning" };
    var icon = o.variant ? (icons[o.variant] || "").replace("<svg ", '<svg style="color: var(--pf-t--global--color--status--' + colors[o.variant] + '--default);" ') : "";
    return modalBox({ size: "sm", label: o.label || t("Alert modal"), header: '<div class="ascender-alert-modal__header">' + icon + '<h2 id="alert-modal-header-label" class="pf-v6-c-title pf-m-2xl">' + esc(o.title) + "</h2></div>", body: o.body, footer: o.footer, onClose: o.onClose });
  }
  function button(id, label, variant, text, extra) {
    return '<button id="' + id + '" aria-label="' + esc(label) + '" class="pf-v6-c-button pf-m-' + variant + '" type="button"' + (extra || "") + '><span class="pf-v6-c-button__text">' + esc(text) + "</span></button>";
  }
  function helpButton(text) {
    return '<span class="pf-v6-c-form__group-label-help"><div style="display: contents;"><button aria-label="' + esc(t("More information")) + '" aria-haspopup="true" class="ascender-popover__button pf-v6-c-form__group-label-help" type="button" data-popover="' + esc(text) + '">' + (IC["question-circle"] || "?") + "</button></div></span>";
  }
  function formGroup(id, label, control, o) {
    o = o || {};
    return '<div class="pf-v6-c-form__group"' + (o.cy ? ' data-cy="' + o.cy + '"' : "") + '><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="' + id + '"><span class="pf-v6-c-form__label-text">' + esc(label) + "</span>" + (o.required ? '<span class="pf-v6-c-form__label-required" aria-hidden="true">&nbsp;*</span>' : "") + "</label>&nbsp;&nbsp;" + (o.help ? helpButton(o.help) : "") + '</div><div class="pf-v6-c-form__group-control">' + control + "</div></div>";
  }
  function selectControl(id, options, value, extra) {
    return '<span class="pf-v6-c-form-control"><select id="' + id + '" aria-label="' + esc(t("Select Input")) + '" aria-invalid="false"' + (extra || "") + ">" + options.map(function (o) { return '<option class="" value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + '</select><span class="pf-v6-c-form-control__utilities"><span class="pf-v6-c-form-control__toggle-icon">' + (IC["caret-down"] || "") + "</span></span></span>";
  }
  function textControl(id, value, o) {
    o = o || {};
    var invalid = !!o.invalid;
    return '<span class="pf-v6-c-form-control' + (invalid ? " pf-m-error" : "") + (o.cls ? " " + o.cls : "") + '"><input id="' + id + '"' + (o.label ? ' aria-label="' + esc(o.label) + '"' : "") + ' aria-invalid="' + invalid + '"' + (o.required ? " required" : "") + ' type="' + (o.type || "text") + '" value="' + esc(value) + '"' + (o.name ? ' name="' + o.name + '"' : "") + (o.attrs || "") + ">" + (invalid ? '<span class="pf-v6-c-form-control__utilities"><span class="pf-v6-c-form-control__icon pf-m-status">' + (IC["exclamation-circle"] || "") + "</span></span>" : "") + "</span>";
  }
  function spinner() {
    return '<div class="pf-v6-c-empty-state"><div class="pf-v6-c-empty-state__content"><div class="pf-v6-c-empty-state__header"><div class="pf-v6-c-empty-state__icon"><svg class="pf-v6-c-spinner pf-m-xl" role="progressbar" viewBox="0 0 100 100" aria-label="Contents"><circle class="pf-v6-c-spinner__path" cx="50" cy="50" r="45" fill="none"></circle></svg></div></div></div></div>';
  }

  // ---------------------------------------------------- graph model & layout
  // generateNodesAndLinks from workflowReducer.ts: chart node 1 is START,
  // API nodes get ids from 2 up, and nodes nobody links to hang off START.
  function generateNodesAndLinks(apiNodes, startLabel) {
    var nodes = [{ id: 1, fullUnifiedJobTemplate: { name: startLabel || "START" } }];
    var byApi = {}, counter = 2, allIds = [];
    apiNodes.forEach(function (n) {
      var obj = { id: counter, originalNodeObject: n };
      var ujt = n.summary_fields && n.summary_fields.unified_job_template;
      if (ujt && ujt.unified_job_type === "workflow_approval") obj.fullUnifiedJobTemplate = Object.assign({}, ujt, { type: "workflow_approval_template" });
      nodes.push(obj);
      byApi[n.id] = obj;
      allIds.push(n.id);
      counter++;
    });
    var links = [], nonRoot = {};
    apiNodes.forEach(function (n) {
      var src = byApi[n.id];
      [["success_nodes", "success"], ["failure_nodes", "failure"], ["always_nodes", "always"]].forEach(function (k) {
        (n[k[0]] || []).forEach(function (tid) { if (byApi[tid]) { links.push({ source: src, target: byApi[tid], linkType: k[1] }); nonRoot[tid] = true; } });
      });
      (n.condition_nodes || []).forEach(function (tid) {
        if (!byApi[tid]) return;
        var edge = (n.condition_edges || []).filter(function (e) { return e.id === tid; })[0];
        links.push({ source: src, target: byApi[tid], linkType: "condition", linkCondition: edge && { trigger: edge.trigger, artifact_key: edge.artifact_key, operator: edge.operator, expected_value: edge.expected_value } });
        nonRoot[tid] = true;
      });
    });
    allIds.forEach(function (id) { if (!nonRoot[id]) links.push({ source: nodes[0], target: byApi[id], linkType: "always" }); });
    return { nodes: nodes, links: links, nextNodeId: counter };
  }

  function layoutGraph(nodes, links) {
    var g = new window.dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 120 });
    g.setDefaultEdgeLabel(function () { return {}; });
    nodes.forEach(function (n) {
      g.setNode(String(n.id), { label: "", width: n.id === 1 ? C.rootW : C.nodeW, height: n.id === 1 ? C.rootH : C.nodeH });
    });
    links.forEach(function (l) { g.setEdge(String(l.source.id), String(l.target.id)); });
    window.dagre.layout(g);
    var pos = {};
    g.nodes().forEach(function (id) { pos[Number(id)] = g.node(id); });
    return pos;
  }

  function linePoints(link, pos) {
    var s = pos[link.source.id], t = pos[link.target.id], r = pos[1];
    var sx = s.x + s.width + 1, sy = s.y - r.y + s.height / 2;
    var tx = t.x - 1, ty = t.y - r.y + t.height / 2;
    if (link.source.id === 1) sy += 10;
    return [{ x: sx, y: sy }, { x: tx, y: ty }];
  }
  function lineD(p) { return "M" + p[0].x + "," + p[0].y + "L" + p[1].x + "," + p[1].y; }
  function overlayPoints(link, pos) {
    var p = linePoints(link, pos), sx = p[0].x, sy = p[0].y, tx = p[1].x, ty = p[1].y;
    var slope = (ty - sy) / (tx - sx), b = ty - slope * tx, d = 8 * Math.sqrt(1 + slope * slope);
    return [[tx, slope * tx + b + d], [sx, slope * sx + b + d], [sx, slope * sx + b - d], [tx, slope * tx + b - d]].map(function (q) { return q.join(","); }).join(" ");
  }
  var LINK_COLORS = {
    failure: "var(--pf-t--global--color--status--danger--default)",
    success: "var(--pf-t--global--color--status--success--default)",
    // Always is blue, as the legend has it: the brand colour it was is
    // green in the Ascender themes, the same as success.
    always: "var(--ascender-workflow-always-link-color)",
    condition: "var(--pf-t--global--color--status--warning--default)"
  };
  function linkStroke(l) { return LINK_COLORS[l.linkType] || "var(--pf-t--global--border--color--default)"; }

  function nodeTemplate(node) {
    return node.fullUnifiedJobTemplate || (node.originalNodeObject && node.originalNodeObject.summary_fields && node.originalNodeObject.summary_fields.unified_job_template);
  }
  function typeLetter(node) {
    var u = nodeTemplate(node);
    if (!u) return null;
    var job = node.originalNodeObject && node.originalNodeObject.summary_fields && node.originalNodeObject.summary_fields.job;
    var t = u.type || u.unified_job_type || (job && job.type);
    switch (t) {
      case "job_template": case "job": return "JT";
      case "project": case "project_update": return "P";
      case "inventory_source": case "inventory_update": return "I";
      case "system_job_template": case "system_job": return "M";
      case "workflow_job_template": case "workflow_job": return "W";
      case "workflow_approval_template": case "workflow_approval": return (IC.pause || "").replace("<svg ", '<svg class="ascender-workflow-node-type-letter__centered-pause-icon" ');
    }
    return "";
  }
  function typeLetterHTML(node) {
    var l = typeLetter(node);
    if (l === null) return "";
    return '<foreignObject y="50" x="-10" height="20" width="20"><div class="ascender-workflow-node-type-letter__letter" id="node-' + node.id + '-type-letter">' + (l.charAt(0) === "<" ? l : esc(l)) + "</div></foreignObject>";
  }
  function nodeName(node) {
    var o = node.originalNodeObject;
    if (node.identifier && node.identifier !== "") return node.identifier;
    if (node.identifier !== "" && o && o.identifier && !isUUID(o.identifier)) return o.identifier;
    var u = nodeTemplate(node);
    return (node.fullUnifiedJobTemplate && node.fullUnifiedJobTemplate.name) || (u && u.name) || t("DELETED");
  }
  function nodeConverges(node) {
    return has(node, "all_parents_must_converge") ? node.all_parents_must_converge : !!(node.originalNodeObject && node.originalNodeObject.all_parents_must_converge);
  }
  function convergenceHTML(fill, stroke, labelCls) {
    return '<rect style="fill: ' + fill + "; stroke: " + stroke + ';" height="' + C.nodeH / 4 + '" rx="2" ry="2" x="' + (C.nodeW / 2 - C.nodeW / 10) + '" y="' + (-C.nodeH / 4 + 2) + '" stroke-width="2px" width="' + C.nodeW / 5 + '"></rect><foreignObject height="' + C.nodeH / 4 + '" width="' + C.nodeW / 5 + '" x="' + (C.nodeW / 2 - C.nodeW / 10 + 7) + '" y="' + (-C.nodeH / 4 - 1) + '"><p class="' + labelCls + '" data-cy="convergence-label">' + esc(t("ALL")) + '</p></foreignObject>';
  }
  function startNodeHTML(pos, inert) {
    return '<g id="node-1"' + (inert ? ' class="ascender-workflow-start-node__start-g--inert"' : "") + ' transform="translate(' + pos[1].x + ',0)"><foreignObject class="ascender-workflow-start-node__foreign-object" height="1" width="1" y="10" style="overflow: visible;"><div class="ascender-workflow-start-node__div">' + esc(t("START")) + '</div></foreignObject></g>';
  }
  function tooltipHTML(actions, x, y) {
    var h = 25 * actions.length + 5 * actions.length - 1 + 10;
    return '<foreignObject x="' + x + '" y="' + (Number(y) - h / 2) + '" width="52" height="' + h + '" data-wf-action-tooltip><div class="ascender-workflow-action-tooltip__contents"><div class="ascender-workflow-action-tooltip__arrow"><div class="ascender-workflow-action-tooltip__arrow-outer"></div><div class="ascender-workflow-action-tooltip__arrow-inner"></div></div><div class="ascender-workflow-action-tooltip__actions">' +
      actions.map(function (a) { return '<button type="button" class="ascender-workflow-action-tooltip-item__item" id="' + a.id + '" data-cy="' + a.id + '" aria-label="' + esc(a.label) + '" data-help="' + esc(a.help || a.label) + '">' + (IC[a.icon] || "") + "</button>"; }).join("") + "</div></div></foreignObject>";
  }
  function bindTooltip(fo, actions, setHelp) {
    actions.forEach(function (a) {
      var b = $("#" + a.id, fo);
      if (!b) return;
      b.addEventListener("mouseenter", function () { setHelp(a.help || a.label); });
      b.addEventListener("mouseleave", function () { setHelp(null); });
      b.addEventListener("focus", function () { setHelp(a.help || a.label); });
      b.addEventListener("blur", function () { setHelp(null); });
      b.addEventListener("click", function (e) { e.stopPropagation(); setHelp(null); a.onClick(); });
    });
  }

  // Help box, legend and tools (WorkflowHelp, WorkflowLegend, WorkflowTools).
  function nodeHelpHTML(node) {
    var o = node.originalNodeObject || {};
    var job = o.summary_fields && o.summary_fields.job;
    var u = nodeTemplate(node);
    var identifier = node.identifier ? node.identifier : (o.identifier && !isUUID(o.identifier) ? o.identifier : null);
    var nodeType = "";
    if (u || job) {
      var typ = u ? (u.unified_job_type || u.type) : job.type;
      nodeType = { job_template: t("Job Template"), job: t("Job Template"), workflow_job_template: t("Workflow Job Template"), workflow_job: t("Workflow Job Template"), project: t("Project Update"), project_update: t("Project Update"), inventory_source: t("Inventory Update"), inventory_update: t("Inventory Update"), workflow_approval_template: t("Workflow Approval"), workflow_approval: t("Workflow Approval"), system_job_template: t("Management Job"), system_job: t("Management Job") }[typ] || "";
    }
    var forced = o.forced_success ? { reason: o.forced_success_reason, jobId: o.summary_fields && o.summary_fields.forced_success_job && o.summary_fields.forced_success_job.id, by: o.summary_fields && o.summary_fields.forced_success_by && o.summary_fields.forced_success_by.username } : null;
    var STAT = { "new": t("New"), pending: t("Pending"), waiting: t("Waiting"), running: t("Running"), successful: t("Successful"), failed: t("Failed"), error: t("Error"), canceled: t("Canceled"), "never updated": t("Never Updated"), ok: t("OK"), missing: t("Missing"), none: t("None"), updating: t("Updating") };
    var h = "";
    if (!u && (!job || job.type !== "workflow_approval")) h += '<p class="ascender-workflow-node-help__resource-deleted' + (job ? " ascender-workflow-node-help__resource-deleted--has-job" : "") + '">' + (IC["exclamation-triangle"] || "").replace("<svg ", '<svg class="ascender-workflow-node-help__styled-exclamation-triangle-icon" ') + esc(t("The resource associated with this node has been deleted.")) + "</p>";
    function row(label, id, value) { return "<dt><b>" + esc(label) + '</b></dt><dd id="' + id + '">' + esc(value) + "</dd>"; }
    if (job) {
      h += '<dl class="ascender-workflow-node-help__grid-dl">' + (identifier ? row(t("Node Alias"), "workflow-node-help-alias", identifier) : "") + row(t("Resource Name"), "workflow-node-help-name", (u && u.name) || t("Deleted")) + row(t("Type"), "workflow-node-help-type", nodeType) + row(t("Job Status"), "workflow-node-help-status", STAT[job.status] || "") + (typeof job.elapsed === "number" ? row(t("Elapsed"), "workflow-node-help-elapsed", secondsToHHMMSS(job.elapsed)) : "") + "</dl>";
    }
    if ((u || forced) && !job) {
      h += '<dl class="ascender-workflow-node-help__grid-dl">' + (identifier ? row(t("Node Alias"), "workflow-node-help-alias", identifier) : "") + row(t("Resource Name"), "workflow-node-help-name", (u && u.name) || t("Deleted")) + row(t("Type"), "workflow-node-help-type", nodeType) +
        (forced ? row(t("Job Status"), "workflow-node-help-status", t("Failed, forced as successful")) + row(t("Forced by"), "workflow-node-help-forced-by", forced.by || t("Deleted")) + row(t("Reason"), "workflow-node-help-forced-reason", forced.reason) : "") + "</dl>";
    }
    if (forced && forced.jobId) h += '<p class="ascender-workflow-node-help__margin-top-10">' + esc(t("Click to view the job that failed")) + '</p>';
    if (job && job.type !== "workflow_approval") h += '<p class="ascender-workflow-node-help__margin-top-10">' + esc(t("Click to view job details")) + '</p>';
    return h;
  }
  function linkHelpHTML(link) {
    var types = { always: t("Always"), success: t("On Success"), failure: t("On Failure"), condition: t("On Condition") };
    var c = link.linkCondition;
    var trig = c && c.trigger === "failure" ? t("On Failure") : c && c.trigger === "always" ? t("Always") : t("On Success");
    var h = '<dl class="ascender-workflow-link-help__grid-dl"><dt><b>' + esc(t("Run")) + '</b></dt><dd id="workflow-link-help-type">' + esc(types[link.linkType] || "") + "</dd>";
    if (link.linkType === "condition" && c) h += '<dt><b>' + esc(t("Evaluate on")) + '</b></dt><dd id="workflow-link-help-trigger">' + esc(trig) + '</dd><dt><b>' + esc(t("Condition")) + '</b></dt><dd id="workflow-link-help-condition">' + esc(c.artifact_key + " " + (c.operator === "ne" ? "!=" : "==") + " " + c.expected_value) + "</dd>";
    return h + "</dl>";
  }
  function legendHTML() {
    function li(inner, label) { return "<li>" + inner + "<span>" + esc(label) + "</span></li>"; }
    function letter(x) { return '<div class="ascender-workflow-legend__node-type-letter">' + x + "</div>"; }
    function link(c) { return '<div class="ascender-workflow-legend__link ascender-workflow-legend__' + c + '-link"></div>'; }
    return '<div class="ascender-workflow-legend__wrapper"><div class="ascender-workflow-legend__header"><b>' + esc(t("Legend")) + '</b>' + (IC.times || "").replace("<svg ", '<svg class="ascender-workflow-legend__close" data-wf-legend-close ') + '</div><ul class="ascender-workflow-legend__legend">' +
      li(letter("JT"), t("Job Template")) + li(letter("W"), t("Workflow")) + li(letter("I"), t("Inventory Sync")) + li(letter("P"), t("Project Sync")) + li(letter("M"), t("Management Job")) + li(letter(IC.pause || ""), t("Approval")) +
      li((IC["exclamation-triangle"] || "").replace("<svg ", '<svg class="ascender-workflow-legend__styled-exclamation-triangle-icon" '), t("Warning")) +
      li(link("success"), t("On Success")) + li(link("failure"), t("On Failure")) + li(link("always"), t("Always")) + li(link("condition"), t("On Condition")) + "</ul></div>";
  }
  function toolsHTML(zoomPct) {
    function b(icon, cls, tipText, pos, act) { return '<div style="display: contents;"><button class="pf-v6-c-button pf-m-tertiary' + (cls ? " " + cls : "") + '" type="button" data-tooltip="' + esc(tipText) + '" data-tooltip-pos="' + pos + '" aria-label="' + esc(tipText) + '" data-wf-tool="' + act + '"><span class="pf-v6-c-button__icon">' + (IC[icon] || "") + "</span></button></div>"; }
    return '<div class="ascender-workflow-tools__wrapper"><div class="ascender-workflow-tools__header"><b>' + esc(t("Tools")) + '</b>' + (IC.times || "").replace("<svg ", '<svg class="ascender-workflow-tools__close" data-wf-tools-close ') + '</div><div class="ascender-workflow-tools__tools">' +
      b("desktop", "ascender-workflow-tools__margin-right-30", t("Fit the graph to the available screen size"), "bottom", "fit") +
      b("minus", "ascender-workflow-tools__margin-right-10", t("Zoom Out"), "bottom", "out") +
      '<input id="zoom-slider" max="200" min="10" step="10" type="range" value="' + zoomPct + '">' +
      b("plus", "ascender-workflow-tools__margin-0-25-0-10", t("Zoom In"), "bottom", "in") +
      '<div class="ascender-workflow-tools__pan">' + b("caret-left", "ascender-workflow-tools__margin-right-10", t("Pan Left"), "left", "left") +
      '<div class="ascender-workflow-tools__pan-center">' + b("caret-up", "ascender-workflow-tools__margin-bottom-10", t("Pan Up"), "top", "up") + b("home", "", t("Set zoom to 100% and center graph"), "top", "home") + b("caret-down", "ascender-workflow-tools__margin-top-10", t("Pan Down"), "bottom", "down") + "</div>" +
      b("caret-right", "ascender-workflow-tools__margin-left-10", t("Pan Right"), "right", "right") + "</div></div></div>";
  }

  // GraphView owns the svg, the help box and the legend/tools panel, and
  // implements d3-zoom's pan and zoom (scale extent 0.1 to 2) by hand.
  function GraphView(container, opts) {
    var self = this;
    this.opts = opts;
    this.t = { k: 1, x: 0, y: 0 };
    this.help = el("<div data-wf-help></div>");
    this.svg = el('<svg class="' + opts.svgClass + '" id="workflow-svg"></svg>');
    this.svg.innerHTML = (opts.defs ? '<defs><marker class="WorkflowChart-noPointerEvents" id="workflow-triangle" markerHeight="6" markerUnits="strokeWidth" markerWidth="6" orient="auto" refX="10" viewBox="0 -5 10 10"><path d="M0,-5L10,0L0,5" style="fill: var(--pf-t--global--border--color--default);"></path></marker></defs><rect height="100%" id="workflow-background" opacity="0" width="100%"></rect>' : '<rect width="100%" height="100%" opacity="0"></rect>') + '<g id="workflow-g"></g>';
    this.bg = this.svg.querySelector("rect");
    this.g = this.svg.querySelector("#workflow-g");
    this.panel = el('<div class="' + opts.panelClass + '"></div>');
    container.appendChild(this.help);
    container.appendChild(this.svg);
    container.appendChild(this.panel);
    this.showLegend = false; this.showTools = false;
    this.apply();
    // wheel zoom about the cursor
    this.svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = self.svg.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      var delta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1);
      self.zoomAbout(px, py, self.t.k * Math.pow(2, delta));
    }, { passive: false });
    this.svg.addEventListener("dblclick", function (e) {
      if (e.target.closest("button, [data-wf-action-tooltip]")) return;
      var r = self.svg.getBoundingClientRect();
      self.zoomAbout(e.clientX - r.left, e.clientY - r.top, self.t.k * (e.shiftKey ? 0.5 : 2));
    });
    var drag = null;
    this.svg.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || e.target.closest("button, input, [data-wf-action-tooltip]")) return;
      drag = { sx: e.clientX, sy: e.clientY, x: self.t.x, y: self.t.y, moved: false };
    });
    window.addEventListener("mousemove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      drag.moved = true;
      self.set(drag.x + dx, drag.y + dy, self.t.k);
    });
    window.addEventListener("mouseup", function () {
      if (drag && drag.moved) {
        // a drag is not a click on whatever it ended over
        var stop = function (ev) { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener("click", stop, true); };
        window.addEventListener("click", stop, true);
        setTimeout(function () { window.removeEventListener("click", stop, true); }, 0);
      }
      drag = null;
    });
    this.panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-wf-tool]");
      if (b) { self.tool(b.getAttribute("data-wf-tool")); return; }
      if (e.target.closest("[data-wf-legend-close]")) { self.opts.onToggle("legend"); return; }
      if (e.target.closest("[data-wf-tools-close]")) { self.opts.onToggle("tools"); }
    });
    this.panel.addEventListener("input", function (e) {
      if (e.target.id === "zoom-slider") self.zoomTo(parseInt(e.target.value, 10) / 100);
    });
  }
  GraphView.prototype.apply = function () {
    this.g.setAttribute("transform", "translate(" + this.t.x + "," + this.t.y + ") scale(" + this.t.k + ")");
    var s = $("#zoom-slider", this.panel);
    if (s) s.value = this.t.k * 100;
  };
  GraphView.prototype.set = function (x, y, k) { this.t = { x: x, y: y, k: k }; this.apply(); };
  GraphView.prototype.zoomAbout = function (px, py, k) {
    k = Math.min(2, Math.max(0.1, k));
    var t = this.t;
    this.set(px - (px - t.x) * k / t.k, py - (py - t.y) * k / t.k, k);
  };
  GraphView.prototype.rect = function () { var r = this.svg.getBoundingClientRect(); return { width: r.width, height: r.height }; };
  // getScaleAndOffsetToFit
  GraphView.prototype.fit = function () {
    var k0 = this.t.k, gr = this.g.getBoundingClientRect(), bb = this.g.getBBox(), sr = this.rect();
    var gh = gr.height / k0, gw = gr.width / k0 + C.rootW;
    var lower = Math.min(sr.height / gh, sr.width / gw), k, y;
    if (!isFinite(lower)) lower = 1;
    if (lower < 0.1 || lower > 2) { k = lower < 0.1 ? 0.1 : 2; y = sr.height / 2 - (C.nodeH * k) / 2; }
    else { k = Math.floor(lower * 1000) / 1000; y = (sr.height - gh * k) / 2 - (bb.y / k0) * k; }
    this.set(0, y, k);
  };
  // getTranslatePointsForZoom
  GraphView.prototype.zoomTo = function (k) {
    var sr = this.rect(), t = this.t;
    var ux = (t.x + (sr.width * t.k - sr.width) / 2) / t.k, uy = (t.y + (sr.height * t.k - sr.height) / 2) / t.k;
    this.set(ux * k - (k * sr.width - sr.width) / 2, uy * k - (k * sr.height - sr.height) / 2, k);
  };
  GraphView.prototype.tool = function (act) {
    var pct = this.t.k * 100, t = this.t;
    switch (act) {
      case "fit": this.fit(); break;
      case "in": var up = Math.ceil((pct + 10) / 10) * 10; this.zoomTo((up < 200 ? up : 200) / 100); break;
      case "out": var dn = Math.floor((pct - 10) / 10) * 10; this.zoomTo((dn > 10 ? dn : 10) / 100); break;
      case "home": this.set(0, this.rect().height / 2 - 30, 1); break;
      case "up": this.set(t.x, t.y - 50, t.k); break;
      case "down": this.set(t.x, t.y + 50, t.k); break;
      case "left": this.set(t.x - 50, t.y, t.k); break;
      case "right": this.set(t.x + 50, t.y, t.k); break;
    }
  };
  GraphView.prototype.renderPanel = function () {
    this.panel.innerHTML = (this.showTools ? toolsHTML(this.t.k * 100) : "") + (this.showLegend ? legendHTML() : "");
  };
  GraphView.prototype.setHelp = function (html) {
    this.help.innerHTML = html ? '<div class="ascender-workflow-help__outer"><div class="ascender-workflow-help__inner">' + html + "</div></div>" : "";
  };
  GraphView.prototype.toPoint = function (e) {
    var r = this.svg.getBoundingClientRect(), t = this.t;
    return { x: (e.clientX - r.left) / t.k - t.x / t.k, y: (e.clientY - r.top) / t.k - t.y / t.k };
  };

  // ================================================================ visualizer
  var vroot = $("[data-wf-visualizer]");
  if (vroot && window.dagre) initVisualizer(vroot);

  function initVisualizer(root) {
    var templateId = root.getAttribute("data-template-id");
    var templateName = root.getAttribute("data-template-name");
    var templateOrg = parseInt(root.getAttribute("data-template-org"), 10) || null;
    var readOnly = root.getAttribute("data-read-only") === "true";
    var isSuperuser = root.getAttribute("data-superuser") === "true";
    var detailsURL = root.getAttribute("data-details-url");
    var wrapper = $("[data-wf-wrapper]", root), toolbar = $("[data-wf-toolbar]", root), loading = $("[data-wf-loading]", root);
    // The old FullPage was portalled to the end of the body; modals still
    // have to stack above it, so it goes just before the modal root.
    var mroot = $("#ascender-modal-root");
    if (mroot && mroot.parentNode) mroot.parentNode.insertBefore(root, mroot); else document.body.appendChild(root);

    var S = {
      nodes: [], links: [], nextNodeId: 0, defaultOrganization: null,
      addingLink: false, addLinkSourceNode: null, unsavedChanges: false,
      showLegend: false, showTools: false
    };
    var view = null, startScreen = null, pos = null;

    function totalNodes() { return S.nodes.reduce(function (n, x) { return n + (x.isDeleted ? 0 : 1); }, 0) - 1; }
    function setHelp(h) { if (view) view.setHelp(h ? (h.charAt(0) === "<" ? h : "<p>" + esc(h) + "</p>") : null); }

    // ------------------------------------------------------------ toolbar
    var tbLegend = $("#visualizer-toggle-legend", toolbar), tbTools = $("#visualizer-toggle-tools", toolbar);
    var tbLaunch = $("#visualizer-launch", toolbar), tbDeleteAll = $("#visualizer-delete-all", toolbar);
    function renderToolbar() {
      var total = totalNodes();
      $("#visualizer-total-nodes-badge", toolbar).textContent = total;
      tbLegend.disabled = total === 0; tbTools.disabled = total === 0;
      tbLegend.classList.toggle("pf-m-active", total > 0 && S.showLegend);
      tbTools.classList.toggle("pf-m-active", total > 0 && S.showTools);
      if (tbLaunch) tbLaunch.disabled = S.unsavedChanges || total === 0;
      if (tbDeleteAll) tbDeleteAll.disabled = total === 0;
    }
    tbLegend.addEventListener("click", function () { S.showLegend = !S.showLegend; render(); });
    tbTools.addEventListener("click", function () { S.showTools = !S.showTools; render(); });
    if (tbDeleteAll) tbDeleteAll.addEventListener("click", deleteAllModal);
    var tbSave = $("#visualizer-save", toolbar);
    if (tbSave) tbSave.addEventListener("click", save);
    $("#visualizer-close", toolbar).addEventListener("click", function () {
      if (S.unsavedChanges) unsavedModal(); else location.href = detailsURL;
    });

    // ------------------------------------------------------------ rendering
    function render() {
      renderToolbar();
      if (S.links.length === 0) {
        if (view) { view.help.remove(); view.svg.remove(); view.panel.remove(); view = null; }
        if (!startScreen) {
          startScreen = el('<div class="ascender-visualizer-start-screen__flex-1"><div class="ascender-visualizer-start-screen__panel-wrapper"><div class="ascender-visualizer-start-screen__panel">' + (readOnly ? "<p>" + esc(t("This workflow does not have any nodes configured.")) + "</p>" : '<p>' + esc(t("Please click the Start button to begin.")) + '</p><button id="visualizer-start" aria-label="' + esc(t("Start")) + '" class="pf-v6-c-button pf-m-primary ascender-visualizer-start-screen__button" type="button"><span class="pf-v6-c-button__text">' + esc(t("Start")) + '</span></button>') + "</div></div></div>");
          wrapper.appendChild(startScreen);
          var sb = $("#visualizer-start", startScreen);
          if (sb) sb.addEventListener("click", function () { startAddNode(1); });
        }
        return;
      }
      if (startScreen) { startScreen.remove(); startScreen = null; }
      var mounting = !view;
      if (mounting) {
        view = new GraphView(wrapper, { svgClass: "ascender-visualizer-graph__workflow-svg", panelClass: "ascender-visualizer-graph__position-top", defs: true, onToggle: function (w) { if (w === "legend") S.showLegend = !S.showLegend; else S.showTools = !S.showTools; render(); } });
        bindBackground();
      }
      // VisualizerGraph fitted on mount, before the node positions existed,
      // so it measured an empty group and opened at the 2x zoom limit.
      if (mounting) view.fit();
      pos = layoutGraph(S.nodes.filter(function (n) { return !n.isDeleted; }), S.links);
      drawGraph();
      view.showLegend = S.showLegend; view.showTools = S.showTools; view.renderPanel();
    }

    function bindBackground() {
      view.bg.addEventListener("mousemove", function (e) { if (S.addingLink) drawPotentialLinkTo(view.toPoint(e)); });
      view.bg.addEventListener("mouseover", function () { if (S.addingLink) setHelp(esc(t("Click an available node to create a new link.  Click outside the graph to cancel."))); });
      view.bg.addEventListener("mouseout", function () { if (S.addingLink) setHelp(null); });
      view.bg.addEventListener("click", function () { if (S.addingLink) { setHelp(null); cancelLink(); } });
    }
    function drawPotentialLinkTo(pt) {
      var line = $("#workflow-potentialLink", view.svg);
      if (!line || !S.addLinkSourceNode) return;
      var s = pos[S.addLinkSourceNode.id];
      line.setAttribute("points", (s.x + C.nodeW) + "," + (s.y - pos[1].y + C.nodeH / 2) + " " + pt.x + "," + pt.y);
      line.parentNode.appendChild(line);
    }

    function drawGraph() {
      var g = view.g, html = "";
      S.links.forEach(function (l) {
        if (!pos[l.source.id] || !pos[l.target.id]) return;
        var id = "link-" + l.source.id + "-" + l.target.id, pts = overlayPoints(l, pos);
        html += '<g id="' + id + '"' + (S.addingLink ? ' class="ascender-visualizer-link__link-g--inert"' : "") + '><polygon id="' + id + '-background" opacity="0" points="' + pts + '" style="fill: var(--pf-t--global--background--color--200);"></polygon><path stroke="' + linkStroke(l) + '" stroke-width="2px" d="' + lineD(linePoints(l, pos)) + '"></path><polygon id="' + id + '-overlay" opacity="0" points="' + pts + '"></polygon></g>';
      });
      S.nodes.forEach(function (n) {
        if (n.id <= 1 || n.isDeleted || !pos[n.id]) return;
        var p = pos[n.id], isSource = S.addLinkSourceNode && S.addLinkSourceNode.id === n.id;
        var cls = [n.job && "ascender-visualizer-node__node-g--has-job", isSource && "ascender-visualizer-node__node-g--inert"].filter(Boolean).join(" ");
        html += '<g id="node-' + n.id + '" class="' + cls + '" transform="translate(' + p.x + "," + (p.y - pos[1].y) + ')">' +
          (nodeConverges(n) ? convergenceHTML("var(--pf-t--global--border--color--default)", "var(--pf-t--global--border--color--default)", "ascender-visualizer-node__convergence-label") : "") +
          '<rect height="' + C.nodeH + '" rx="2" ry="2" stroke-width="2px" width="' + C.nodeW + '" style="fill: var(--ascender-workflow-node-bg); stroke: var(--pf-t--global--border--color--default);" data-wf-node-rect></rect>' +
          '<foreignObject height="58" width="178" x="1" y="1" data-wf-node-body><div class="ascender-visualizer-node__contents' + (n.isInvalidLinkTarget ? " ascender-visualizer-node__contents--invalid-link-target" : "") + '"><p class="ascender-visualizer-node__resource-name" id="node-' + n.id + '-name">' + esc(nodeName(n)) + "</p></div></foreignObject>" +
          typeLetterHTML(n) + "</g>";
      });
      html += startNodeHTML(pos, S.addingLink);
      if (S.addingLink) html += '<polyline class="ascender-visualizer-graph__potential-link" id="workflow-potentialLink" marker-end="url(#workflow-triangle)" style="stroke: var(--pf-t--global--border--color--default);" stroke-dasharray="5,5" stroke-width="2"></polyline>';
      g.innerHTML = html;
      S.links.forEach(function (l) { var e = $("#link-" + l.source.id + "-" + l.target.id, g); if (e) bindLink(e, l); });
      S.nodes.forEach(function (n) { var e = n.id > 1 && !n.isDeleted && $("#node-" + n.id, g); if (e) bindNode(e, n); });
      bindStart($("#node-1", g));
    }

    function bindLink(gEl, link) {
      var bgPoly = gEl.firstChild, overlay = gEl.lastChild;
      gEl.addEventListener("mouseenter", function () {
        var start = $("#node-1", view.g);
        if (start) gEl.parentNode.insertBefore(gEl, start);
        bgPoly.setAttribute("opacity", "1");
        if (readOnly || S.addingLink) return;
        var p = linePoints(link, pos);
        var add = { id: "link-add-node", label: t("Add a node between these two"), help: t("Add a new node between these two nodes"), icon: "plus", onClick: function () { startAddNode(link.source.id, link.target.id); } };
        var actions = link.source.id === 1 ? [add] : [add,
          { id: "link-edit", label: t("Edit this link"), icon: "pencil-alt", onClick: function () { linkModal(t("Edit Link"), link, function (type, cond) { updateLink(link, type, cond); }); } },
          { id: "link-delete", label: t("Delete this link"), icon: "trash-alt", onClick: function () { linkDeleteModal(link); } }];
        gEl.insertAdjacentHTML("beforeend", tooltipHTML(actions, (p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2));
        bindTooltip(gEl.lastChild, actions, setHelp);
      });
      gEl.addEventListener("mouseleave", function () {
        gEl.parentNode.insertBefore(gEl, gEl.parentNode.firstChild);
        bgPoly.setAttribute("opacity", "0");
        var tt = $("[data-wf-action-tooltip]", gEl); if (tt) tt.remove();
      });
      overlay.addEventListener("mouseenter", function () { setHelp(linkHelpHTML(link)); });
      overlay.addEventListener("mouseleave", function () { setHelp(null); });
    }

    function bindNode(gEl, node) {
      var rect = $("[data-wf-node-rect]", gEl), body = $("[data-wf-node-body]", gEl);
      var conv = gEl.firstChild && gEl.firstChild.tagName === "rect" && !gEl.firstChild.hasAttribute("data-wf-node-rect") ? gEl.firstChild : null;
      function hoverStroke(on) {
        var c = on && S.addingLink && !node.isInvalidLinkTarget ? "var(--pf-t--global--color--brand--default)" : "var(--pf-t--global--border--color--default)";
        rect.style.stroke = c;
        if (conv) { conv.style.fill = c; conv.style.stroke = c; }
      }
      gEl.addEventListener("mouseenter", function () {
        gEl.parentNode.appendChild(gEl);
        hoverStroke(true);
        if (S.addingLink) {
          setHelp(esc(node.isInvalidLinkTarget ? t("Invalid link target. Unable to link to children or ancestor nodes. Graph cycles are not supported.") : t("Click to create a new link to this node.")));
          if (node.id !== S.addLinkSourceNode.id) {
            var tp = pos[node.id];
            var line = $("#workflow-potentialLink", view.svg), s = pos[S.addLinkSourceNode.id];
            if (line) { line.setAttribute("points", (s.x + C.nodeW) + "," + (s.y - pos[1].y + C.nodeH / 2) + " " + tp.x + "," + (tp.y - pos[1].y + C.nodeH / 2)); line.parentNode.appendChild(line); }
          }
          return;
        }
        var details = { id: "node-details", label: t("View node details"), icon: "info", onClick: function () { withNodeDetails(node, nodeViewModal); } };
        var actions = readOnly ? [details] : [
          { id: "node-add", label: t("Add a new node"), icon: "plus", onClick: function () { startAddNode(node.id); } },
          details,
          { id: "node-edit", label: t("Edit this node"), icon: "pencil-alt", onClick: function () { withNodeDetails(node, function (n) { nodeWizard({ title: t("Edit Node"), askLinkType: false, node: n }); }); } },
          { id: "node-link", label: t("Link to an available node"), icon: "link", onClick: function () { selectSourceForLinking(node); } },
          { id: "node-delete", label: t("Delete this node"), icon: "trash-alt", onClick: function () { nodeDeleteModal(node); } }];
        gEl.insertAdjacentHTML("beforeend", tooltipHTML(actions, C.nodeW, C.nodeH / 2));
        bindTooltip(gEl.lastChild, actions, setHelp);
      });
      gEl.addEventListener("mouseleave", function () {
        hoverStroke(false);
        if (S.addingLink) setHelp(null);
        var tt = $("[data-wf-action-tooltip]", gEl); if (tt) tt.remove();
      });
      body.addEventListener("mouseenter", function () { if (!S.addingLink) setHelp(nodeHelpHTML(node)); });
      body.addEventListener("mouseleave", function () { if (!S.addingLink) setHelp(null); });
      body.addEventListener("click", function () {
        if (S.addingLink && !node.isInvalidLinkTarget && !(S.addLinkSourceNode && S.addLinkSourceNode.id === node.id)) {
          var target = node;
          linkModal(t("Add Link"), null, function (type, cond) { createLink(target, type, cond); }, true);
        }
      });
    }

    function bindStart(gEl) {
      if (!gEl) return;
      gEl.addEventListener("mouseenter", function () {
        gEl.parentNode.appendChild(gEl);
        if (readOnly || S.addingLink) return;
        var d = $(".ascender-workflow-start-node__div", gEl);
        var actions = [{ id: "node-add", label: t("Add a new node"), icon: "plus", onClick: function () { startAddNode(1); } }];
        gEl.insertAdjacentHTML("beforeend", tooltipHTML(actions, d.offsetWidth, d.offsetHeight / 2 + 10));
        bindTooltip(gEl.lastChild, actions, setHelp);
      });
      gEl.addEventListener("mouseleave", function () { var tt = $("[data-wf-action-tooltip]", gEl); if (tt) tt.remove(); });
    }

    // ------------------------------------------------------------ reducer
    function startAddNode(sourceId, targetId) {
      setHelp(null);
      nodeWizard({ title: t("Add Node"), askLinkType: sourceId !== 1, addSource: sourceId, addTarget: targetId || null });
    }
    function createNode(n, addSource, addTarget) {
      var id = S.nextNodeId;
      S.nodes.push({ id: id, fullUnifiedJobTemplate: n.nodeResource, isInvalidLinkTarget: false, promptValues: n.promptValues, all_parents_must_converge: n.all_parents_must_converge, max_retries: n.max_retries, identifier: n.identifier });
      if (addSource === 1) n.linkType = "always";
      var link = { source: { id: addSource }, target: { id: id }, linkType: n.linkType };
      if (n.linkType === "condition") link.linkCondition = n.linkCondition;
      S.links.push(link);
      if (addTarget) S.links.forEach(function (l) { if (l.source.id === addSource && l.target.id === addTarget) l.source = { id: id }; });
      S.nextNodeId = id + 1;
      S.unsavedChanges = true;
      render();
    }
    function updateNode(node, edited) {
      node.all_parents_must_converge = edited.all_parents_must_converge;
      node.max_retries = edited.max_retries;
      node.fullUnifiedJobTemplate = edited.nodeResource;
      node.isEdited = true;
      node.launchConfig = edited.launchConfig;
      node.identifier = edited.identifier;
      if (edited.promptValues) node.promptValues = edited.promptValues; else delete node.promptValues;
      S.unsavedChanges = true;
      render();
    }
    function cancelLink() {
      S.nodes.forEach(function (n) { n.isInvalidLinkTarget = false; });
      S.addLinkSourceNode = null; S.addingLink = false;
      render();
    }
    function selectSourceForLinking(source) {
      setHelp(null);
      var parentMap = {}, invalid = [];
      S.links.forEach(function (l) {
        if (l.source.id === 1) return;
        if (l.source.id === source.id) invalid.push(l.target.id);
        if (!parentMap[l.target.id]) parentMap[l.target.id] = { parents: [], traversed: false };
        parentMap[l.target.id].parents.push(l.source.id);
      });
      (function ancestors(id) {
        var e = parentMap[id];
        if (e && !e.traversed) { e.parents.forEach(function (p) { invalid.push(p); ancestors(p); }); e.traversed = true; }
      })(source.id);
      S.nodes.forEach(function (n) { if (invalid.indexOf(n.id) >= 0) n.isInvalidLinkTarget = true; });
      S.addLinkSourceNode = source; S.addingLink = true;
      render();
    }
    function createLink(target, linkType, cond) {
      var src = S.addLinkSourceNode;
      if (!src) return;
      S.nodes.forEach(function (n) { n.isInvalidLinkTarget = false; });
      var l = { source: { id: src.id }, target: { id: target.id }, linkType: linkType };
      if (linkType === "condition") l.linkCondition = cond;
      S.links.push(l);
      S.links = S.links.filter(function (x) { return !(x.source.id === 1 && x.target.id === target.id); });
      S.addLinkSourceNode = null; S.addingLink = false; S.unsavedChanges = true;
      render();
    }
    function updateLink(link, linkType, cond) {
      S.links.forEach(function (l) {
        if (l.source.id === link.source.id && l.target.id === link.target.id) {
          l.linkType = linkType;
          if (linkType === "condition") l.linkCondition = cond; else delete l.linkCondition;
        }
      });
      S.unsavedChanges = true;
      render();
    }
    function deleteLink(link) {
      var parents = {};
      S.links.forEach(function (l) { (parents[l.target.id] = parents[l.target.id] || []).push(l.source.id); });
      var convergence = (parents[link.target.id] || []).length > 1;
      S.links = S.links.filter(function (l) { return !(l.source.id === link.source.id && l.target.id === link.target.id); });
      if (!convergence) S.links.push({ source: { id: 1 }, target: { id: link.target.id }, linkType: "always" });
      S.unsavedChanges = true;
      render();
    }
    function deleteNode(node) {
      node.isDeleted = true;
      var nodeId = node.id, parents = [], children = [], mapping = {}, links = S.links.slice();
      for (var i = links.length; i--;) {
        var l = links[i];
        if (!l) continue;
        (mapping[l.target.id] = mapping[l.target.id] || []).push(l.source.id);
        if (l.source.id === nodeId || l.target.id === nodeId) {
          if (l.source.id === nodeId) children.push({ id: l.target.id, linkType: l.linkType, linkCondition: l.linkCondition });
          else parents.push(l.source.id);
          links.splice(i, 1);
        }
      }
      parents.forEach(function (p) {
        children.forEach(function (c) {
          if (p === 1) {
            if ((mapping[c.id] || []).length === 1) links.push({ source: { id: p }, target: { id: c.id }, linkType: "always" });
          } else if ((mapping[c.id] || []).indexOf(p) < 0) {
            var nl = { source: { id: p }, target: { id: c.id }, linkType: c.linkType };
            if (c.linkType === "condition") nl.linkCondition = c.linkCondition;
            links.push(nl);
          }
        });
      });
      S.links = links;
      S.unsavedChanges = true;
      render();
    }
    function deleteAllNodes() {
      S.addLinkSourceNode = null; S.addingLink = false; S.links = [];
      S.nodes.forEach(function (n) { if (n.id !== 1) n.isDeleted = true; });
      S.unsavedChanges = true;
      render();
    }

    // ------------------------------------------------------------ simple modals
    function deleteAllModal() {
      var m = alertModal({ variant: "danger", title: t("Remove All Nodes"), body: "<p>" + esc(t("Are you sure you want to remove all the nodes in this workflow?")) + "</p>",
        footer: button("confirm-delete-all-nodes", t("Confirm removal of all nodes"), "danger", t("Remove")) + button("cancel-delete-all-nodes", t("Cancel node removal"), "link", t("Cancel")) });
      $("#confirm-delete-all-nodes", m).addEventListener("click", function () { closeBox(m); deleteAllNodes(); });
      $("#cancel-delete-all-nodes", m).addEventListener("click", function () { closeBox(m); });
    }
    function unsavedModal() {
      var m = modalBox({ width: 600, title: t("Warning: Unsaved Changes"), label: t("Unsaved changes modal"), body: "<p>" + esc(t("Are you sure you want to exit the Workflow Creator without saving your changes?")) + "</p>",
        footer: button("confirm-exit-without-saving", t("Exit Without Saving"), "danger", t("Exit Without Saving")) + button("confirm-save-and-exit", t("Save & Exit"), "primary", t("Save & Exit")) });
      $("#confirm-exit-without-saving", m).addEventListener("click", function () { location.href = detailsURL; });
      $("#confirm-save-and-exit", m).addEventListener("click", function () { closeBox(m); save(); });
    }
    function linkDeleteModal(link) {
      var parents = {};
      S.links.forEach(function (l) { (parents[l.target.id] = parents[l.target.id] || []).push(l.source.id); });
      var convergence = (parents[link.target.id] || []).length > 1;
      var m = alertModal({ variant: "danger", title: t("Remove Link"), body: "<p>" + esc(t("Are you sure you want to remove this link?")) + "</p>" + (convergence ? "" : "<br><p>" + esc(t("Removing this link will orphan the rest of the branch and cause it to be executed immediately on launch.")) + "</p>"),
        footer: button("confirm-link-removal", t("Confirm link removal"), "danger", t("Remove")) + button("cancel-link-removal", t("Cancel link removal"), "link", t("Cancel")) });
      $("#confirm-link-removal", m).addEventListener("click", function () { closeBox(m); deleteLink(link); });
      $("#cancel-link-removal", m).addEventListener("click", function () { closeBox(m); });
    }
    function nodeDeleteModal(node) {
      var o = node.originalNodeObject;
      var ident = o && o.identifier && !isUUID(o.identifier) ? o.identifier : node.identifier;
      var u = nodeTemplate(node);
      var name = ident || (u && u.name);
      var m = alertModal({ variant: "danger", title: t("Remove Node {nodeName}", { nodeName: name || "" }), body: u ? "<p>" + esc(t("Are you sure you want to remove the node below:")) + "</p><br><strong>" + esc(u.name) + "</strong>" : "<p>" + esc(t("Are you sure you want to remove this node?")) + "</p>",
        footer: button("confirm-node-removal", t("Confirm node removal"), "danger", t("Remove")) + button("cancel-node-removal", t("Cancel node removal"), "link", t("Cancel")) });
      $("#confirm-node-removal", m).addEventListener("click", function () { closeBox(m); deleteNode(node); });
      $("#cancel-node-removal", m).addEventListener("click", function () { closeBox(m); });
    }
    // LinkModal: Add Link / Edit Link. Cancelling an add also ends linking.
    function linkModal(header, link, onConfirm, isAdd) {
      var c = (link && link.linkCondition) || {};
      var st = { type: (link && link.linkType) || "success", trigger: c.trigger || "success", key: c.artifact_key || "", op: c.operator || "eq", val: c.expected_value || "" };
      var m = modalBox({ width: 600, label: t("Workflow link modal"), header: '<h1 class="pf-v6-c-title pf-m-xl">' + esc(header) + "</h1>", body: "<div data-wf-link-form></div>",
        footer: button("link-confirm", t("Save link changes"), "primary", t("Save")) + button("link-cancel", t("Cancel link changes"), "link", t("Cancel")),
        onClose: function () { if (isAdd) cancelLink(); } });
      var form = $("[data-wf-link-form]", m), ok = $("#link-confirm", m);
      function draw() {
        var h = formGroup("link-select", t("Run"), selectControl("link-select", [["always", t("Always")], ["success", t("On Success")], ["failure", t("On Failure")], ["condition", t("On Condition")]], st.type, ' name="linkType"'));
        if (st.type === "condition") h += conditionFields(st, true);
        form.innerHTML = h;
        ok.disabled = st.type === "condition" && st.key === "";
      }
      form.addEventListener("change", function (e) {
        if (e.target.id === "link-select") { st.type = e.target.value; draw(); }
        if (e.target.id === "link-condition-trigger") st.trigger = e.target.value;
        if (e.target.id === "link-condition-operator") st.op = e.target.value;
      });
      form.addEventListener("input", function (e) {
        if (e.target.id === "link-condition-artifact-key") {
          st.key = e.target.value; ok.disabled = st.key === "";
          var ctl = e.target.parentNode, bad = st.key === "";
          ctl.classList.toggle("pf-m-error", bad); e.target.setAttribute("aria-invalid", String(bad));
        }
        if (e.target.id === "link-condition-expected-value") st.val = e.target.value;
      });
      draw();
      $("#link-cancel", m).addEventListener("click", function () { closeBox(m); if (isAdd) cancelLink(); });
      ok.addEventListener("click", function () {
        closeBox(m);
        onConfirm(st.type, st.type === "condition" ? { trigger: st.trigger, artifact_key: st.key, operator: st.op, expected_value: st.val } : undefined);
      });
    }

    // ------------------------------------------------------------ node details
    var NODE_API = { job_template: "job_templates", job: "job_templates", project: "projects", project_update: "projects", inventory_source: "inventory_sources", inventory_update: "inventory_sources", workflow_job_template: "workflow_job_templates", workflow_job: "workflow_job_templates", system_job_template: "system_job_templates", system_job: "system_job_templates" };
    // updateNode in VisualizerNode: read the full template and the node's
    // credentials, labels and instance groups before viewing or editing.
    function withNodeDetails(node, then) {
      setHelp(null);
      var o = node.originalNodeObject;
      var ujt = o && o.summary_fields && o.summary_fields.unified_job_template;
      var steps = Promise.resolve();
      if (!node.fullUnifiedJobTemplate && ujt && o.unified_job_template) {
        var coll = NODE_API[ujt.type || ujt.unified_job_type];
        if (!coll) return;
        steps = steps.then(function () { return req("GET", "/api/v2/" + coll + "/" + o.unified_job_template + "/").then(function (d) { node.fullUnifiedJobTemplate = d; }); });
      }
      var kind = ujt && ujt.unified_job_type;
      if (o && (kind === "job" || kind === "workflow_job")) {
        var base = "/api/v2/workflow_job_template_nodes/" + o.id + "/";
        steps = steps.then(function () {
          var p = [];
          if (kind === "job" && !node.originalNodeCredentials) p.push(req("GET", base + "credentials/").then(function (d) { node.originalNodeCredentials = d.results; }));
          if (kind === "job" && !node.originalNodeLabels) p.push(req("GET", base + "labels/").then(function (d) { node.originalNodeLabels = d.results; o.labels = d.results; }));
          if (!node.originalNodeInstanceGroups) p.push(req("GET", base + "instance_groups/").then(function (d) { node.originalNodeInstanceGroups = d.results; o.instance_groups = d.results; }));
          return Promise.all(p);
        });
      }
      steps.then(function () { then(node); }, function (err) {
        alertModal({ variant: "error", title: t("Error!"), body: "<p>" + esc(t("Failed to retrieve full node resource object.")) + "</p><p>" + esc(errorDetail(err)) + "</p>", footer: "" });
      });
    }

    function detailRow(cy, label, value, raw) {
      if (value === undefined || value === null || value === "") return "";
      return '<div><dt class="ascender-detail-name" data-cy="' + cy + '-label" id="' + cy + '">' + esc(label) + '</dt><dd class="ascender-detail-value" data-cy="' + cy + '-value">' + (raw ? value : esc(value)) + "</dd></div>";
    }
    function chips(names) { return '<div class="pf-v6-c-label-group"><div class="pf-v6-c-label-group__main"><ul class="pf-v6-c-label-group__list" role="list">' + names.map(function (n) { return '<li class="pf-v6-c-label-group__list-item"><span class="pf-v6-c-label pf-m-outline"><span class="pf-v6-c-label__content"><span class="pf-v6-c-label__text">' + esc(n) + "</span></span></span></li>"; }).join("") + "</ul></div></div>"; }
    function fullRow(label, value) { return '<div><dt class="ascender-detail-name ascender-detail-name--full-width">' + esc(label) + '</dt><dd class="ascender-detail-value ascender-detail-value--full-width">' + value + "</dd></div>"; }
    var VERBOSITY = { 0: t("0 (Normal)"), 1: t("1 (Verbose)"), 2: t("2 (More Verbose)"), 3: t("3 (Debug)"), 4: t("4 (Connection Debug)"), 5: t("5 (WinRM Debug)") };
    function resourceLink(r) {
      var t = r.type, id = r.id;
      var href = { job_template: "/templates/job_template/" + id + "/details", workflow_job_template: "/templates/workflow_job_template/" + id + "/details", project: "/projects/" + id + "/details", inventory_source: "/inventories/inventory/" + r.inventory + "/sources/" + id + "/details", system_job_template: "/management_jobs/" + id + "/details" }[t];
      return href && id ? '<a href="' + href + '">' + esc(r.name) + "</a>" : esc(r.name);
    }
    // UserDateDetail's text: the date, and who by when the API names them.
    function userDateText(date, by) {
      var d = new Date(date).toLocaleString();
      return by ? t("{dateStr} by <0>{username}</0>", { dateStr: d, username: by.username }) : d;
    }
    // PromptDetail (main fields, then the prompted values).
    function promptDetail(resource, launch, overrides, wfNode) {
      launch = launch || {};
      var sf = resource.summary_fields || {};
      var h = '<dl class="ascender-detail-list" gutter="sm">' + detailRow("prompt-detail-name", t("Name"), resourceLink(resource), true) + detailRow("prompt-detail-description", t("Description"), resource.description) +
        detailRow("prompt-detail-type", t("Type"), toTitleCase(resource.unified_job_type || resource.type));
      h += detailRow("prompt-detail-convergence", t("Convergence"), wfNode.all_parents_must_converge ? t("All") : t("Any"));
      if (resource.unified_job_type !== "workflow_approval" && resource.type !== "workflow_approval_template") h += detailRow("prompt-detail-max-retries", t("Max Retries"), String(wfNode.max_retries || 0));
      if (resource.timeout !== undefined && resource.timeout !== null) h += detailRow("prompt-detail-timeout", t("Timeout"), typeof resource.timeout === "string" ? resource.timeout : t("{minutes} min {seconds} sec", { minutes: Math.floor(resource.timeout / 60), seconds: resource.timeout - Math.floor(resource.timeout / 60) * 60 }));
      if (resource.type === "job_template") {
        if (!has(overrides, "job_type")) h += detailRow("prompt-detail-job-type", t("Job Type"), toTitleCase(resource.job_type));
        if (!has(overrides, "inventory") && sf.inventory) h += detailRow("prompt-detail-inventory", t("Inventory"), sf.inventory.name);
        if (sf.project) h += detailRow("prompt-detail-project", t("Project"), sf.project.name);
        h += detailRow("prompt-detail-playbook", t("Playbook"), resource.playbook);
        if (!has(overrides, "forks")) h += detailRow("prompt-detail-forks", t("Forks"), String(resource.forks || 0));
        if (!has(overrides, "limit")) h += detailRow("prompt-detail-limit", t("Limit"), resource.limit);
        if (!has(overrides, "verbosity")) h += detailRow("prompt-detail-verbosity", t("Verbosity"), VERBOSITY[resource.verbosity]);
        if (!has(overrides, "credentials") && (sf.credentials || []).length) h += fullRow(t("Credentials"), chips(sf.credentials.map(function (c) { return c.name; })));
      } else if (resource.type === "workflow_job_template") {
        if (sf.organization) h += detailRow("prompt-detail-organization", t("Organization"), sf.organization.name);
        if (!has(overrides, "inventory") && sf.inventory) h += detailRow("prompt-detail-inventory", t("Inventory"), sf.inventory.name);
      } else if (resource.type === "project") {
        h += detailRow("prompt-detail-scm-type", t("Source Control Type"), resource.scm_type || t("Manual")) + detailRow("prompt-detail-scm-url", t("Source Control URL"), resource.scm_url) + detailRow("prompt-detail-scm-branch", t("Source Control Branch"), resource.scm_branch);
      } else if (resource.type === "inventory_source") {
        if (sf.inventory) h += detailRow("prompt-detail-inventory", t("Inventory"), sf.inventory.name);
        h += detailRow("prompt-detail-source", t("Source"), resource.source);
      }
      if (resource.created) h += detailRow("prompt-detail-created", t("Created"), userDateText(resource.created, sf.created_by));
      if (resource.modified) h += detailRow("prompt-detail-modified", t("Last Modified"), userDateText(resource.modified, sf.modified_by));
      if (resource.type === "system_job_template" && overrides.extra_vars) h += fullRow(t("Variables"), '<pre class="ascender-code-editor__wrapper pf-v6-c-form-control" style="padding: 8px; font-family: monospace;">' + esc(overrides.extra_vars) + "</pre>");
      h += "</dl>";
      var asks = Object.keys(launch).some(function (k) { return /^ask_.*_on_launch$/.test(k) && launch[k]; }) || launch.survey_enabled;
      if (resource.type !== "system_job_template" && asks && Object.keys(overrides).length) {
        var p = "";
        if (launch.ask_job_type_on_launch) p += detailRow("prompt-job-type", t("Job Type"), toTitleCase(overrides.job_type));
        if (launch.ask_credential_on_launch) p += fullRow(t("Credentials"), chips((overrides.credentials || []).map(function (c) { return c.name; })));
        if (launch.ask_inventory_on_launch) p += detailRow("prompt-inventory", t("Inventory"), overrides.inventory && overrides.inventory.name);
        if (launch.ask_execution_environment_on_launch) p += detailRow("prompt-ee", t("Execution Environment"), overrides.execution_environment && overrides.execution_environment.name);
        if (launch.ask_instance_groups_on_launch) p += fullRow(t("Instance Groups"), chips((overrides.instance_groups || []).map(function (g) { return g.name; })));
        if (launch.ask_scm_branch_on_launch) p += detailRow("prompt-scm-branch", t("Source Control Branch"), overrides.scm_branch);
        if (launch.ask_limit_on_launch) p += detailRow("prompt-limit", t("Limit"), overrides.limit);
        if (launch.ask_verbosity_on_launch && has(overrides, "verbosity")) p += detailRow("prompt-verbosity", t("Verbosity"), VERBOSITY[overrides.verbosity]);
        if (launch.ask_tags_on_launch) p += fullRow(t("Job Tags"), chips(String(overrides.job_tags || "").split(",").filter(Boolean)));
        if (launch.ask_skip_tags_on_launch) p += fullRow(t("Skip Tags"), chips(String(overrides.skip_tags || "").split(",").filter(Boolean)));
        if (launch.ask_diff_mode_on_launch) p += detailRow("prompt-diff-mode", t("Show Changes"), overrides.diff_mode ? t("On") : t("Off"));
        if (launch.ask_forks_on_launch) p += detailRow("prompt-forks", t("Forks"), String(overrides.forks || 0));
        if (launch.ask_job_slice_count_on_launch) p += detailRow("prompt-job-slice-count", t("Job Slicing"), String(overrides.job_slice_count || 1));
        if (launch.ask_timeout_on_launch) p += detailRow("prompt-timeout", t("Timeout"), String(overrides.timeout || 0));
        if (launch.ask_labels_on_launch) p += fullRow(t("Labels"), chips((overrides.labels || []).map(function (l) { return l.name; })));
        if ((launch.ask_variables_on_launch || launch.survey_enabled) && overrides.extra_vars !== undefined) p += '<div class="ascender-variables-detail__wrapper" style="grid-column: 1 / -1;"><div class="ascender-variables-detail__label"><label class="pf-v6-c-form__label"><span class="pf-v6-c-form__label-text" style="font-weight: var(--pf-t--global--font--weight--heading--bold);">' + esc(t("Variables")) + '</span></label></div><pre class="ascender-code-editor__wrapper pf-v6-c-form-control" style="padding: 8px; font-family: monospace;">' + esc(overrides.extra_vars) + "</pre></div>";
        h += '<h2 class="pf-v6-c-title pf-m-md ascender-prompt-detail__title">' + esc(t("Prompted Values")) + '</h2><hr class="pf-v6-c-divider ascender-prompt-detail__divider"><dl class="ascender-detail-list ascender-prompt-detail__list" aria-label="' + esc(t("Prompt Overrides")) + '">' + p + "</dl>";
      }
      return h;
    }
    function nodeViewModal(node) {
      var u = nodeTemplate(node), full = node.fullUnifiedJobTemplate, o = node.originalNodeObject;
      var type = u && (u.type || u.unified_job_type);
      var m = modalBox({ size: "lg", title: (full && full.name) || t("Resource deleted"), label: t("Workflow node view modal"), body: spinner(),
        footer: readOnly ? "" : button("node-view-edit-button", t("Edit Node"), "primary", t("Edit")) });
      if (!readOnly) $("#node-view-edit-button", m).addEventListener("click", function () { closeBox(m); nodeWizard({ title: t("Edit Node"), askLinkType: false, node: node }); });
      var body = $("[data-wf-body]", m);
      var launchP = type === "job_template" || type === "workflow_job_template" || type === "job" || type === "workflow_job" ? req("GET", "/api/v2/" + NODE_API[type] + "/" + (full ? full.id : u.id) + "/launch/") : Promise.resolve({});
      launchP.then(function (launch) {
        if (!full) { body.innerHTML = "<p>" + esc(t("The resource associated with this node has been deleted.")) + "&nbsp;&nbsp;" + (readOnly ? "" : esc(t("Click the Edit button below to reconfigure the node."))) + "</p>"; return; }
        var ov = {}, pv = node.promptValues;
        if (pv) {
          ov = Object.assign({}, pv.fields || {}, { inventory: pv.inventory, execution_environment: pv.execution_environment, credentials: pv.credentials, labels: pv.labels, instance_groups: pv.instance_groups });
          if (launch.ask_variables_on_launch || launch.survey_enabled || (full.type === "system_job_template" && pv.fields && pv.fields.extra_data)) ov.extra_vars = yamlDump((pv.fields && pv.fields.extra_data) || {});
        } else if (o && full.id === o.unified_job_template) {
          var sf = o.summary_fields || {};
          if (launch.ask_inventory_on_launch) ov.inventory = sf.inventory;
          if (launch.ask_execution_environment_on_launch) ov.execution_environment = sf.execution_environment;
          if (launch.ask_labels_on_launch) ov.labels = node.originalNodeLabels || [];
          ["forks", "job_slice_count", "timeout", "scm_branch", "job_tags", "diff_mode", "skip_tags", "job_type", "limit"].forEach(function (k) {
            var flag = { job_tags: "tags", job_slice_count: "job_slice_count" }[k] || k;
            if (launch["ask_" + flag + "_on_launch"]) ov[k] = o[k];
          });
          if (launch.ask_variables_on_launch || launch.survey_enabled || full.type === "system_job_template") ov.extra_vars = yamlDump(o.extra_data || {});
          if (launch.ask_verbosity_on_launch) ov.verbosity = o.verbosity !== undefined && o.verbosity !== null ? String(o.verbosity) : "0";
          if (launch.ask_credential_on_launch) ov.credentials = node.originalNodeCredentials || [];
          if (launch.ask_instance_groups_on_launch) ov.instance_groups = node.originalNodeInstanceGroups || [];
        }
        var wf = Object.assign({}, o || {}, { all_parents_must_converge: nodeConverges(node) });
        if (node.max_retries !== undefined) wf.max_retries = node.max_retries;
        body.innerHTML = promptDetail(full, launch, ov, wf);
      }, function (err) { body.innerHTML = "<p>" + esc(errorDetail(err)) + "</p>"; });
    }

    // ------------------------------------------------------------ node wizard
    var NODE_TYPES = [["workflow_approval_template", t("Approval")], ["inventory_source", t("Inventory Source Sync")], ["job_template", t("Job Template")], ["project", t("Project Sync")], ["workflow_job_template", t("Workflow Job Template")]];
    var LISTS = {
      job_template: { url: "/api/v2/job_templates/", extra: "&role_level=execute_role", id: "job-templates", info: true },
      project: { url: "/api/v2/projects/", extra: "", id: "projects" },
      inventory_source: { url: "/api/v2/inventory_sources/", extra: "", id: "inventory-sources" },
      system_job_template: { url: "/api/v2/system_job_templates/", extra: "&role_level=execute_role", id: "system-job-templates" },
      workflow_job_template: { url: "/api/v2/workflow_job_templates/", extra: "&role_level=execute_role", id: "workflow-job-templates" }
    };
    function showPrompts(nodeType, launch) {
      if (["workflow_job_template", "job_template"].indexOf(nodeType) < 0 || !launch || !Object.keys(launch).length) return false;
      return !launch.can_start_without_user_input || launch.ask_inventory_on_launch || launch.ask_variables_on_launch || launch.ask_limit_on_launch || launch.ask_scm_branch_on_launch ||
        launch.ask_execution_environment_on_launch || launch.ask_labels_on_launch || launch.ask_forks_on_launch || launch.ask_job_slice_count_on_launch || launch.ask_timeout_on_launch ||
        launch.ask_instance_groups_on_launch || launch.survey_enabled || (launch.variables_needed_to_start && launch.variables_needed_to_start.length > 0) ||
        launch.ask_credential_on_launch || launch.ask_job_type_on_launch || launch.ask_verbosity_on_launch || launch.ask_tags_on_launch || launch.ask_skip_tags_on_launch || launch.ask_diff_mode_on_launch;
    }

    function nodeWizard(o) {
      var node = o.node || null;
      var v = { linkType: "success", linkConditionTrigger: "success", linkConditionArtifactKey: "", linkConditionOperator: "eq", linkConditionExpectedValue: "",
        nodeType: "job_template", nodeResource: null, approvalName: "", approvalDescription: "", timeoutMinutes: 0, timeoutSeconds: 0, contextTemplate: "", requiredApprovals: 1, onTimeout: "deny",
        convergence: "any", identifier: "", maxRetries: 0, daysToKeep: 30 };
      var identifierRequired = false;
      if (node) {
        var on = node.originalNodeObject;
        var full = node.fullUnifiedJobTemplate;
        v.nodeResource = full || null;
        v.nodeType = (full && full.type) || "job_template";
        v.convergence = nodeConverges(node) ? "all" : "any";
        v.maxRetries = has(node, "max_retries") ? node.max_retries : (on && on.max_retries) || 0;
        if (has(node, "identifier") && node.identifier !== null && node.identifier !== undefined) v.identifier = node.identifier;
        else if (on && has(on, "identifier") && !isUUID(on.identifier)) v.identifier = on.identifier || "";
        identifierRequired = !!(on && !isUUID(on.identifier));
        if (full && full.type === "workflow_approval_template") {
          var to = full.timeout || 0;
          v.approvalName = full.name || ""; v.approvalDescription = full.description || "";
          v.timeoutMinutes = Math.floor(to / 60); v.timeoutSeconds = to - Math.floor(to / 60) * 60;
          v.contextTemplate = full.context_template || ""; v.requiredApprovals = full.required_approvals || 1; v.onTimeout = full.on_timeout || "deny";
        }
        if (full && full.type === "system_job_template") {
          var ed = (node.promptValues && node.promptValues.fields && node.promptValues.fields.extra_data) || (on && on.extra_data);
          if (ed && has(ed, "days")) v.daysToKeep = parseInt(ed.days, 10);
        }
      }
      var list = { page: 1, search: "", count: 0, results: [], loading: false };
      var launch = null, launchLoading = false, launchFor = null, resourceError = null, survey = {}, defaultCreds = [];
      var current = 0;

      function steps() {
        var s = [];
        if (o.askLinkType) s.push({ id: "runType", stepId: "run-type-step", name: t("Run type"), render: renderRun, enableNext: v.linkType !== "" && (v.linkType !== "condition" || v.linkConditionArtifactKey !== "") });
        s.push({ id: "nodeType", stepId: "node-type-step", name: t("Node type"), render: renderType, enableNext: nodeTypeValid(), hasError: !!resourceError });
        if (v.nodeResource && ["cleanup_activitystream", "cleanup_jobs"].indexOf(v.nodeResource.job_type) >= 0 && v.nodeType === "system_job_template") s.push({ id: "daysToKeep", stepId: "days-to-keep-step", name: t("Days to keep"), render: renderDays, enableNext: /^\d+$/.test(String(v.daysToKeep)) });
        return s;
      }
      function nodeTypeValid() {
        if (v.nodeType !== "workflow_approval_template" && !v.nodeResource) return false;
        if (v.nodeType === "workflow_approval_template" && v.approvalName === "") return false;
        if (identifierRequired && v.identifier === "") return false;
        if (resourceError || launchLoading) return false;
        return true;
      }
      var title = o.title;
      function wizTitle() { return v.nodeResource ? title + " | " + v.nodeResource.name : title; }
      var m = el('<div class="pf-v6-c-backdrop" data-wf-modal><div class="pf-v6-l-bullseye"><div role="dialog" aria-label="' + esc(title) + '" aria-modal="true" class="pf-v6-c-modal-box pf-m-lg"><div class="pf-v6-c-wizard ascender-wizard ascender-node-modal__overflow-scroll"><div class="pf-v6-c-wizard__header"><div class="pf-v6-c-wizard__close"><button aria-label="Close" class="pf-v6-c-button pf-m-plain" type="button" data-wf-close><span class="pf-v6-c-button__icon">' + ((IC.close || IC.times) || "") + '</span></button></div><div class="pf-v6-c-wizard__title"><h2 class="pf-v6-c-wizard__title-text" data-wf-title></h2></div></div><div class="pf-v6-c-wizard__outer-wrap"><div class="pf-v6-c-wizard__inner-wrap"><nav class="pf-v6-c-wizard__nav" aria-label="Wizard steps"><ol class="pf-v6-c-wizard__nav-list" role="list" data-wf-nav></ol></nav><div tabindex="-1" class="pf-v6-c-wizard__main"><div class="pf-v6-c-wizard__main-body" data-wf-step></div></div></div><footer class="pf-v6-c-wizard__footer" data-wf-footer></footer></div></div></div></div></div>');
      var root2 = $("#ascender-modal-root") || document.body;
      root2.appendChild(m); openModals.push(m); document.body.classList.add("pf-v6-c-backdrop__open");
      $("[data-wf-close]", m).focus();
      m._onClose = function () {};
      $("[data-wf-close]", m).addEventListener("click", function () { closeBox(m); });
      var stepBox = $("[data-wf-step]", m);

      function show() {
        var s = steps();
        if (current >= s.length) current = s.length - 1;
        $("[data-wf-title]", m).textContent = wizTitle();
        var blocked = false;
        $("[data-wf-nav]", m).innerHTML = s.map(function (st, i) {
          var dis = blocked && i !== current;
          if (st.enableNext === false) blocked = true;
          var name = st.hasError ? '<span class="ascender-step-name__alert-text">' + esc(st.name) + '</span><span class="ascender-step-name__exclamation-circle-icon" style="color: var(--pf-t--global--color--status--danger--default);">' + (IC["exclamation-circle"] || "") + "</span>" : esc(st.name);
          return '<li class="pf-v6-c-wizard__nav-item"><button id="' + st.id + '" class="pf-v6-c-wizard__nav-link' + (i === current ? " pf-m-current" : "") + (dis ? " pf-m-disabled" : "") + '" aria-current="' + (i === current ? "step" : "false") + '"' + (dis ? " disabled" : "") + ' data-wf-go="' + i + '"><span class="pf-v6-c-wizard__nav-link-main"><div id="' + st.stepId + '">' + name + "</div></span></button></li>";
        }).join("");
        $$("[data-wf-go]", m).forEach(function (b) { b.addEventListener("click", function () { current = parseInt(b.getAttribute("data-wf-go"), 10); show(); }); });
        s[current].render();
        footer();
      }
      function footer() {
        var s = steps(), st = s[current], last = current === s.length - 1;
        var prompts = last && showPrompts(v.nodeType, launch);
        var f = $("[data-wf-footer]", m);
        var label = last && !prompts ? t("Save") : t("Next");
        f.innerHTML = '<button id="next-node-modal" aria-label="' + esc(label) + '" class="pf-v6-c-button pf-m-primary" type="submit"' + (st.enableNext === false ? " disabled" : "") + '><span class="pf-v6-c-button__text">' + esc(label) + "</span></button>" +
          (current > 0 ? '<button id="back-node-modal" aria-label="' + esc(t("Back")) + '" class="pf-v6-c-button pf-m-secondary" type="button"><span class="pf-v6-c-button__text">' + esc(t("Back")) + '</span></button>' : "") +
          '<button id="cancel-node-modal" aria-label="' + esc(t("Cancel")) + '" class="pf-v6-c-button pf-m-link" type="button"><span class="pf-v6-c-button__text">' + esc(t("Cancel")) + '</span></button>';
        $("#cancel-node-modal", f).addEventListener("click", function () { closeBox(m); });
        var back = $("#back-node-modal", f);
        if (back) back.addEventListener("click", function () { current--; show(); });
        $("#next-node-modal", f).addEventListener("click", function () {
          if (!last) { current++; show(); return; }
          if (prompts) { openPrompts(); return; }
          closeBox(m);
          finish(null, null);
        });
      }
      function refreshNav() {
        // re-evaluate the steps' validity without re-rendering the step body
        var s = steps(), blocked = false;
        $$("[data-wf-go]", m).forEach(function (b, i) {
          var st = s[i]; if (!st) return;
          var dis = blocked && i !== current;
          b.disabled = dis; b.classList.toggle("pf-m-disabled", dis);
          if (st.enableNext === false) blocked = true;
        });
        if (s.length !== $$("[data-wf-go]", m).length) { show(); return; }
        $("[data-wf-title]", m).textContent = wizTitle();
        footer();
      }

      // ---- Run type step (RunStep)
      function renderRun() {
        function card(id, val, label, desc) {
          var sel = v.linkType === val;
          return '<div role="button" tabindex="0" class="ascender-selectable-card__item' + (sel ? " ascender-selectable-card__item--selected" : "") + '" aria-label="" id="' + id + '" data-link-type="' + val + '"><div class="ascender-selectable-card__indicator' + (sel ? " ascender-selectable-card__indicator--selected" : "") + '"></div><div class="ascender-selectable-card__contents"><b>' + esc(label) + '</b><p class="ascender-selectable-card__description">' + esc(desc) + "</p></div></div>";
        }
        var st = { trigger: v.linkConditionTrigger, key: v.linkConditionArtifactKey, op: v.linkConditionOperator, val: v.linkConditionExpectedValue };
        stepBox.innerHTML = '<h1 class="pf-v6-c-title pf-m-xl">' + esc(t("Run")) + '</h1><p>' + esc(t("Specify the conditions under which this node should be executed")) + '</p><div class="ascender-run-step__grid">' +
          card("link-type-success", "success", t("On Success"), t("Execute when the parent node results in a successful state.")) +
          card("link-type-failure", "failure", t("On Failure"), t("Execute when the parent node results in a failure state.")) +
          card("link-type-always", "always", t("Always"), t("Execute regardless of the parent node's final state.")) +
          card("link-type-condition", "condition", t("On Condition"), t("Execute when an artifact of the parent node matches the condition.")) + "</div>" +
          (v.linkType === "condition" ? '<div class="ascender-run-step__condition-fields">' + conditionFields(st, v._keyTouched) + "</div>" : "");
        $$("[data-link-type]", stepBox).forEach(function (c) {
          function pick() { v.linkType = c.getAttribute("data-link-type"); renderRun(); refreshNav(); }
          c.addEventListener("click", pick);
          c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        });
        var f = $(".ascender-run-step__condition-fields", stepBox);
        if (f) {
          f.addEventListener("change", function (e) {
            if (e.target.id === "link-condition-trigger") v.linkConditionTrigger = e.target.value;
            if (e.target.id === "link-condition-operator") v.linkConditionOperator = e.target.value;
          });
          f.addEventListener("input", function (e) {
            if (e.target.id === "link-condition-artifact-key") {
              v.linkConditionArtifactKey = e.target.value; v._keyTouched = true;
              var bad = e.target.value === ""; e.target.parentNode.classList.toggle("pf-m-error", bad); e.target.setAttribute("aria-invalid", String(bad));
              refreshNav();
            }
            if (e.target.id === "link-condition-expected-value") v.linkConditionExpectedValue = e.target.value;
          });
        }
      }

      // ---- Node type step (NodeTypeStep)
      function renderType() {
        var types = NODE_TYPES.concat(isSuperuser ? [["system_job_template", t("Management Job")]] : []);
        var h = (resourceError ? '<div class="pf-v6-c-alert pf-m-inline pf-m-danger ascender-node-type-step__error-alert"><div class="pf-v6-c-alert__icon">' + (IC["exclamation-circle"] || "") + '</div><p class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">Danger alert:</span>' + esc(resourceError) + "</p></div>" : "") +
          '<div class="ascender-node-type-step__display-align-items"><b class="ascender-node-type-step__margin-right-24">' + esc(t("Node Type")) + '</b><div>' + selectControl("nodeResource-select", types, v.nodeType) + "</div></div>";
        if (v.nodeType !== "workflow_approval_template") h += '<div data-wf-list></div>';
        h += '<form novalidate autocomplete="off" class="pf-v6-c-form ascender-node-type-step__margin-top-20" data-no-submit><div class="ascender-form-column-layout"><div class="ascender-form-full-width-layout">';
        if (v.nodeType === "workflow_approval_template") {
          var nameBad = v._nameTouched && v.approvalName === "";
          h += formGroup("approval-name", t("Name"), textControl("approval-name", v.approvalName, { required: true, name: "approvalName", invalid: nameBad }), { required: true, cy: "approval-name-form-group" }) +
            formGroup("approval-description", t("Description"), textControl("approval-description", v.approvalDescription, { name: "approvalDescription" }), { cy: "approval-description-form-group" }) +
            '<div class="pf-v6-c-form__group" name="timeout"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="approval-timeout"><span class="pf-v6-c-form__label-text">' + esc(t("Timeout")) + '</span></label>&nbsp;&nbsp;</div><div class="pf-v6-c-form__group-control"><div class="ascender-node-type-step__display-align-items-2">' +
            textControl("approval-timeout-minutes", v.timeoutMinutes, { label: t("Timeout minutes"), type: "number", name: "timeoutMinutes", cls: "ascender-node-type-step__timeout-input", attrs: ' min="0" step="1"' }) + '<p class="ascender-node-type-step__timeout-label">' + esc(t("min")) + '</p>' +
            textControl("approval-timeout-seconds", v.timeoutSeconds, { label: t("Timeout seconds"), type: "number", name: "timeoutSeconds", cls: "ascender-node-type-step__timeout-input", attrs: ' min="0" step="1"' }) + '<p class="ascender-node-type-step__timeout-label">' + esc(t("sec")) + '</p></div></div></div>' +
            formGroup("approval-on-timeout", t("On timeout"), selectControl("approval-on-timeout", [["deny", t("Deny")], ["approve", t("Approve")]], v.onTimeout, ' aria-label="' + esc(t("On timeout")) + '"').replace('aria-label="' + esc(t("Select Input")) + '" ', ""), { help: t("Whether the approval node is automatically approved or denied when the timeout expires.") }) +
            formGroup("approval-required-approvals", t("Required approvals"), textControl("approval-required-approvals", v.requiredApprovals, { label: t("Required approvals"), type: "number", name: "requiredApprovals", cls: "ascender-node-type-step__timeout-input", attrs: ' min="1" step="1"' }), { help: t("The number of distinct users that must approve before the workflow continues. A single denial always denies the node.") }) +
            formGroup("approval-context-template", t("Context Template"), '<span class="pf-v6-c-form-control pf-m-textarea pf-m-resize-vertical"><textarea aria-invalid="false" name="contextTemplate" aria-label="' + esc(t("Context Template")) + '" id="approval-context-template" rows="4">' + esc(v.contextTemplate) + "</textarea></span>", { help: t("A Jinja2 template rendered with upstream set_stats artifacts when the approval is created. Use this to show the approver relevant context from previous job steps. Available variables come from set_stats data of parent nodes.") });
        }
        h += formGroup("convergence", t("Convergence"), '<div class="ascender-dropdown" data-wf-convergence style="position: relative; display: inline-block;"><button class="pf-v6-c-menu-toggle" type="button" aria-expanded="false" aria-label="' + esc(t("Convergence select")) + '" data-wf-conv-toggle><span class="pf-v6-c-menu-toggle__text">' + esc(v.convergence === "any" ? t("Any") : t("All")) + '</span><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + (IC["caret-down"] || "") + '</span></span></button><div class="pf-v6-c-menu" hidden data-wf-conv-menu style="position: absolute; z-index: 1000; min-width: 100%;"><div class="pf-v6-c-menu__content"><ul class="pf-v6-c-menu__list" role="listbox"><li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" type="button" role="option" id="select-option-any" data-conv="any"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(t("Any")) + '</span></span></button></li><li class="pf-v6-c-menu__list-item" role="none"><button class="pf-v6-c-menu__item" type="button" role="option" id="select-option-all" data-conv="all"><span class="pf-v6-c-menu__item-main"><span class="pf-v6-c-menu__item-text">' + esc(t("All")) + '</span></span></button></li></ul></div></div></div>',
          { required: true, help: t("Preconditions for running this node when there are multiple parents. Refer to the") + " " + t("documentation") + " " + t("for more info.") });
        var aliasBad = identifierRequired && v._aliasTouched && v.identifier === "";
        h += formGroup("node-alias", t("Node Alias"), textControl("node-alias", v.identifier, { label: t("Node Alias"), name: "identifier", required: identifierRequired, invalid: aliasBad }), { required: identifierRequired, cy: "node-alias-form-group", help: t("If specified, this field will be shown on the node instead of the resource name when viewing the workflow") });
        if (v.nodeType !== "workflow_approval_template") h += formGroup("node-max-retries", t("Max Retries"), textControl("node-max-retries", v.maxRetries, { label: t("Max Retries"), type: "number", name: "maxRetries", attrs: ' min="0" max="100"' }), { cy: "node-max-retries-form-group", help: t("Maximum number of times this node's job is automatically retried after failing before its failure paths are followed. Canceled jobs are never retried.") });
        h += "</div></div></form>";
        stepBox.innerHTML = h;
        $("#nodeResource-select", stepBox).addEventListener("change", function () {
          v.nodeType = this.value; v.nodeResource = null; v.approvalName = ""; v.approvalDescription = ""; v.timeoutMinutes = 0; v.timeoutSeconds = 0;
          v.contextTemplate = ""; v.requiredApprovals = 1; v.onTimeout = "deny"; v.convergence = "any";
          resourceError = null; launch = null; launchFor = null;
          list = { page: 1, search: "", count: 0, results: [], loading: false };
          renderType(); refreshNav();
        });
        var form = $("form", stepBox);
        form.addEventListener("input", function (e) {
          var n = e.target.name;
          if (!n) return;
          v[n] = e.target.value;
          if (n === "approvalName") {
            v._nameTouched = true;
            var bad = v.approvalName === ""; e.target.parentNode.classList.toggle("pf-m-error", bad); e.target.setAttribute("aria-invalid", String(bad));
          }
          if (n === "identifier") v._aliasTouched = true;
          refreshNav();
        });
        var ot = $("#approval-on-timeout", stepBox);
        if (ot) ot.addEventListener("change", function () { v.onTimeout = this.value; });
        var conv = $("[data-wf-convergence]", stepBox), menu = $("[data-wf-conv-menu]", conv), tog = $("[data-wf-conv-toggle]", conv);
        tog.addEventListener("click", function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; tog.setAttribute("aria-expanded", String(!menu.hidden)); tog.classList.toggle("pf-m-expanded", !menu.hidden); });
        $$("[data-conv]", conv).forEach(function (b) { b.addEventListener("click", function () { v.convergence = b.getAttribute("data-conv"); $(".pf-v6-c-menu-toggle__text", tog).textContent = v.convergence === "any" ? t("Any") : t("All"); menu.hidden = true; tog.setAttribute("aria-expanded", "false"); tog.classList.remove("pf-m-expanded"); }); });
        m.addEventListener("click", function (e) { if (!conv.contains(e.target)) { menu.hidden = true; tog.setAttribute("aria-expanded", "false"); tog.classList.remove("pf-m-expanded"); } });
        if (v.nodeType !== "workflow_approval_template") loadList();
      }

      function loadList() {
        var box = $("[data-wf-list]", stepBox);
        if (!box) return;
        var cfg = LISTS[v.nodeType];
        var q = cfg.url + "?page_size=5&order_by=name&page=" + list.page + cfg.extra + (list.search ? "&name__icontains=" + encodeURIComponent(list.search) : "");
        var mine = list;
        api("GET", q).then(function (r) {
          if (mine !== list || !box.isConnected) return;
          list.results = r.ok ? r.data.results || [] : []; list.count = r.ok ? r.data.count : 0;
          drawList(box, cfg);
        });
        drawList(box, cfg);
      }
      function drawList(box, cfg) {
        var pages = Math.max(1, Math.ceil(list.count / 5)), from = list.count ? (list.page - 1) * 5 + 1 : 0, to = Math.min(list.page * 5, list.count);
        var navBtn = function (act, label, icon, dis, cls) { return '<div class="pf-v6-c-pagination__nav-control' + (cls ? " " + cls : "") + '"><button data-action="' + act + '" aria-label="' + esc(label) + '" class="pf-v6-c-button pf-m-plain"' + (dis ? " disabled" : "") + ' type="button"><span class="pf-v6-c-button__icon">' + (IC[icon] || "") + "</span></button></div>"; };
        var h = '<div class="pf-v6-c-toolbar" id="' + cfg.id + '-list-toolbar"><div class="pf-v6-c-toolbar__content ascender-data-list-toolbar__content"><div class="pf-v6-c-toolbar__content-section"><div class="pf-v6-c-toolbar__group pf-m-toggle-group pf-m-show"><div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-toolbar__group pf-m-filter-group"><div class="pf-v6-c-toolbar__item"><button class="pf-v6-c-menu-toggle" type="button" aria-label="' + esc(t("Simple key select")) + '" aria-expanded="false"><span class="pf-v6-c-menu-toggle__text">' + esc(t("Name")) + '</span><span class="pf-v6-c-menu-toggle__controls"><span class="pf-v6-c-menu-toggle__toggle-icon">' + (IC["caret-down"] || "") + '</span></span></button></div><div class="pf-v6-c-toolbar__item"><div class="pf-v6-c-input-group"><div class="pf-v6-c-input-group__item pf-m-fill"><span class="pf-v6-c-form-control"><input data-cy="search-text-input" aria-label="' + esc(t("Search text input")) + '" aria-invalid="false" type="search" value="' + esc(list.search) + '" data-wf-search></span></div><div class="pf-v6-c-input-group__item"><div class="ascender-search__submit-button-wrapper"><button aria-label="' + esc(t("Search submit button")) + '" class="pf-v6-c-button pf-m-control" type="button" data-wf-search-go><span class="pf-v6-c-button__icon">' + (IC.search || "") + '</span></button></div></div></div></div></div></div></div><div class="pf-v6-c-toolbar__group"></div><div class="pf-v6-c-toolbar__item pf-m-pagination" style="align-self: center;"><div class="pf-v6-c-pagination ascender-pagination--no-page-sizes" id="options-menu-top-pagination"><div class="pf-v6-c-pagination__total-items"><b>' + from + " - " + to + "</b> " + esc(t("of")) + " <b>" + list.count + '</b> ' + esc(t("items")) + '</div><nav class="pf-v6-c-pagination__nav" aria-label="' + esc(t("Pagination")) + '">' + navBtn("previous", t("Go to previous page"), "angle-left", list.page <= 1) + navBtn("next", t("Go to next page"), "angle-right", list.page >= pages) + "</nav></div></div></div></div></div>";
        h += '<div class="ascender-paginated-table__overflow-auto"><table aria-label="' + esc(t("Items List")) + '" role="grid" class="pf-v6-c-table pf-m-grid-md pf-m-compact"><thead class="pf-v6-c-table__thead"><tr class="pf-v6-c-table__tr"><th tabindex="-1" scope="col" class="pf-v6-c-table__th ascender-header-row__th"><span class="pf-v6-u-screen-reader">' + esc(t("Row select")) + '</span></th><th tabindex="-1" scope="col" class="pf-v6-c-table__th ascender-header-row__th pf-v6-c-table__sort pf-m-selected" aria-sort="ascending" id="' + cfg.id + '-table-sort-name"><button type="button" class="pf-v6-c-table__button"><div class="pf-v6-c-table__button-content"><span class="pf-v6-c-table__text">' + esc(t("Name")) + '</span><span class="pf-v6-c-table__sort-indicator">' + (IC["long-arrow-alt-up"] || "") + '</span></div></button></th></tr></thead><tbody role="rowgroup" class="pf-v6-c-table__tbody">';
        list.results.forEach(function (item, i) {
          var sel = v.nodeResource && v.nodeResource.id === item.id && v.nodeResource.type === item.type;
          var sf = item.summary_fields || {};
          var info = cfg.info ? t("Inventory") + ": " + ((sf.inventory && sf.inventory.name) || "") + "\n" + t("Project") + ": " + ((sf.project && sf.project.name) || "") + "\n" + t("Playbook") + ": " + (item.playbook || "") : "";
          h += '<tr class="pf-v6-c-table__tr ascender-checkbox-list-item__cursor-default" id="list-item-' + item.id + '"><td tabindex="-1" data-label="' + esc(t("Selected")) + '" class="pf-v6-c-table__td pf-v6-c-table__check" id="check-action-item-' + item.id + '" name="' + esc(item.name) + '"><div class="pf-v6-c-radio pf-m-standalone"><input id="select-' + i + '" class="pf-v6-c-radio__input" aria-invalid="false" aria-label="Select row ' + i + '" type="radio" name="radioGroup"' + (sel ? " checked" : "") + ' data-wf-pick="' + i + '"></div></td><td tabindex="-1" data-label="' + esc(item.name) + '" class="pf-v6-c-table__td" aria-labelledby="' + item.id + '" data-cy="item-' + item.id + '"><b>' + esc(item.name) + "</b></td>" +
            (cfg.info ? '<td tabindex="-1" class="pf-v6-c-table__td ascender-actions-td__cell" style="--pf-v6-c-table--cell--Width: 40px;"><div class="ascender-actions-td__grid"><div><div style="display: contents;" title="' + esc(info) + '">' + (IC["outlined-question-circle"] || "") + "</div></div></div></td>" : "") + "</tr>";
        });
        h += '</tbody></table></div><div class="pf-v6-c-pagination pf-m-bottom ascender-pagination--no-page-sizes" id="options-menu-bottom-pagination"><nav class="pf-v6-c-pagination__nav" aria-label="' + esc(t("Pagination")) + '">' + navBtn("first", t("Go to first page"), "angle-double-left", list.page <= 1, "pf-m-first") + navBtn("previous", t("Go to previous page"), "angle-left", list.page <= 1) +
          '<div class="pf-v6-c-pagination__nav-page-select"><span class="pf-v6-c-form-control"><input aria-label="' + esc(t("Current page")) + '" min="1" max="' + pages + '" aria-invalid="false" type="number" value="' + list.page + '" data-wf-page></span><span aria-hidden="true">' + esc(t("of")) + " " + pages + " " + esc(pages === 1 ? t("page") : t("pages")) + "</span></div>" +
          navBtn("next", t("Go to next page"), "angle-right", list.page >= pages) + navBtn("last", t("Go to last page"), "angle-double-right", list.page >= pages, "pf-m-last") + "</nav></div>";
        box.innerHTML = h;
        $$("[data-wf-pick]", box).forEach(function (r) { r.addEventListener("change", function () { pickResource(list.results[parseInt(r.getAttribute("data-wf-pick"), 10)]); }); });
        $$("[data-action]", box).forEach(function (b) {
          b.addEventListener("click", function () {
            var a = b.getAttribute("data-action");
            list.page = a === "first" ? 1 : a === "last" ? pages : a === "next" ? list.page + 1 : list.page - 1;
            loadList();
          });
        });
        var pg = $("[data-wf-page]", box);
        pg.addEventListener("change", function () { var n = parseInt(pg.value, 10); if (n >= 1 && n <= pages) { list.page = n; loadList(); } });
        var sIn = $("[data-wf-search]", box);
        function go() { list.search = sIn.value; list.page = 1; loadList(); }
        $("[data-wf-search-go]", box).addEventListener("click", go);
        sIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
      }
      function pickResource(item) {
        v.nodeResource = item;
        resourceError = null;
        if (item.type === "job_template" && (!item.project || (!item.inventory && !item.ask_inventory_on_launch))) resourceError = t("Job Templates with a missing inventory or project cannot be selected when creating or editing nodes.  Select another template or fix the missing fields to proceed.");
        loadLaunch();
        var box = $("[data-wf-list]", stepBox);
        if (box) drawList(box, LISTS[v.nodeType]);
        var alert = $(".ascender-node-type-step__error-alert", stepBox);
        if (alert) alert.remove();
        if (resourceError) stepBox.insertAdjacentHTML("afterbegin", '<div class="pf-v6-c-alert pf-m-inline pf-m-danger ascender-node-type-step__error-alert"><div class="pf-v6-c-alert__icon">' + (IC["exclamation-circle"] || "") + '</div><p class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">Danger alert:</span>' + esc(resourceError) + "</p></div>");
        refreshNav();
      }
      // NodeModalInner: read the launch config (and survey and default
      // credentials) of the template a node runs.
      function loadLaunch() {
        var r = v.nodeResource;
        launch = null; survey = {}; defaultCreds = [];
        if (!r || ["job_template", "workflow_job_template"].indexOf(v.nodeType) < 0 || ["job_template", "workflow_job_template"].indexOf(r.type) < 0) { launchFor = null; return; }
        var base = "/api/v2/" + (v.nodeType === "workflow_job_template" ? "workflow_job_templates" : "job_templates") + "/" + r.id + "/";
        var key = base;
        launchFor = key; launchLoading = true;
        req("GET", base + "launch/").then(function (l) {
          var more = [l.survey_enabled ? req("GET", base + "survey_spec/") : Promise.resolve({}), l.ask_credential_on_launch && v.nodeType === "job_template" ? req("GET", base + "credentials/?page_size=200").then(function (d) { return d.results; }) : Promise.resolve([])];
          return Promise.all(more).then(function (x) {
            if (launchFor !== key) return;
            launch = l; survey = x[0] || {}; defaultCreds = x[1] || [];
            if (!l.ask_credential_on_launch && (l.passwords_needed_to_start || []).length) {
              resourceError = t("Job Templates with credentials that prompt for passwords cannot be selected when creating or editing nodes");
              var alert = $(".ascender-node-type-step__error-alert", stepBox);
              if (!alert && stepBox.isConnected && $("#nodeResource-select", stepBox)) stepBox.insertAdjacentHTML("afterbegin", '<div class="pf-v6-c-alert pf-m-inline pf-m-danger ascender-node-type-step__error-alert"><div class="pf-v6-c-alert__icon">' + (IC["exclamation-circle"] || "") + '</div><p class="pf-v6-c-alert__title"><span class="pf-v6-screen-reader">Danger alert:</span>' + esc(resourceError) + "</p></div>");
            }
          });
        }).then(function () { if (launchFor === key) { launchLoading = false; refreshNav(); } }, function (err) {
          launchLoading = false;
          if (launchFor !== key) return;
          resourceError = errorDetail(err);
          refreshNav();
        });
      }
      if (v.nodeResource) loadLaunch();

      // ---- Days to keep step
      function renderDays() {
        var bad = !/^\d+$/.test(String(v.daysToKeep));
        stepBox.innerHTML = '<form class="pf-v6-c-form" novalidate data-no-submit>' + formGroup("days-to-keep", t("Days of data to be retained"), textControl("days-to-keep", v.daysToKeep, { name: "daysToKeep", required: true, invalid: bad }), { required: true }) + "</form>";
        $("#days-to-keep", stepBox).addEventListener("input", function () {
          v.daysToKeep = this.value;
          var b = !/^\d+$/.test(this.value); this.parentNode.classList.toggle("pf-m-error", b); this.setAttribute("aria-invalid", String(b));
          refreshNav();
        });
      }

      // ---- prompts: the launch wizard from templates.js in schedule mode
      function initialPrompts() {
        var pv = node && node.promptValues;
        if (pv && pv.wizardValues && node.fullUnifiedJobTemplate && v.nodeResource && node.fullUnifiedJobTemplate.id === v.nodeResource.id) return pv.wizardValues;
        var on = node && node.originalNodeObject;
        if (!on || !v.nodeResource || on.unified_job_template !== v.nodeResource.id) return null;
        var sf = on.summary_fields || {}, ini = {};
        if (launch.ask_inventory_on_launch && sf.inventory) ini.inventory = sf.inventory;
        if (launch.ask_execution_environment_on_launch && sf.execution_environment) ini.execution_environment = sf.execution_environment;
        if (launch.ask_credential_on_launch) {
          var orig = node.originalNodeCredentials || [];
          var keep = defaultCreds.filter(function (d) {
            return !orig.some(function (c) { return d.credential_type === c.credential_type && ((!d.vault_id && !(c.inputs && c.inputs.vault_id)) || (d.vault_id && c.inputs && c.inputs.vault_id && d.vault_id === c.inputs.vault_id)); });
          });
          ini.credentials = orig.concat(keep);
        }
        if (launch.ask_labels_on_launch) ini.labels = node.originalNodeLabels || [];
        if (launch.ask_instance_groups_on_launch) ini.instance_groups = node.originalNodeInstanceGroups || [];
        ["job_type", "limit", "verbosity", "job_tags", "skip_tags", "scm_branch", "diff_mode", "forks", "job_slice_count", "timeout"].forEach(function (k) { if (on[k] !== null && on[k] !== undefined) ini[k] = on[k]; });
        var ed = Object.assign({}, on.extra_data || {}), answers = {};
        (survey.spec || []).forEach(function (q) { if (has(ed, q.variable)) { answers[q.variable] = ed[q.variable]; delete ed[q.variable]; } });
        if (launch.ask_variables_on_launch) ini.extra_vars = Object.keys(ed).length ? yamlDump(ed) : "---";
        ini.survey = answers;
        return ini;
      }
      function openPrompts() {
        var r = v.nodeResource, isWF = v.nodeType === "workflow_job_template";
        var base = "/api/v2/" + (isWF ? "workflow_job_templates" : "job_templates") + "/" + r.id + "/";
        var ini = initialPrompts();
        closeBox(m);
        A.promptWizard(base, v.nodeType, r.name, { mode: "schedule", initial: ini, onSave: function (post, values) { finish(post, values); } });
      }

      // NodeAddModal.addNode / NodeEditModal.updateNode
      function finish(post, values) {
        var n = { all_parents_must_converge: v.convergence === "all", max_retries: Number(v.maxRetries) || 0, identifier: v.identifier };
        if (v.nodeType === "workflow_approval_template") {
          n.nodeResource = { description: v.approvalDescription, name: v.approvalName, timeout: Number(v.timeoutMinutes) * 60 + Number(v.timeoutSeconds), context_template: v.contextTemplate || "", required_approvals: Number(v.requiredApprovals) || 1, on_timeout: v.onTimeout || "deny", type: "workflow_approval_template" };
          if (node) n.max_retries = 0;
        } else {
          n.nodeResource = v.nodeResource;
          if (v.nodeType === "job_template" || v.nodeType === "workflow_job_template") {
            var pv = { fields: {}, credentials: undefined, labels: undefined, instance_groups: undefined, inventory: null, execution_environment: null };
            if (post && values) {
              ["job_type", "limit", "job_tags", "skip_tags", "scm_branch", "verbosity", "diff_mode", "timeout", "forks", "job_slice_count"].forEach(function (k) { if (has(post, k)) pv.fields[k] = post[k]; });
              if (has(post, "extra_vars")) pv.fields.extra_data = post.extra_vars;
              if (launch.ask_inventory_on_launch) pv.inventory = values.inventory || null;
              if (launch.ask_execution_environment_on_launch) pv.execution_environment = values.execution_environment || null;
              if (launch.ask_credential_on_launch) pv.credentials = values.credentials.slice();
              if (launch.ask_labels_on_launch) pv.labels = values.labels.filter(function (l) { return l.name; }).slice();
              if (launch.ask_instance_groups_on_launch) pv.instance_groups = values.instance_groups.slice();
              pv.wizardValues = { inventory: values.inventory, credentials: values.credentials, execution_environment: values.execution_environment, instance_groups: values.instance_groups, labels: values.labels,
                job_type: values.job_type, scm_branch: values.scm_branch, limit: values.limit, verbosity: values.verbosity, forks: values.forks, job_slice_count: values.job_slice_count, timeout: values.timeout,
                diff_mode: values.diff_mode, job_tags: values.job_tags, skip_tags: values.skip_tags, extra_vars: values.extra_vars, survey: Object.assign({}, values.survey) };
            }
            if (!node) pv.addedCredentials = getAddedAndRemoved(launch && launch.defaults && launch.defaults.credentials, pv.credentials).added;
            n.promptValues = pv;
            n.launchConfig = launch;
          }
          if (v.nodeType === "system_job_template") {
            n.promptValues = { fields: ["cleanup_activitystream", "cleanup_jobs"].indexOf(v.nodeResource.job_type) >= 0 ? { extra_data: { days: parseInt(String(v.daysToKeep), 10) } } : {} };
          }
        }
        if (node) { updateNode(node, n); return; }
        n.linkType = v.linkType;
        if (v.linkType === "condition") n.linkCondition = { trigger: v.linkConditionTrigger || "success", artifact_key: v.linkConditionArtifactKey, operator: v.linkConditionOperator || "eq", expected_value: v.linkConditionExpectedValue || "" };
        createNode(n, o.addSource, o.addTarget);
      }

      show();
    }

    function conditionFields(st, touched) {
      return formGroup("link-condition-trigger", t("Evaluate on"), selectControl("link-condition-trigger", [["success", t("On Success")], ["failure", t("On Failure")], ["always", t("Always")]], st.trigger), { help: t("Parent node outcome required before the condition is evaluated.") }) +
        formGroup("link-condition-artifact-key", t("Artifact key"), textControl("link-condition-artifact-key", st.key, { label: t("Artifact key"), required: true, invalid: touched && st.key === "" }), { required: true, help: t("Name of an artifact produced by the parent node via set_stats. The link is only followed when the parent job matches the chosen outcome and the condition is true. A missing key never matches.") }) +
        formGroup("link-condition-operator", t("Operator"), selectControl("link-condition-operator", [["eq", t("Equals")], ["ne", t("Not equals")]], st.op)) +
        formGroup("link-condition-expected-value", t("Expected value"), textControl("link-condition-expected-value", st.val, { label: t("Expected value") }), { help: t("Value to compare the artifact against. Interpreted as JSON when possible (e.g. true, 3), otherwise as a plain string.") });
    }

    // ------------------------------------------------------------ save
    function replaceIdentifier(node) {
      var orig = node.originalNodeObject && node.originalNodeObject.identifier;
      if (isUUID(orig) && node.identifier !== "") return true;
      if (!isUUID(orig) && orig !== node.identifier) return true;
      return false;
    }
    function nodePayload(node, tmpl) {
      var pv = node.promptValues || {};
      var p = Object.assign({}, pv.fields || {});
      p.execution_environment = (pv.execution_environment && pv.execution_environment.id) || null;
      p.inventory = (pv.inventory && pv.inventory.id) || null;
      p.unified_job_template = tmpl.id;
      p.all_parents_must_converge = node.all_parents_must_converge;
      p.max_retries = node.max_retries || 0;
      return p;
    }
    function approvalBody(t) { return { name: t.name, description: t.description, timeout: t.timeout, context_template: t.context_template || "", required_approvals: t.required_approvals || 1, on_timeout: t.on_timeout || "deny" }; }
    function aggregatedCredentials(orig, defaults) {
      orig = orig || []; defaults = defaults || [];
      return defaults.filter(function (d) {
        return !orig.some(function (c) { return d.credential_type === c.credential_type && ((!d.vault_id && !(c.inputs && c.inputs.vault_id)) || (d.vault_id && c.inputs && c.inputs.vault_id && d.vault_id === c.inputs.vault_id)); });
      }).concat(orig);
    }
    function orderInstanceGroups(nodeId, current, original) {
      var same = JSON.stringify(sortedIds(current)) === JSON.stringify(sortedIds(original)) && JSON.stringify(current) === JSON.stringify(original);
      if (same) return Promise.resolve();
      var url = "/api/v2/workflow_job_template_nodes/" + nodeId + "/instance_groups/";
      var chain = Promise.resolve();
      original.forEach(function (g) { chain = chain.then(function () { return req("POST", url, { id: g.id, disassociate: true }); }); });
      current.forEach(function (g) { chain = chain.then(function () { return req("POST", url, { id: g.id }); }); });
      return chain;
    }

    // saveVisualizer from Visualizer.tsx, request for request.
    function save() {
      var NODES = "/api/v2/workflow_job_template_nodes/";
      var nodeRequests = [], approvalTemplateRequests = [], originalLinkMap = {}, deletedNodeIds = [];
      var associateCredentialRequests = [], disassociateCredentialRequests = [], associateLabelRequests = [], disassociateLabelRequests = [], instanceGroupRequests = [];
      showSaving(true);
      function emptyMap(id) { return { id: id, success_nodes: [], failure_nodes: [], always_nodes: [], condition_nodes: [], condition_edges: [] }; }
      S.nodes.forEach(function (node) {
        if (node.id === 1) return;
        var o = node.originalNodeObject;
        if (o && !node.isDeleted) originalLinkMap[node.id] = { id: o.id, success_nodes: o.success_nodes || [], failure_nodes: o.failure_nodes || [], always_nodes: o.always_nodes || [], condition_nodes: o.condition_nodes || [], condition_edges: o.condition_edges || [] };
        if (node.isDeleted && o) {
          deletedNodeIds.push(o.id);
          nodeRequests.push(req("DELETE", NODES + o.id + "/"));
        } else if (!node.isDeleted && !o) {
          var t = node.fullUnifiedJobTemplate;
          if (t.type === "workflow_approval_template") {
            var body = { all_parents_must_converge: node.all_parents_must_converge };
            if (node.identifier) body.identifier = node.identifier;
            nodeRequests.push(req("POST", "/api/v2/workflow_job_templates/" + templateId + "/workflow_nodes/", body).then(function (data) {
              node.originalNodeObject = data;
              originalLinkMap[node.id] = emptyMap(data.id);
              approvalTemplateRequests.push(req("POST", NODES + data.id + "/create_approval_template/", approvalBody(t)));
            }));
          } else {
            var p = nodePayload(node, t);
            if (node.identifier) p.identifier = node.identifier;
            nodeRequests.push(req("POST", "/api/v2/workflow_job_templates/" + templateId + "/workflow_nodes/", p).then(function (data) {
              node.originalNodeObject = data;
              originalLinkMap[node.id] = emptyMap(data.id);
              var pv = node.promptValues || {};
              (pv.addedCredentials || []).forEach(function (c) { associateCredentialRequests.push(req("POST", NODES + data.id + "/credentials/", { id: c.id })); });
              (pv.labels || []).forEach(function (l) { associateLabelRequests.push(req("POST", NODES + data.id + "/labels/", { name: l.name, organization: t.organization || S.defaultOrganization })); });
              (pv.instance_groups || []).forEach(function (g) { instanceGroupRequests.push(req("POST", NODES + data.id + "/instance_groups/", { id: g.id })); });
            }));
          }
        } else if (node.isEdited && o) {
          var tt = node.fullUnifiedJobTemplate;
          if (tt.type === "workflow_approval_template") {
            var ab = { all_parents_must_converge: node.all_parents_must_converge };
            if (replaceIdentifier(node)) ab.identifier = node.identifier;
            var wasApproval = o.summary_fields && o.summary_fields.unified_job_template && o.summary_fields.unified_job_template.unified_job_type === "workflow_approval";
            nodeRequests.push(req("PATCH", NODES + o.id + "/", ab).then(function (data) {
              var ujtId = wasApproval && o.summary_fields.unified_job_template.id;
              node.originalNodeObject = data;
              if (wasApproval) approvalTemplateRequests.push(req("PATCH", "/api/v2/workflow_approval_templates/" + ujtId + "/", approvalBody(tt)));
              else approvalTemplateRequests.push(req("POST", NODES + data.id + "/create_approval_template/", approvalBody(tt)));
            }));
          } else {
            var ep = nodePayload(node, tt);
            if (replaceIdentifier(node)) ep.identifier = node.identifier;
            nodeRequests.push(req("PATCH", NODES + o.id + "/", ep).then(function () {
              var pv = node.promptValues || {};
              var cr = getAddedAndRemoved(aggregatedCredentials(node.originalNodeCredentials, node.launchConfig && node.launchConfig.defaults && node.launchConfig.defaults.credentials), pv.credentials);
              var lr = getAddedAndRemoved(node.originalNodeLabels, pv.labels);
              cr.added.forEach(function (c) { associateCredentialRequests.push(req("POST", NODES + o.id + "/credentials/", { id: c.id })); });
              cr.removed.forEach(function (c) { disassociateCredentialRequests.push(req("POST", NODES + o.id + "/credentials/", { id: c.id, disassociate: true })); });
              lr.added.forEach(function (l) { associateLabelRequests.push(req("POST", NODES + o.id + "/labels/", { name: l.name, organization: tt.organization || S.defaultOrganization })); });
              lr.removed.forEach(function (l) { disassociateLabelRequests.push(req("POST", NODES + o.id + "/labels/", { id: l.id, disassociate: true })); });
              if (pv.instance_groups) instanceGroupRequests.push(orderInstanceGroups(o.id, pv.instance_groups, node.originalNodeInstanceGroups || []));
            }));
          }
        }
      });

      Promise.all(nodeRequests).then(function () {
        return Promise.all(approvalTemplateRequests);
      }).then(function () {
        var linkMap = {}, newLinks = [];
        S.links.forEach(function (l) {
          var s = originalLinkMap[l.source.id], t = originalLinkMap[l.target.id];
          if (l.source.id === 1 || !s || !t) return;
          (linkMap[s.id] = linkMap[s.id] || {})[t.id] = l.linkType;
          switch (l.linkType) {
            case "success": if (s.success_nodes.indexOf(t.id) < 0) newLinks.push(l); break;
            case "failure": if (s.failure_nodes.indexOf(t.id) < 0) newLinks.push(l); break;
            case "always": if (s.always_nodes.indexOf(t.id) < 0) newLinks.push(l); break;
            case "condition":
              var e = s.condition_edges.filter(function (x) { return x.id === t.id; })[0], c = l.linkCondition || {};
              if (!e || e.trigger !== c.trigger || e.artifact_key !== c.artifact_key || e.operator !== c.operator || e.expected_value !== c.expected_value) newLinks.push(l);
              break;
          }
        });
        var dis = [];
        Object.keys(originalLinkMap).forEach(function (k) {
          var n = originalLinkMap[k], links = linkMap[n.id];
          [["success_nodes", "success"], ["failure_nodes", "failure"], ["always_nodes", "always"], ["condition_nodes", "condition"]].forEach(function (x) {
            n[x[0]].forEach(function (tid) {
              if (deletedNodeIds.indexOf(tid) < 0 && !(links && links[tid] === x[1])) dis.push(req("POST", NODES + n.id + "/" + x[0] + "/", { id: tid, disassociate: true }));
            });
          });
        });
        return Promise.all(dis).then(function () {
          return Promise.all(newLinks.map(function (l) {
            var sid = originalLinkMap[l.source.id] && originalLinkMap[l.source.id].id, tid = originalLinkMap[l.target.id] && originalLinkMap[l.target.id].id;
            if (sid === undefined || tid === undefined) return null;
            if (l.linkType === "condition") {
              var c = l.linkCondition || {};
              return req("POST", NODES + sid + "/condition_nodes/", { id: tid, trigger: c.trigger || "success", artifact_key: c.artifact_key || "", operator: c.operator || "eq", expected_value: c.expected_value || "" });
            }
            return req("POST", NODES + sid + "/" + l.linkType + "_nodes/", { id: tid });
          }));
        });
      }).then(function () {
        return Promise.all(disassociateCredentialRequests.concat(disassociateLabelRequests));
      }).then(function () {
        return Promise.all(associateCredentialRequests.concat(associateLabelRequests, instanceGroupRequests));
      }).then(function () {
        S.unsavedChanges = false;
        location.href = detailsURL;
      }, function (err) {
        showSaving(false);
        render();
        alertModal({ variant: "error", title: t("Error saving the workflow!"), label: t("Error saving the workflow!"), body: "<p>" + esc(t("There was an error saving the workflow.")) + "</p><p class=\"ascender-error-detail\" data-cy=\"error-detail\">" + esc(errorDetail(err)) + "</p>", footer: "" });
      });
    }
    function showSaving(on) {
      toolbar.hidden = on;
      loading.hidden = !on;
      if (view) { view.svg.style.display = on ? "none" : ""; view.panel.hidden = on; view.help.hidden = on; }
      if (startScreen) startScreen.hidden = on;
    }

    // ------------------------------------------------------------ load
    Promise.all([
      req("GET", "/api/v2/organizations/?page_size=1&page=1").then(function (d) { S.defaultOrganization = (d.results[0] && d.results[0].id) || null; }),
      readAll("/api/v2/workflow_job_templates/" + templateId + "/workflow_nodes/?page_size=200")
    ]).then(function (x) {
      var gen = generateNodesAndLinks(x[1], "START");
      S.nodes = gen.nodes; S.links = gen.links; S.nextNodeId = gen.nextNodeId;
      loading.hidden = true;
      toolbar.hidden = false;
      render();
    }, function (err) {
      loading.innerHTML = '<div class="pf-v6-c-empty-state"><div class="pf-v6-c-empty-state__content"><div class="pf-v6-c-empty-state__header"><div class="pf-v6-c-empty-state__icon">' + (IC["exclamation-triangle"] || "") + '</div><div class="pf-v6-c-empty-state__title"><h1 class="pf-v6-c-empty-state__title-text">' + esc(t("Something went wrong...")) + '</h1></div></div><div class="pf-v6-c-empty-state__body">' + esc(t("There was an error loading this content. Please reload the page.")) + '<br>' + esc(errorDetail(err)) + "</div></div></div>";
    });
    void templateName; void templateOrg;
  }

  // ================================================================ output
  var oroot = $("[data-wf-output]");
  if (oroot && window.dagre) initOutput(oroot);

  function initOutput(root) {
    var jobApi = root.getAttribute("data-job-api");
    var status = root.getAttribute("data-status");
    var started = root.getAttribute("data-started"), finished = root.getAttribute("data-finished");
    var ACTIVE = ["new", "pending", "waiting", "running"];
    var SEG = { job: "playbook", project_update: "project", inventory_update: "inventory", system_job: "management", workflow_job: "workflow", ad_hoc_command: "command" };
    var S = { nodes: [], links: [], showLegend: false, showTools: false };
    var view = new GraphView(root, { svgClass: "ascender-workflow-output-graph__flex-width", panelClass: "ascender-workflow-output-graph__position-top", defs: false, onToggle: function (w) { if (w === "legend") S.showLegend = !S.showLegend; else S.showTools = !S.showTools; toggles(); } });
    view.g.style.opacity = "0"; view.g.style.transition = "opacity 0.3s ease-in";
    var pos = null, positioned = false, focusedRunning = false, sig = "";

    var bLegend = $("#workflow-output-toggle-legend", root), bTools = $("#workflow-output-toggle-tools", root);
    function toggles() {
      bLegend.classList.toggle("pf-m-active", S.showLegend); bTools.classList.toggle("pf-m-active", S.showTools);
      view.showLegend = S.showLegend; view.showTools = S.showTools; view.renderPanel();
    }
    bLegend.addEventListener("click", function () { S.showLegend = !S.showLegend; toggles(); });
    bTools.addEventListener("click", function () { S.showTools = !S.showTools; toggles(); });

    function nodeJob(n) { return n.originalNodeObject && n.originalNodeObject.summary_fields && n.originalNodeObject.summary_fields.job; }
    function nodeHTML(n) {
      var o = n.originalNodeObject || {}, job = nodeJob(n), p = pos[n.id];
      var prior = o.prior_run_succeeded, forced = prior && o.forced_success, forcedJob = o.summary_fields && o.summary_fields.forced_success_job;
      var gid = "ascender-workflow-output-node-forced-" + n.id;
      var border = "var(--pf-t--global--border--color--default)";
      if (job) {
        if (job.status === "failed" || job.status === "error") border = "var(--pf-t--global--color--status--danger--default)";
        if (job.status === "canceled") border = "var(--ascender-status-canceled-color)";
        if (job.status === "successful" || job.status === "ok") border = "var(--pf-t--global--color--status--success--default)";
        if (job.status === "running") border = "var(--ascender-status-running-color)";
      } else if (forced) border = "url(#" + gid + ")";
      else if (prior) border = "var(--pf-t--global--color--status--success--default)";
      var hasJob = job || (forced && forcedJob && forcedJob.id);
      var h = '<g id="node-' + n.id + '" transform="translate(' + p.x + "," + (p.y - pos[1].y) + ')"' + (hasJob ? ' class="ascender-workflow-output-node__node-g--has-job"' : "") + ">";
      if (forced) h += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="50%" stop-color="var(--pf-t--global--color--status--success--default)"></stop><stop offset="50%" stop-color="var(--pf-t--global--color--status--danger--default)"></stop></linearGradient></defs>';
      if (n.all_parents_must_converge || o.all_parents_must_converge) h += '<rect fill="' + border + '" height="' + C.nodeH / 4 + '" rx="2" ry="2" x="' + (C.nodeW / 2 - C.nodeW / 10) + '" y="' + (-C.nodeH / 4 + 2) + '" stroke="' + border + '" stroke-width="2px" width="' + C.nodeW / 5 + '"></rect><foreignObject height="' + C.nodeH / 4 + '" width="' + C.nodeW / 5 + '" x="' + (C.nodeW / 2 - C.nodeW / 10 + 7) + '" y="' + (-C.nodeH / 4 - 1) + '"><p class="ascender-workflow-output-node__convergence-label">' + esc(t("ALL")) + '</p></foreignObject>';
      h += '<rect fill="var(--ascender-workflow-node-bg)" height="' + C.nodeH + '" rx="2" ry="2" stroke="' + border + '" stroke-width="2px" width="' + C.nodeW + '"></rect><foreignObject height="58" width="178" x="1" y="1"><div class="ascender-workflow-output-node__contents">';
      var name = esc(nodeName(n));
      if (job) {
        var running = job.status === "running";
        var elapsed = running ? secondsToHHMMSS((Date.now() - (job.started ? new Date(job.started).getTime() : Date.now())) / 1000) : job.elapsed ? secondsToHHMMSS(job.elapsed) : null;
        h += '<div class="ascender-workflow-output-node__job-top-line">' + (job.status && job.status !== "pending" ? (STATUS_ICON[job.status] || "") : "") + "<p>" + name + "</p></div>" +
          (elapsed ? '<div class="ascender-workflow-output-node__elapsed"' + (running ? ' data-wf-running-since="' + esc(job.started || "") + '"' : "") + ">" + elapsed + "</div>" : "");
      } else if (prior) {
        h += '<div class="ascender-workflow-output-node__job-top-line">' + (forced ? '<span class="ascender-workflow-output-node__forced-icon" role="img" aria-label="' + esc(t("Forced as successful")) + '" data-job-status="forced"></span>' : (STATUS_ICON.successful || "")) + "<p>" + name + "</p></div>" +
          (o.prior_run_elapsed !== null && o.prior_run_elapsed !== undefined ? '<div class="ascender-workflow-output-node__elapsed">' + secondsToHHMMSS(o.prior_run_elapsed) + "</div>" : "");
      } else h += '<p class="ascender-workflow-output-node__default-label">' + name + "</p>";
      h += "</div></foreignObject>" + (nodeTemplate(n) || job || prior ? typeLetterHTML(n) : "") + "</g>";
      return h;
    }
    function draw() {
      var h = "";
      S.links.forEach(function (l) {
        if (!pos[l.source.id] || !pos[l.target.id]) return;
        var id = "link-" + l.source.id + "-" + l.target.id, pts = overlayPoints(l, pos);
        h += '<g id="' + id + '"><polygon id="' + id + '-overlay" opacity="0" points="' + pts + '" style="fill: var(--pf-t--global--background--color--200);"></polygon><path stroke="' + linkStroke(l) + '" stroke-width="2px" d="' + lineD(linePoints(l, pos)) + '"></path><polygon opacity="0" points="' + pts + '"></polygon></g>';
      });
      h += startNodeHTML(pos, false);
      S.nodes.forEach(function (n) { if (n.id > 1 && pos[n.id]) h += nodeHTML(n); });
      view.g.innerHTML = h;
      S.links.forEach(function (l) {
        var gEl = $("#link-" + l.source.id + "-" + l.target.id, view.g);
        if (!gEl) return;
        var bg = gEl.firstChild;
        gEl.addEventListener("mouseenter", function () { gEl.parentNode.appendChild(gEl); bg.setAttribute("opacity", "1"); view.setHelp(linkHelpHTML(l)); });
        gEl.addEventListener("mouseleave", function () { gEl.parentNode.insertBefore(gEl, gEl.parentNode.firstChild); bg.setAttribute("opacity", "0"); view.setHelp(null); });
      });
      S.nodes.forEach(function (n) {
        var gEl = n.id > 1 && $("#node-" + n.id, view.g);
        if (!gEl) return;
        gEl.addEventListener("mouseenter", function () { view.setHelp(nodeHelpHTML(n)); });
        gEl.addEventListener("mouseleave", function () { view.setHelp(null); });
        gEl.addEventListener("click", function () {
          var job = nodeJob(n), o = n.originalNodeObject || {};
          var fj = o.summary_fields && o.summary_fields.forced_success_job;
          if (job) location.href = job.type === "workflow_approval" ? "/workflow_approvals/" + job.id + "/details" : "/jobs/" + (SEG[job.type] || "playbook") + "/" + job.id + "/details";
          else if (o.prior_run_succeeded && o.forced_success && fj && fj.id) location.href = "/jobs/" + (SEG[fj.type] || "playbook") + "/" + fj.id + "/details";
        });
      });
    }
    function focusOn(n) {
      var p = pos[n.id], sr = view.rect();
      view.set(sr.width / 2 - (p.x + C.nodeW / 2), sr.height / 2 - (p.y - pos[1].y + C.nodeH / 2), 1);
    }
    function runningNode() { return S.nodes.filter(function (n) { var j = nodeJob(n); return n.id > 1 && pos[n.id] && j && j.status === "running"; })[0]; }
    function update(apiNodes) {
      var gen = generateNodesAndLinks(apiNodes, "START");
      var newSig = gen.links.map(function (l) { return l.source.id + ">" + l.target.id + ":" + l.linkType; }).join("|") + "#" + gen.nodes.length;
      S.nodes = gen.nodes; S.links = gen.links;
      if (newSig !== sig || !pos) { pos = layoutGraph(S.nodes, S.links); sig = newSig; }
      $("#workflow-total-nodes-badge", root).textContent = S.nodes.length - 1;
      draw();
      if (!positioned && S.nodes.length > 1) {
        var run = runningNode(), focus = null;
        if (run) { focus = run; focusedRunning = true; }
        else if (S.nodes.some(function (n) { return n.id > 1 && n.originalNodeObject && n.originalNodeObject.prior_run_succeeded; })) {
          focus = S.nodes.filter(function (n) { return n.id > 1 && pos[n.id] && !(n.originalNodeObject && n.originalNodeObject.prior_run_succeeded); })[0] || null;
        }
        if (focus) focusOn(focus); else view.fit();
        positioned = true;
        view.g.style.opacity = "1";
        toggles();
      } else if (positioned && !focusedRunning) {
        var r = runningNode();
        if (r) { focusedRunning = true; focusOn(r); }
      }
    }
    function load() { return readAll(jobApi + "workflow_nodes/?page_size=200").then(update); }
    load().catch(function () { /* the graph stays empty, as the old page did on error */ });

    // The elapsed badge and running nodes count up every second.
    setInterval(function () {
      if (started && !finished) $("#workflow-elapsed-badge", root).textContent = secondsToHHMMSS((Date.now() - new Date(started).getTime()) / 1000);
      $$("[data-wf-running-since]", view.g).forEach(function (e) {
        var s = e.getAttribute("data-wf-running-since");
        e.textContent = secondsToHHMMSS((Date.now() - (s ? new Date(s).getTime() : Date.now())) / 1000);
      });
    }, 1000);

    // Websockets drove the live updates before; polling the job and its
    // nodes does the same, and the page reloads once the job is done so the
    // toolbar offers the finished job's actions.
    if (ACTIVE.indexOf(status) >= 0) {
      var poll = function () {
        api("GET", jobApi).then(function (r) {
          if (!r.ok) return;
          var j = r.data;
          started = j.started; finished = j.finished;
          if (j.status !== status && ACTIVE.indexOf(j.status) < 0) { load().then(function () { location.reload(); }, function () { location.reload(); }); return; }
          status = j.status;
          load().then(function () { setTimeout(poll, 3000); }, function () { setTimeout(poll, 3000); });
        });
      };
      setTimeout(poll, 3000);
    }

  }
  // ====================================================== relaunch dropdown
  // WorkflowReLaunchDropDown (partials/workflow_output_relaunch.html): the
  // first-node and failed-node items relaunch through templates.js; the
  // new-variables and force-success items open these modals. Delegated, so
  // any page with a [data-workflow-relaunch] dropdown gets them.
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-wf-relaunch-vars], [data-wf-relaunch-force]");
    var box = b && b.closest("[data-workflow-relaunch]");
    if (!box) return;
    var menu = b.closest("[data-dropdown-menu]"), tog = $("[data-dropdown-toggle]", box);
    if (menu) menu.hidden = true;
    if (tog) tog.setAttribute("aria-expanded", "false");
    var jobApi = "/api/v2/workflow_jobs/" + box.getAttribute("data-workflow-relaunch") + "/";
    if (b.hasAttribute("data-wf-relaunch-vars")) relaunchVarsModal(jobApi, b.getAttribute("data-wf-relaunch-vars") === "canceled");
    else relaunchForceModal(jobApi, b.getAttribute("data-wf-relaunch-force") === "canceled");
  });
  function relaunchWorkflow(jobApi, body, m) {
    api("POST", jobApi + "relaunch/", body).then(function (r) {
      if (r.ok) { location.href = "/jobs/workflow/" + r.data.id + "/output"; return; }
      if (m) closeBox(m);
      alertModal({ variant: "error", title: t("Error!"), body: "<p>" + esc(t("Failed to relaunch job.")) + "</p><p>" + esc(U.errorText(r)) + "</p>", footer: "" });
    });
  }
  // WorkflowRelaunchVariablesModal
  function relaunchVarsModal(jobApi, canceled) {
    var title = canceled ? t("Relaunch from canceled node with new variables") : t("Relaunch from failed node with new variables");
    var m = modalBox({ size: "md", title: title, body: spinner(), footer: button("relaunch-variables-confirm", t("Relaunch"), "primary", t("Relaunch"), " disabled") + button("relaunch-variables-cancel", t("Cancel"), "link", t("Cancel")) });
    $("#relaunch-variables-cancel", m).addEventListener("click", function () { closeBox(m); });
    api("GET", jobApi).then(function (r) {
      var body = $("[data-wf-body]", m);
      if (!r.ok) { body.textContent = U.errorText(r); return; }
      var ev = r.data.extra_vars || "", text = "---\n";
      if (ev.trim()) { try { text = yamlDump(JSON.parse(ev)); } catch (e) { text = ev; } }
      body.innerHTML = '<form class="pf-v6-c-form" novalidate data-no-submit><p>' + esc(t("These are the variables the workflow ran with. Whatever is left here replaces them for the nodes that run again; nodes carried forward keep the results they already had.")) + '</p>' + formGroup("relaunch-variables", t("Variables"), '<span class="pf-v6-c-form-control pf-m-textarea pf-m-resize-vertical"><textarea id="relaunch-variables" rows="8" style="font-family: monospace;">' + esc(text) + "</textarea></span>") + "<div data-wf-vars-error></div></form>";
      var ok = $("#relaunch-variables-confirm", m);
      ok.disabled = false;
      function fail(msg) { $("[data-wf-vars-error]", m).innerHTML = '<div class="pf-v6-c-helper-text"><div class="pf-v6-c-helper-text__item pf-m-error"><span class="pf-v6-c-helper-text__item-text">' + esc(msg) + "</span></div></div>"; }
      ok.addEventListener("click", function () {
        var CM = window.AscenderCM, parsed, src = $("#relaunch-variables", m).value;
        try { parsed = CM && CM.jsyaml ? CM.jsyaml.load(src) : JSON.parse(src); } catch (e) { fail(e.message); return; }
        if (parsed === null || parsed === undefined) parsed = {};
        if (typeof parsed !== "object" || Array.isArray(parsed)) { fail(t("Variables must be a mapping of names to values.")); return; }
        ok.disabled = true;
        relaunchWorkflow(jobApi, { nodes: "failed", extra_vars: parsed }, m);
      });
    });
  }
  // WorkflowRelaunchForceSuccessModal
  function relaunchForceModal(jobApi, canceled) {
    var title = canceled ? t("Relaunch forcing canceled nodes as successful") : t("Relaunch forcing failed nodes as successful");
    var m = modalBox({ size: "md", title: title, body: spinner(), footer: button("relaunch-force-success-confirm", t("Relaunch"), "primary", t("Relaunch"), " disabled") + button("relaunch-force-success-cancel", t("Cancel"), "link", t("Cancel")) });
    $("#relaunch-force-success-cancel", m).addEventListener("click", function () { closeBox(m); });
    readAll(jobApi + "workflow_nodes/?job__status__in=failed,error,canceled&page_size=200&order_by=id").then(function (nodes) {
      nodes = nodes.filter(function (n) { return !(n.summary_fields && n.summary_fields.job && n.summary_fields.job.type === "workflow_approval"); });
      var body = $("[data-wf-body]", m), ok = $("#relaunch-force-success-confirm", m), selected = [];
      if (!nodes.length) { body.innerHTML = "<p>" + esc(t("This run has no failed nodes that can be forced. Approvals can never be forced as successful.")) + "</p>"; return; }
      if (nodes.length === 1) selected = [nodes[0].id];
      function label(n) {
        var alias = n.identifier && !isUUID(n.identifier) ? n.identifier : null, nm = n.summary_fields && n.summary_fields.unified_job_template && n.summary_fields.unified_job_template.name;
        return alias && nm && alias !== nm ? alias + " (" + nm + ")" : alias || nm || "#" + n.id;
      }
      body.innerHTML = '<form class="pf-v6-c-form" novalidate data-no-submit><p>' + esc(t("The nodes ticked here are not run again: the workflow carries them forward as though they had succeeded and goes on down their success paths. They stay marked as forced, together with who forced them and why.")) + '</p><div class="pf-v6-c-form__group" role="group"><div class="pf-v6-c-form__group-label"><label class="pf-v6-c-form__label" for="relaunch-force-success-nodes"><span class="pf-v6-c-form__label-text">' + esc(t("Nodes to force as successful")) + '</span><span class="pf-v6-c-form__label-required" aria-hidden="true">&nbsp;*</span></label></div><div class="pf-v6-c-form__group-control">' +
        nodes.map(function (n) { return '<div class="pf-v6-c-check"><input class="pf-v6-c-check__input" type="checkbox" id="relaunch-force-success-node-' + n.id + '" data-node="' + n.id + '"' + (selected.indexOf(n.id) >= 0 ? " checked" : "") + '><label class="pf-v6-c-check__label" for="relaunch-force-success-node-' + n.id + '">' + esc(label(n)) + "</label></div>"; }).join("") +
        "</div></div>" + formGroup("relaunch-force-success-reason", t("Reason"), '<span class="pf-v6-c-form-control pf-m-textarea pf-m-resize-vertical"><textarea id="relaunch-force-success-reason" aria-label="' + esc(t("Reason")) + '" required></textarea></span>', { required: true }) + "</form>";
      function check() { ok.disabled = !(selected.length && $("#relaunch-force-success-reason", m).value.trim()); }
      body.addEventListener("change", function (e) {
        var id = e.target.getAttribute("data-node");
        if (id) { id = parseInt(id, 10); selected = selected.filter(function (x) { return x !== id; }); if (e.target.checked) selected.push(id); }
        check();
      });
      body.addEventListener("input", check);
      check();
      ok.addEventListener("click", function () { ok.disabled = true; relaunchWorkflow(jobApi, { nodes: "failed", force_success_nodes: selected, force_success_reason: $("#relaunch-force-success-reason", m).value.trim() }, m); });
    }, function (err) { $("[data-wf-body]", m).textContent = errorDetail(err); });
  }
})();
