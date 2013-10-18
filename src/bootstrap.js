/*
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 *  Contributor(s):
 *  - Edward Lee <edilee@mozilla.com> (watchWindows for bootstrap.js)
 *  - Zulkarnain K. <addons@loucypher.oib.com> (about:newtab context menu)
 */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows(callback): Apply a callback to each browser window.
 * @param [function] callback: 1-parameter function that gets a browser window.
 */
function watchWindows(callback) {
  // Wrap the callback in a function that ignores failures
  function watcher(window) {
    try {
      // Now that the window has loaded, only handle browser windows
      let {documentElement} = window.document;
      if (documentElement.getAttribute("windowtype") == "navigator:browser")
        callback(window);
    }
    catch(ex) {}
  }

  // Wait for the window to finish loading before running the callback
  function runOnLoad(window) {
    // Listen for one load event before checking the window type
    window.addEventListener("load", function runOnce() {
      window.removeEventListener("load", runOnce, false);
      watcher(window);
    }, false);
  }

  // Add functionality to existing windows
  let windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    // Only run the watcher immediately if the window is completely loaded
    let window = windows.getNext();
    if (window.document.readyState == "complete")
      watcher(window);
    // Wait for the window to load before continuing
    else
      runOnLoad(window);
  }

  // Watch for new browser windows opening then wait for it to load
  function windowWatcher(subject, topic) {
    if (topic == "domwindowopened")
      runOnLoad(subject);
  }
  Services.ww.registerNotification(windowWatcher);

  // Make sure to stop watching for windows if we're unloading
  unload(function() Services.ww.unregisterNotification(windowWatcher));
}

/**
 * Save callbacks to run when unloading. Optionally scope the callback to a
 * container, e.g., window. Provide a way to run all the callbacks.
 *
 * @usage unload(): Run all callbacks and release them.
 *
 * @usage unload(callback): Add a callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 *
 * @usage unload(callback, container) Add a scoped callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @param [node] container: Remove the callback when this container unloads.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 */
function unload(callback, container) {
  // Initialize the array of unloaders on the first usage
  let unloaders = unload.unloaders;
  if (unloaders == null)
    unloaders = unload.unloaders = [];

  // Calling with no arguments runs all the unloader callbacks
  if (callback == null) {
    unloaders.slice().forEach(function(unloader) unloader());
    unloaders.length = 0;
    return;
  }

  // The callback is bound to the lifetime of the container if we have one
  if (container != null) {
    // Remove the unloader when the container unloads
    container.addEventListener("unload", removeUnloader, false);

    // Wrap the callback to additionally remove the unload listener
    let origCallback = callback;
    callback = function() {
      container.removeEventListener("unload", removeUnloader, false);
      origCallback();
    }
  }

  // Wrap the callback in a function that ignores failures
  function unloader() {
    try {
      callback();
    }
    catch(ex) {}
  }
  unloaders.push(unloader);

  // Provide a way to remove the unloader
  function removeUnloader() {
    let index = unloaders.indexOf(unloader);
    if (index != -1)
      unloaders.splice(index, 1);
  }
  return removeUnloader;
}


