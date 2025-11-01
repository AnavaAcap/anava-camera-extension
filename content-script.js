"use strict";
(() => {
  // src/content-script.ts
  async function discoverConfiguration(verbose = false) {
    const configUrl = `${window.location.origin}/.well-known/spa-connector-config.json`;
    try {
      if (verbose) {
        console.log("[Anava Connector] Checking for configuration at:", configUrl);
      }
      const response = await fetch(configUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        },
        // Use no-cors mode to avoid CORS preflight issues
        mode: "cors",
        cache: "no-cache"
      });
      if (!response.ok) {
        if (response.status !== 404) {
          console.log("[Anava Connector] No configuration found (HTTP", response.status, ")");
        }
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          url: configUrl
        };
      }
      const config = await response.json();
      if (!isValidConfig(config)) {
        console.error("[Anava Connector] Invalid configuration structure:", config);
        return {
          success: false,
          error: "Invalid configuration structure",
          url: configUrl
        };
      }
      console.log("[Anava Connector] Configuration discovered successfully:", config);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.set({
            discoveredConfig: config,
            discoveryUrl: configUrl,
            discoveryTime: Date.now()
          });
          if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: "CONFIG_DISCOVERED",
              config,
              url: configUrl,
              origin: window.location.origin
            });
          }
        } catch (error) {
          if (error instanceof Error && !error.message.includes("Extension context invalidated")) {
            console.error("[Anava Connector] Error storing config:", error);
          }
        }
      }
      window.postMessage({
        type: "ANAVA_CONNECTOR_CONFIG_DISCOVERED",
        config
      }, window.location.origin);
      return {
        success: true,
        config,
        url: configUrl
      };
    } catch (error) {
      if (error instanceof Error && !error.message.includes("Unexpected token")) {
        console.log("[Anava Connector] Configuration discovery failed:", error);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        url: configUrl
      };
    }
  }
  function isValidConfig(config) {
    if (typeof config !== "object" || config === null) {
      return false;
    }
    const c = config;
    if (typeof c.version !== "string") return false;
    if (typeof c.extensionId !== "string") return false;
    if (typeof c.backendUrl !== "string") return false;
    if (typeof c.projectId !== "string") return false;
    if (!Array.isArray(c.features)) return false;
    if (!/^[a-p]{32}$/.test(c.extensionId)) {
      console.warn("[Anava Connector] Invalid extension ID format:", c.extensionId);
      return false;
    }
    try {
      new URL(c.backendUrl);
    } catch {
      console.warn("[Anava Connector] Invalid backend URL:", c.backendUrl);
      return false;
    }
    return true;
  }
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) {
      return;
    }
    const message = event.data;
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.error("[Anava Connector] Chrome APIs not available - extension may need to be reloaded");
      return;
    }
    if (message.type === "ANAVA_CONNECTOR_REQUEST_CONFIG") {
      try {
        chrome.storage.local.get(["discoveredConfig"], (result) => {
          if (result.discoveredConfig) {
            window.postMessage({
              type: "ANAVA_CONNECTOR_CONFIG_DISCOVERED",
              config: result.discoveredConfig
            }, window.location.origin);
          }
        });
      } catch (error) {
      }
    } else if (message.type === "ANAVA_CONNECTOR_SCAN_CAMERAS") {
      try {
        chrome.runtime.sendMessage({
          type: "SCAN_CAMERAS",
          ...message.payload
        });
      } catch (error) {
      }
    } else if (message.type === "ANAVA_CONNECTOR_AUTHENTICATE") {
      try {
        chrome.runtime.sendMessage({
          type: "AUTHENTICATE_WITH_BACKEND",
          ...message.payload
        });
      } catch (error) {
      }
    }
  });
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "scan_progress") {
        if (!message.targetOrigin || message.targetOrigin === window.location.origin) {
          console.log("[Content Script] Relaying scan progress to page:", message.data);
          window.postMessage({
            type: "scan_progress",
            data: message.data
          }, window.location.origin);
        }
      } else if (message.type === "CAMERAS_DISCOVERED") {
        window.postMessage({
          type: "ANAVA_CONNECTOR_CAMERAS_DISCOVERED",
          cameras: message.cameras
        }, window.location.origin);
      } else if (message.type === "AUTHENTICATION_RESULT") {
        window.postMessage({
          type: "ANAVA_CONNECTOR_AUTHENTICATION_RESULT",
          success: message.success,
          token: message.token,
          error: message.error
        }, window.location.origin);
      } else if (message.type === "REQUEST_CONFIG_DISCOVERY") {
        discoverConfiguration().then((result) => {
          sendResponse(result);
        });
        return true;
      }
      return false;
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(discoverConfiguration, 500);
    });
  } else {
    setTimeout(discoverConfiguration, 500);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get(["discoveryTime"], (result) => {
          const age = Date.now() - (result.discoveryTime || 0);
          if (age > 5 * 60 * 1e3) {
            discoverConfiguration(false);
          }
        });
      } catch (error) {
      }
    }
  });
  console.log("[Anava Connector] Content script loaded on:", window.location.origin);
})();
