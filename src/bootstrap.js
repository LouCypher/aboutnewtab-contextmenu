/*
 *  This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 *  file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 *  Contributor(s):
 *  - LouCypher (original code)
 */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

function log(aString) {
  Services.console.logStringMessage("Bootstrap:\n" + aString);
}

function resProtocolHandler(aResourceName, aURI) {
  Services.io.getProtocolHandler("resource")
             .QueryInterface(Ci.nsIResProtocolHandler)
             .setSubstitution(aResourceName, aURI, null)
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
    let url = promptBox("Change location", "Enter new location:", link.href);
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
                window.gContextMenu.link.classList.contains("newtab-link"));

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
    { id: "context-newtab-separator", label: null,              command: null },
    { id: "context-newtab-url",       label: "Change Location", command: "NewTab:changeURL" },
    { id: "context-newtab-title",     label: "Rename Title",    command: "NewTab:renameTitle" }
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
  // Add resource alias
  resourceName = data.id.toLowerCase().match(/[^\@]+/).toString().replace(/[^\w]/g, "");
  //log(resourceName);
  resProtocolHandler(resourceName, data.resourceURI);

  // Load module
  Cu.import("resource://" + resourceName + "/watchwindows.jsm");

  watchWindows(addContextMenu);
}

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason == APP_SHUTDOWN)
    return;

  unload();

  // Unload module
  Cu.unload("resource://" + resourceName + "/watchwindows.jsm");
  
  // Remove resource
  resProtocolHandler(resourceName, null);
}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {}
