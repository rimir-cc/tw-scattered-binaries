/*\
title: $:/plugins/rimir/scattered-binaries/route.js
type: application/javascript
module-type: route

Serves binary files discovered by the scattered-binaries startup module.
Builds route regex dynamically from configured profile route prefixes.

\*/

"use strict";

var fs = require("fs");
var path = require("path");

var BINARY_EXTENSIONS = require("$:/plugins/rimir/scattered-binaries/mime-types.js").BINARY_EXTENSIONS;

// Build route regex from configured profiles at module load time
var profilesText = $tw.wiki.getTiddlerText("$:/config/rimir/scattered-binaries/profiles") || "[]";
var configProfiles = [];
try {
	configProfiles = JSON.parse(profilesText);
} catch(e) {
	// Invalid config — no routes
}

// Build regex alternation from all route prefixes
var prefixes = [];
for(var i = 0; i < configProfiles.length; i++) {
	var rp = configProfiles[i].routePrefix;
	if(rp) {
		// Escape regex special chars in prefix, remove leading slash
		prefixes.push(rp.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	}
}

// If no valid prefixes, use an unmatchable regex
var regexStr = prefixes.length > 0
	? "^\\/(" + prefixes.join("|") + ")\\/(.+)$"
	: "^\\/__scattered-binaries-no-profiles__$";

exports.method = "GET";
exports.path = new RegExp(regexStr);

exports.handler = function(request, response, state) {
	var matchedPrefix = "/" + state.params[0];
	var remainingPath = state.params[1];

	// Find profile matching this prefix
	var profiles = ($tw.rimir && $tw.rimir.scatteredBinaries && $tw.rimir.scatteredBinaries.profiles) || [];
	var matched = null;
	for(var i = 0; i < profiles.length; i++) {
		if(profiles[i].routePrefix === matchedPrefix) {
			matched = profiles[i];
			break;
		}
	}

	if(!matched) {
		response.writeHead(404, {"Content-Type": "text/plain"});
		response.end("No matching profile");
		return;
	}

	// Parse dirName/filepath
	var decoded = decodeURIComponent(remainingPath);
	var slashIdx = decoded.indexOf("/");
	if(slashIdx === -1) {
		response.writeHead(400, {"Content-Type": "text/plain"});
		response.end("Invalid path");
		return;
	}
	var dirName = decoded.substring(0, slashIdx);
	var filePath = decoded.substring(slashIdx + 1);

	// Security: only serve files with known binary extensions
	var ext = path.extname(filePath).toLowerCase();
	if(!BINARY_EXTENSIONS[ext]) {
		response.writeHead(403, {"Content-Type": "text/plain"});
		response.end("File type not allowed");
		return;
	}

	var baseDir = path.resolve(matched.basePath, dirName, matched.subFolder);
	var resolvedPath = path.resolve(baseDir, filePath);

	// Security: path traversal protection
	var rel = path.relative(baseDir, resolvedPath);
	if(rel.indexOf("..") === 0 || path.isAbsolute(rel)) {
		response.writeHead(403, {"Content-Type": "text/plain"});
		response.end("Access denied");
		return;
	}

	fs.readFile(resolvedPath, function(err, content) {
		if(err) {
			response.writeHead(404, {"Content-Type": "text/plain"});
			response.end("File not found");
			return;
		}
		response.writeHead(200, {
			"Content-Type": BINARY_EXTENSIONS[ext],
			"Content-Length": content.length
		});
		response.end(content);
	});
};
