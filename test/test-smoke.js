/*\
title: $:/plugins/rimir/scattered-binaries/test/test-smoke.js
type: application/javascript
tags: $:/tags/test-spec

Smoke test: the plugin loads and basic plugin.info fields are intact.
Lives as a baseline so any cross-plugin refactor (e.g. shared modules in
core-hook/theme) catches breakage that destroys this plugin's load path.

\*/
"use strict";

describe("scattered-binaries: smoke", function() {
    var pluginTitle = "$:/plugins/rimir/scattered-binaries";

    it("plugin shadow tiddler exists", function() {
        var t = $tw.wiki.getTiddler(pluginTitle);
        expect(t).toBeTruthy();
    });

    it("plugin.info has name + version + plugin-type", function() {
        var t = $tw.wiki.getTiddler(pluginTitle);
        expect(t.fields.name).toBeTruthy();
        expect(t.fields.version).toBeTruthy();
        expect(t.fields["plugin-type"]).toBe("plugin");
    });
});
