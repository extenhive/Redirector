// Service worker for Redirector extension
import { Redirect } from './redirect.js';

//This is the background script. It is responsible for actually redirecting requests,
//as well as monitoring changes in the redirects and the disabled status and reacting to them.
function log(msg, force) {
	if (log.enabled || force) {
		console.log('REDIRECTOR: ' + msg);
	}
}
log.enabled = false;
var enableNotifications = false;

// In service worker context, we'll default to light theme
// The popup/options pages will handle dark mode separately
var isFirefox = !!navigator.userAgent.match(/Firefox/i);

var storageArea = chrome.storage.local;
//Redirects partitioned by request type, so we have to run through
//the minimum number of redirects for each request.
var partitionedRedirects = {};

//Cache of urls that have just been redirected to. They will not be redirected again, to
//stop recursive redirects, and endless redirect chains.
//Key is url, value is timestamp of redirect.
var ignoreNextRequest = {};

//url => { timestamp:ms, count:1...n};
var justRedirected = {};
var redirectThreshold = 3;

function setIcon(image) {
	var data = { 
		path: {}
	};

	for (let nr of [16,19,32,38,48,64,128]) {
		data.path[nr] = `images/${image}-${nr}.png`;
	}

	chrome.action.setIcon(data, function() {
		var err = chrome.runtime.lastError;
		if (err) {
			//If not checked we will get unchecked errors in the background page console...
			log('Error in SetIcon: ' + err.message);
		}
	});		
}

// Create rules for the declarativeNetRequest API
function createRedirectRules(redirects) {
	let rules = [];
	let ruleIdCounter = 1;

	redirects.forEach(redirect => {
		if (redirect.disabled) return;
		
		// Skip redirects with placeholders - they'll be handled by webNavigation
		if (redirect.redirectUrl.includes('$')) {
			return;
		}

		try {
			// Create a rule for each resource type
			redirect.appliesTo.forEach(resourceType => {
				if (resourceType === 'history') return;

				rules.push({
					id: ruleIdCounter++,
					priority: 1,
					action: {
						type: 'redirect',
						redirect: { url: redirect.redirectUrl }
					},
					condition: {
						regexFilter: redirect.patternType === 'R' ? 
							redirect.includePattern : 
							redirect.includePattern.replace(/\*/g, '.*'),
						resourceTypes: [resourceType],
						isUrlFilterCaseSensitive: false
					}
				});
			});
		} catch (e) {
			log('Error creating rule for ' + redirect.description + ': ' + e.message);
		}
	});

	return rules;
}

// Update dynamic rules when redirects change
function updateDynamicRules(rules) {
	chrome.declarativeNetRequest.getDynamicRules()
		.then(existingRules => {
			const ruleIdsToRemove = existingRules.map(rule => rule.id);
			return chrome.declarativeNetRequest.updateDynamicRules({
				removeRuleIds: ruleIdsToRemove,
				addRules: rules
			});
		})
		.catch(error => {
			log('Error updating declarativeNetRequest rules: ' + error.message, true);
		});
}

//Monitor changes in data, and setup everything again.
function monitorChanges(changes, namespace) {
	if (changes.disabled) {
		updateIcon();

		if (changes.disabled.newValue == true) {
			log('Disabling Redirector');
			// Remove all dynamic rules when disabled
			chrome.declarativeNetRequest.getDynamicRules()
				.then(existingRules => {
					const ruleIdsToRemove = existingRules.map(rule => rule.id);
					return chrome.declarativeNetRequest.updateDynamicRules({
						removeRuleIds: ruleIdsToRemove,
						addRules: []
					});
				});
			
			// Remove webNavigation listeners
			chrome.webNavigation.onBeforeNavigate.removeListener(checkRedirectsWithPlaceholders);
			chrome.webNavigation.onHistoryStateUpdated.removeListener(checkHistoryStateRedirects);
		} else {
			log('Enabling Redirector, setting up listener');
			setUpRedirectListener();
		}
	}

	if (changes.redirects) {
		log('Redirects have changed, setting up listener again');
		setUpRedirectListener();
    }

    if (changes.logging) {
		log.enabled = changes.logging.newValue;
		log('Logging settings have changed to ' + changes.logging.newValue, true); //Always want this to be logged...
	}
	if (changes.enableNotifications){
		log('notifications setting changed to ' + changes.enableNotifications.newValue);
		enableNotifications = changes.enableNotifications.newValue;
	}
}
chrome.storage.onChanged.addListener(monitorChanges);

//Creates a filter to pass to the listener
function createFilter(redirects) {
	var types = [];
	for (var i = 0; i < redirects.length; i++) {
		var r = redirects[i];
		if (r.disabled) {
			continue;
		}
		
		for (var j = 0; j < r.appliesTo.length; j++) {
			var type = r.appliesTo[j];
			if (types.indexOf(type) == -1) {
				types.push(type);
			}
		}
	}
	
	if (types.indexOf('history') != -1) {
		//Special case, history type cannot be filtered using webRequest api
		types.splice(types.indexOf('history'), 1);
	}
	
	return {
		urls: ["<all_urls>"],
		types: types
	};
}

