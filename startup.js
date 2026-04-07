/*\
title: $:/plugins/rimir/scattered-binaries/startup.js
type: application/javascript
module-type: startup

Auto-discovers binary files in configured subdirectories, creates _canonical_uri
tiddlers, cleans up boot-loaded duplicates, and stores profile data for the route module.

\*/

"use strict";

exports.name = "scattered-binaries";
exports.after = ["load-modules"];
exports.before = ["startup"];
exports.synchronous = true;

var BINARY_EXTENSIONS = require("$:/plugins/rimir/scattered-binaries/mime-types.js").BINARY_EXTENSIONS;

exports.startup = function() {
	if(!$tw.node) {
		return;
	}

	var path = require("path");
	var fs = require("fs");
	var logger = new $tw.utils.Logger("scattered-binaries", {colour: "blue"});

	// Read profiles from config
	var profilesText = $tw.wiki.getTiddlerText("$:/config/rimir/scattered-binaries/profiles") || "[]";
	var profiles;
	try {
		profiles = JSON.parse(profilesText);
	} catch(e) {
		logger.log("Error parsing profiles config: " + e.message);
		return;
	}
	if(!Array.isArray(profiles) || profiles.length === 0) {
		return;
	}

	// Store profiles for route.js
	$tw.rimir = $tw.rimir || {};
	$tw.rimir.scatteredBinaries = { profiles: [] };

	// Check if file-upload is installed for optional location registration
	var hasFileUpload = !!$tw.wiki.getTiddler("$:/plugins/rimir/file-upload");

	for(var p = 0; p < profiles.length; p++) {
		var profile = profiles[p];
		if(!profile.basePath || !profile.routePrefix || !profile.tiddlerPrefix) {
			logger.log("Skipping profile " + p + ": missing required fields");
			continue;
		}

		// Validate dirPattern regex
		var dirRegex;
		if(profile.dirPattern) {
			try {
				dirRegex = new RegExp(profile.dirPattern);
			} catch(e) {
				logger.log("Skipping profile " + p + ": invalid dirPattern '" + profile.dirPattern + "'");
				continue;
			}
		}

		var basePath = path.resolve($tw.boot.wikiPath, profile.basePath);
		if(!fs.existsSync(basePath)) {
			continue;
		}

		var entries;
		try {
			entries = fs.readdirSync(basePath, {withFileTypes: true});
		} catch(e) {
			continue;
		}

		// Store resolved profile for route.js
		var resolvedProfile = {
			basePath: basePath,
			routePrefix: profile.routePrefix,
			subFolder: profile.subFolder || "documents"
		};
		$tw.rimir.scatteredBinaries.profiles.push(resolvedProfile);

		// Optional: register with file-upload location registry
		if(hasFileUpload) {
			var locationTitle = "$:/config/rimir/file-upload/locations/" + profile.routePrefix.replace(/^\//, "");
			// Don't overwrite existing location tiddler (user may have toggled writable)
			if(!$tw.wiki.tiddlerExists(locationTitle)) {
				$tw.wiki.addTiddler(new $tw.Tiddler({
					title: locationTitle,
					tags: "$:/tags/rimir/file-upload/location",
					type: "application/json",
					text: JSON.stringify({
						name: profile.routePrefix.replace(/^\//, ""),
						uriPrefix: profile.routePrefix + "/",
						writable: false,
						provider: "scattered-binaries",
						basePath: profile.basePath,
						subFolder: profile.subFolder || "documents"
					})
				}));
			}
		}

		// Clean up boot-loaded absolute-filepath tiddlers
		var cleanedUp = 0;
		if($tw.boot.files) {
			var toRemove = [];
			$tw.utils.each($tw.boot.files, function(fileInfo, title) {
				if(!path.isAbsolute(title)) return;
				var rel = path.relative(basePath, fileInfo.filepath);
				if(rel.indexOf("..") === 0) return;
				var parts = rel.split(path.sep);
				var subFolder = profile.subFolder || "documents";
				if(parts.length >= 3 && (!dirRegex || dirRegex.test(parts[0])) && parts[1] === subFolder) {
					toRemove.push(title);
				}
			});
			for(var r = 0; r < toRemove.length; r++) {
				$tw.wiki.deleteTiddler(toRemove[r]);
				delete $tw.boot.files[toRemove[r]];
				cleanedUp++;
			}
		}

		// Scan matching directories
		var totalDocs = 0;
		var dirCount = 0;

		for(var i = 0; i < entries.length; i++) {
			var entry = entries[i];
			if(!entry.isDirectory()) continue;
			if(dirRegex && !dirRegex.test(entry.name)) continue;

			var subFolder = profile.subFolder || "documents";
			var docsDir = path.join(basePath, entry.name, subFolder);
			if(!fs.existsSync(docsDir)) continue;

			var docCount = scanDocuments(docsDir, "", entry.name, subFolder, profile);
			if(docCount > 0) {
				totalDocs += docCount;
				dirCount++;
			}
		}

		if(cleanedUp > 0 || totalDocs > 0) {
			logger.log("[" + profile.routePrefix + "] " + totalDocs + " file(s) from " + dirCount + " dir(s)" + (cleanedUp ? ", " + cleanedUp + " boot duplicates cleaned" : ""));
		}
	}
};

function scanDocuments(baseDir, relPath, dirName, subFolder, profile) {
	var path = require("path");
	var fs = require("fs");
	var count = 0;
	var dirPath = relPath ? path.join(baseDir, relPath) : baseDir;
	var items;

	try {
		items = fs.readdirSync(dirPath, {withFileTypes: true});
	} catch(e) {
		return 0;
	}

	for(var i = 0; i < items.length; i++) {
		var item = items[i];
		var itemRelPath = relPath ? relPath + "/" + item.name : item.name;

		if(item.name === "tiddlywiki.files" || item.name.charAt(0) === ".") {
			continue;
		}

		if(item.isDirectory()) {
			count += scanDocuments(baseDir, itemRelPath, dirName, subFolder, profile);
			continue;
		}

		var ext = path.extname(item.name).toLowerCase();
		var mimeType = BINARY_EXTENSIONS[ext];
		if(!mimeType) {
			continue;
		}

		// Skip files with .meta sidecar (TW handles those natively)
		var fullPath = path.join(dirPath, item.name);
		if(fs.existsSync(fullPath + ".meta")) {
			continue;
		}

		var title = profile.tiddlerPrefix + "/" + dirName + "/" + subFolder + "/" + itemRelPath;
		var encodedDirName = encodeURIComponent(dirName);
		var canonicalUri = profile.routePrefix + "/" + encodedDirName + "/" + itemRelPath;

		if($tw.wiki.tiddlerExists(title)) {
			continue;
		}

		var stat;
		try {
			stat = fs.statSync(fullPath);
		} catch(e) {
			continue;
		}

		var fields = {
			title: title,
			type: mimeType,
			_canonical_uri: canonicalUri,
			text: "",
			created: $tw.utils.stringifyDate(new Date(stat.birthtime || stat.ctime)),
			modified: $tw.utils.stringifyDate(new Date(stat.mtime))
		};
		if(profile.tag) {
			fields.tags = profile.tag;
		}

		$tw.wiki.addTiddler(new $tw.Tiddler(fields));
		count++;
	}

	return count;
}