function addContextMenu(window) {
  if (initialized)
    return;

  let initialized = true;

  Cu.import("resource://gre/modules/NewTabUtils.jsm");

  let document = window.document;

  function $(aId) {
    return document.getElementById(aId);
  }

  function log(aString) {
    Services.console.logStringMessage("newtab: " + aString);
  }

  function alertBox(aTitle, aMessage) {
    Services.prompt.alert(null, aTitle, aMessage);
  }

  function promptBox(aTitle, aMessage, aValue) {
    let check = { value: false };
    let input = { value: aValue };
    let ask = Services.prompt.prompt(null, aTitle, aMessage, input, null, check);
    if (ask)
      return input.value;
    else
      return false;
  }

  function addIndex() {
    let target = window.gContextMenu.target;
    let links = target.ownerDocument.querySelectorAll("a.newtab-link");
    for (let i = 0; i < links.length; i++) {
      links[i].index = i;
    }
  }

  function pinLink(aIndex, aTitle, aURL) {
    NewTabUtils.pinnedLinks.links[aIndex] = { title: aTitle, url: aURL }
    NewTabUtils.pinnedLinks.save();
  }

  function unpinLink(aIndex) {
    NewTabUtils.pinnedLinks.links[aIndex] = null;
    NewTabUtils.pinnedLinks.save();
  }

  function updatePage(aLink, aIndex) {
    let pinnedLink = NewTabUtils.pinnedLinks.links[aIndex]
    aLink.title = pinnedLink.title + "\n" + pinnedLink.url;
    NewTabUtils.pinnedLinks.save();
    NewTabUtils.allPages.update();
  }

  function renameTitle() {
    let link = window.gContextMenu.link;
    if (!link.index)
      addIndex();

    let pinnedLink = NewTabUtils.pinnedLinks.links[link.index];
    let title = promptBox("Rename title", "Enter new title", link.lastChild.textContent);
    if (title) {
      if (!pinnedLink)
        pinLink(link.index, title, link.href);
      else
        pinnedLink.title = title;

      updatePage(link, link.index);
    }
  }

  function changeURL() {
    let link = window.gContextMenu.link;
    if (!link.index)
      addIndex();

    let pinnedLink = NewTabUtils.pinnedLinks.links[link.index];
    let url = promptBox("Change URL", "Enter new URL:", link.href);
    if (url) {
      if (!/^[a-z](?=[a-z0-9\+\.\-]+:)/.test(url))
        url = "http://" + url;

      if (!pinnedLink)
        pinLink(link.index, link.lastChild.textContent, url);
      else
        pinnedLink.url = url;

      updatePage(link, link.index);
    }
  }

  function initContextMenu(aEvent) {
    let show = window.gContextMenu.target.ownerDocument.URL = "about:newtab" &&
               (window.gContextMenu.onLink &&
                window.gContextMenu.link.className === "newtab-link");

    ["url", "title", "separator"].forEach(function(item) {
      window.gContextMenu.showItem("context-newtab-" + item, show);
    })
  }

  ["NewTab:renameTitle", "NewTab:changeURL"].forEach(function(id) {
    $("mainCommandSet").appendChild(document.createElement("command")).id = id;
    //log($(id).localName);
  })

  $("NewTab:changeURL").addEventListener("command", changeURL)
  $("NewTab:renameTitle").addEventListener("command", renameTitle);

  let context = $("contentAreaContextMenu");
  let menus = [
    { id: "context-newtab-separator", label: null,            command: null },
    { id: "context-newtab-url",       label: "Change URL",    command: "NewTab:changeURL" },
    { id: "context-newtab-title",     label: "Rename Title",  command: "NewTab:renameTitle" }
  ]
  menus.forEach(function(item) {
    let menu;
    if (item.label && item.command) {
      menu = document.createElement("menuitem");
      menu.id = item.id;
      menu.setAttribute("label", item.label);
      menu.setAttribute("command", item.command);
    }
    else {
      menu = document.createElement("menuseparator");
      menu.id = item.id;
    }
    context.insertBefore(menu, $("page-menu-separator").nextSibling);
    //log($(item.id).localName);
  })

  context.addEventListener("popupshowing", initContextMenu);
  context.removeEventListener("popuphiding", initContextMenu);

  unload(function() {
    if (!initialized)
      return;

    initialized = false;

    context.removeEventListener("popupshowing", initContextMenu);

    ["NewTab:renameTitle", "NewTab:changeURL", menus[0].id, menus[1].id, menus[2].id].
    forEach(function(id) {
      let node = $(id);
      node.parentNode.removeChild(node);
    })

  }, window)
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup(data, reason) {
  let uri = Services.io.newURI("chrome://kojiyuu/skin/kojiyuu.css", null, null);
  let SSS = Cc["@mozilla.org/content/style-sheet-service;1"].
            getService(Ci.nsIStyleSheetService);
  if (!SSS.sheetRegistered(uri, SSS.USER_SHEET))
    SSS.loadAndRegisterSheet(uri, SSS.USER_SHEET);

  watchWindows(addContextMenu);
}

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {}