function createPartitionedRedirects(redirects) {
	var partitioned = {};
	
	for (var i = 0; i < redirects.length; i++) {
		var redirect = redirects[i];
		if (redirect.disabled) {
			continue;
		}
		
		// Convert plain object to Redirect instance
		if (!(redirect instanceof Redirect)) {
			try {
				redirect = new Redirect(redirect);
			} catch (e) {
				log('Error creating Redirect instance: ' + e.message, true);
				continue;
			}
		}
		
		for (var j = 0; j < redirect.appliesTo.length; j++) {
			var type = redirect.appliesTo[j];
			if (!partitioned[type]) {
				partitioned[type] = [];
			}
			
			partitioned[type].push(redirect);
		}
	}
	
	return partitioned;
}

// This is for redirects with placeholders ($1, $2, etc.)
function checkRedirectsWithPlaceholders(details) {
	// Skip if the URL was recently redirected to prevent redirect loops
	if (ignoreNextRequest[details.url]) {
		log('Ignoring ' + details.url + ', was just redirected recently');
		delete ignoreNextRequest[details.url];
		return;
	}
	
	// Skip non-main frame navigations
	if (details.frameId !== 0) {
		return;
	}
	
	log('Checking redirect with placeholders for: ' + details.url);
	
	// Loop through all redirect types that apply to 'main_frame'
	const redirectList = partitionedRedirects['main_frame'];
	if (!redirectList) return;
	
	for (const redirect of redirectList) {
		// Only process redirects that have placeholders
		if (!redirect.redirectUrl.includes('$')) continue;
		
		// Make sure we're working with a Redirect instance
		const redirectInstance = redirect instanceof Redirect ? 
			redirect : new Redirect(redirect);
		
		const result = redirectInstance.getMatch(details.url);
		if (result.isMatch) {
			log('Placeholder redirect matched: ' + details.url + ' ===> ' + result.redirectTo);
			
			// Prevent redirect loops
			ignoreNextRequest[result.redirectTo] = new Date().getTime();
			
			// Redirect using tabs API
			chrome.tabs.update(details.tabId, { url: result.redirectTo });
			
			// Show notification if enabled
			if (enableNotifications) {
				sendNotifications(redirectInstance, details.url, result.redirectTo);
			}
			
			// We've handled this URL, so we can stop checking
			break;
		}
	}
}

function setUpRedirectListener() {
	log('Setting up listener');
	
	chrome.storage.local.get({redirects:[], disabled:false}, function(obj) {
		if (obj.disabled) {
			log('Redirector is disabled, not setting up listener');
			return;
		}
		
		// Ensure redirects are properly initialized
		if (!obj.redirects || obj.redirects.length === 0) {
			log('No redirects found, initializing with example redirect');
			const exampleRedirect = {
				"description": "Example redirect, try going to http://example.com/anywordhere",
				"exampleUrl": "http://example.com/some-word-that-matches-wildcard",
				"exampleResult": "https://google.com/search?q=some-word-that-matches-wildcard",
				"error": null,
				"includePattern": "http://example.com/*",
				"excludePattern": "",
				"patternDesc": "Any word after example.com leads to google search for that word.",
				"redirectUrl": "https://google.com/search?q=$1",
				"patternType": "W",
				"processMatches": "noProcessing",
				"disabled": false,
				"appliesTo": ["main_frame"]
			};
			
			chrome.storage.local.set({redirects: [exampleRedirect]}, function() {
				obj.redirects = [exampleRedirect];
				initializeRedirects(obj);
			});
		} else {
			initializeRedirects(obj);
		}
	});
}

function initializeRedirects(obj) {
	partitionedRedirects = createPartitionedRedirects(obj.redirects);
	
	// First, handle redirects with standard patterns (no placeholders)
	const rules = createRedirectRules(obj.redirects);
	updateDynamicRules(rules);
	
	// Now set up listeners for redirects with placeholders and history state changes
	
	// Check if we have any redirects with placeholders
	const hasPlaceholderRedirects = obj.redirects.some(r => 
		!r.disabled && r.redirectUrl.includes('$') && 
		r.appliesTo.includes('main_frame'));
	
	if (hasPlaceholderRedirects) {
		log('Setting up listener for redirects with placeholders');
		chrome.webNavigation.onBeforeNavigate.removeListener(checkRedirectsWithPlaceholders);
		chrome.webNavigation.onBeforeNavigate.addListener(checkRedirectsWithPlaceholders);
	}
	
	// Handle history state changes for single-page applications
	if (partitionedRedirects.history) {
		log('Setting up listener for history state changes');
		chrome.webNavigation.onHistoryStateUpdated.removeListener(checkHistoryStateRedirects);
		chrome.webNavigation.onHistoryStateUpdated.addListener(checkHistoryStateRedirects);
	}
	
	// Set up listener for redirect completion to show notifications if enabled
	if (enableNotifications) {
		chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(function(info) {
			const redirect = obj.redirects.find(r => 
				info.rule.condition.regexFilter === r.patternType === 'R' ? 
					r.includePattern : 
					r.includePattern.replace(/\*/g, '.*'));
			
			if (redirect) {
				sendNotifications(
					redirect, 
					info.request.url, 
					info.rule.action.redirect.url
				);
			}
		});
	}
}

