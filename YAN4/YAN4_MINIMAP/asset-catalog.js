/**
 * 포토샵 PNG 카탈로그 — assets/custom/catalog.json
 */
(function (root) {
  "use strict";

  var CATALOG_URL = "assets/custom/catalog.json";
  var catalog = { version: 1, basePath: "assets/custom", cellPx: 32, assets: {} };
  var loadDone = false;

  function joinPath(base, file) {
    if (!file) return "";
    if (/^(https?:|file:|data:)/i.test(file)) return file;
    var b = String(base || "").replace(/\/+$/, "");
    var f = String(file).replace(/^\/+/, "");
    return b ? b + "/" + f : f;
  }

  function assetEntry(id) {
    if (!id) return null;
    var assets = catalog.assets || {};
    return assets[id] || null;
  }

  function resolveUrl(assetIdOrPath) {
    if (!assetIdOrPath) return "";
    var raw = String(assetIdOrPath);
    if (/^(https?:|file:|data:|assets\/)/i.test(raw)) return raw;
    var ent = assetEntry(raw);
    if (ent && ent.file) {
      return joinPath(catalog.basePath, ent.file);
    }
    return joinPath(catalog.basePath, raw);
  }

  function cellPx() {
    return catalog.cellPx > 0 ? catalog.cellPx : 32;
  }

  function defaultZoom() {
    return cellPx();
  }

  function backgroundStyle(bg, zoom) {
    if (!bg || bg.enabled !== true) return "";
    var url = bg.image ? resolveUrl(bg.image) : resolveUrl(bg.asset);
    if (!url) return "";
    var z = zoom > 0 ? zoom : cellPx();
    var mode = String(bg.mode || "repeat").toLowerCase();
    var size =
      mode === "cover" || mode === "contain"
        ? "100% 100%"
        : z + "px " + z + "px";
    var repeat = mode === "repeat" ? "repeat" : "no-repeat";
    return (
      "background-image:url('" +
      url.replace(/'/g, "%27") +
      "');background-size:" +
      size +
      ";background-repeat:" +
      repeat +
      ";background-position:0 0;"
    );
  }

  function spriteLayerStyle(assetId, zoom) {
    var url = resolveUrl(assetId);
    if (!url) return "";
    var z = zoom > 0 ? zoom : cellPx();
    return (
      "background-image:url('" +
      url.replace(/'/g, "%27") +
      "');background-size:100% 100%;background-repeat:no-repeat;background-position:center;"
    );
  }

  function baseMapLayerStyle(baseMap, zoom, cols, rows) {
    if (!baseMap) return "";
    var url = baseMap.image ? resolveUrl(baseMap.image) : resolveUrl(baseMap.asset);
    if (!url) return "";
    var mode = String(baseMap.mode || "contain").toLowerCase();
    var repeat = mode === "repeat" ? "repeat" : "no-repeat";
    var size = mode === "repeat" ? cellPx() * (cols || 1) + "px " + cellPx() * (rows || 1) + "px" : "100% 100%";
    void zoom;
    return (
      "background-image:url('" +
      url.replace(/'/g, "%27") +
      "');background-size:" +
      size +
      ";background-repeat:" +
      repeat +
      ";background-position:0 0;"
    );
  }

  function listAssets() {
    var out = [];
    var assets = catalog.assets || {};
    Object.keys(assets).forEach(function (id) {
      var a = assets[id];
      out.push({
        id: id,
        label: (a && a.label) || id,
        file: a && a.file ? joinPath(catalog.basePath, a.file) : "",
      });
    });
    return out;
  }

  function applyCatalog(parsed) {
    if (!parsed || typeof parsed !== "object") return;
    catalog.version = parsed.version != null ? parsed.version : 1;
    catalog.basePath = parsed.basePath || "assets/custom";
    catalog.cellPx = parsed.cellPx > 0 ? parsed.cellPx : 32;
    catalog.assets = parsed.assets && typeof parsed.assets === "object" ? parsed.assets : {};
  }

  function init(onReady) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", CATALOG_URL, true);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          applyCatalog(JSON.parse(xhr.responseText));
        } catch (e) {}
      }
      loadDone = true;
      if (root.document && root.document.dispatchEvent) {
        root.document.dispatchEvent(new CustomEvent("yan4-assets-ready"));
      }
      if (onReady) onReady();
    };
    xhr.onerror = function () {
      loadDone = true;
      if (root.document && root.document.dispatchEvent) {
        root.document.dispatchEvent(new CustomEvent("yan4-assets-ready"));
      }
      if (onReady) onReady();
    };
    xhr.send();
  }

  root.Yan4AssetCatalog = {
    init: init,
    isReady: function () {
      return loadDone;
    },
    cellPx: cellPx,
    defaultZoom: defaultZoom,
    resolveUrl: resolveUrl,
    backgroundStyle: backgroundStyle,
    spriteLayerStyle: spriteLayerStyle,
    baseMapLayerStyle: baseMapLayerStyle,
    listAssets: listAssets,
    getCatalog: function () {
      return catalog;
    },
  };
})(typeof window !== "undefined" ? window : this);