function checkHistoryStateRedirects(ev) {
	if (ev.frameId !== 0) {
		// Only check main frame
		return;
	}
	
	log('History state updated for ' + ev.url);
	
	var list = partitionedRedirects.history;
	if (!list) {
		return;
	}
	
	for (var i = 0; i < list.length; i++) {
		var redirect = list[i];
		// Make sure we're working with a Redirect instance
		var redirectInstance = redirect instanceof Redirect ? 
			redirect : new Redirect(redirect);
		
		var result = redirectInstance.getMatch(ev.url);
		
		if (result.isMatch) {
			log('History state redirecting ' + ev.url + ' to ' + result.redirectTo);
			if (enableNotifications) {
				sendNotifications(redirectInstance, ev.url, result.redirectTo);
			}
			
			// Navigate the tab
			chrome.tabs.update(ev.tabId, {url: result.redirectTo});
			break;
		}
	}
}

function updateIcon() {
	chrome.storage.local.get({disabled:false}, function(obj) {
		var icon = 'icon-light-theme';
		
		if (obj.disabled) {
			chrome.action.setBadgeText({text: 'off'});
			chrome.action.setBadgeBackgroundColor({color: '#fc5953'});
			if (chrome.action.setBadgeTextColor) {
				chrome.action.setBadgeTextColor({color: '#fafafa'});
			}
		} else {
			chrome.action.setBadgeText({text: 'on'});
			chrome.action.setBadgeBackgroundColor({color: '#35b44a'});
			if (chrome.action.setBadgeTextColor) {
				chrome.action.setBadgeTextColor({color: '#fafafa'});
			}
		}
		
		setIcon(icon);
	});
}

function sendNotifications(redirect, originalUrl, redirectedUrl) {
	var opt = {
		type: "basic",
		title: "Redirector",
		message: "Redirected " + originalUrl.substring(0, 50) + "..." + (originalUrl.length > 50 ? "..." : "") + " → " + redirectedUrl,
		iconUrl: "images/icon-light-theme-48.png"
	};
	
	chrome.notifications.create(opt);
}

chrome.runtime.setUninstallURL("https://extenhub.com/uninstall?extension=Redirector");

// Set up on install
chrome.runtime.onInstalled.addListener(function(details) {
	log('Extension installed or updated');
	updateIcon();
	setUpRedirectListener();
	
	// Initialize settings if needed
	chrome.storage.local.get({logging:false, enableNotifications:false}, function(obj) {
		log.enabled = obj.logging;
		enableNotifications = obj.enableNotifications;
	});

	// Open website on first install
	if (details.reason === 'install') {
		chrome.tabs.create({
			url: 'https://extenhub.com/installed'
		});
	} else if (details.reason === 'update') {
		chrome.tabs.create({
			url: 'https://extenhub.com/update'
		});
	}
});

// Set up on startup
chrome.runtime.onStartup.addListener(function() {
	log('Browser started, initializing Redirector');
	updateIcon();
	setUpRedirectListener();
});

// Initial setup
updateIcon();
setUpRedirectListener();

// Listen for messages from the popup or options page
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	if (message.type === "save-redirects") {
		log('Received save-redirects message');
		// Save redirects in storage
		chrome.storage.local.set({redirects: message.redirects}, function() {
			log('Redirects saved to storage');
			setUpRedirectListener();
			sendResponse({message: "Redirects saved successfully"});
		});
		return true; // Keep the message channel open for async response
	}
	
	// Toggle sync setting
	if (message.type === "toggle-sync") {
		const newSyncEnabled = message.isSyncEnabled;
		// In MV3, we can check if sync is available
		if (chrome.storage.sync) {
			chrome.storage.local.set({isSyncEnabled: newSyncEnabled}, function() {
				log('Sync setting updated to: ' + newSyncEnabled);
				sendResponse({message: newSyncEnabled ? "sync-enabled" : "sync-disabled"});
			});
		} else {
			sendResponse({message: "Sync Not Possible - Not available in this browser"});
		}
		return true; // Keep the message channel open for async response
	}
	
	if (message.type === "get-redirects") {
		chrome.storage.local.get({redirects:[]}, function(obj) {
			sendResponse({redirects: obj.redirects});
		});
		return true; // Keep the message channel open for async response
	}
	
	if (message.type === "update-icon") {
		updateIcon();
		sendResponse({message: "Icon updated"});
		return true;
	}

	// Handle unknown message types
	sendResponse({message: "Unknown message type"});
	return false;
});