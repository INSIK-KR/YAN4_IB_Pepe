(function () {
  "use strict";

  var HOST_ID = "yna4BipyoLabelPrintHost";
  var CSS_ID = "yna4-bipyo-label-print-css-v32";
  var SEAL_PATH = "media/farm-fresh-seal.png";
  var GOMGOM_LOGO_PATH = "media/gomgom-logo.png";
  var PRINT_BODY_CLASS = "yna4-bipyo-print-mode";
  /** 비표 — 세로 60mm(가로) × 80mm(세로). RCRT는 80×60 가로 */
  var LABEL_WIDTH_MM = 60;
  var LABEL_HEIGHT_MM = 80;
  var LABEL_INSET_MM = 1;
  var LABEL_BORDER_MM = 0.7;
  var LABEL_FRAME_PAD_MM = 1;
  var LABEL_FRAME_PAD_BOTTOM_MM = 1.1;
  /** 기존 16.25mm × 1.25 */
  var SEAL_MM = 20.3125;
  var GOMGOM_LOGO_MAX_MM = 7;
  var BARCODE_ROW_MM = 12;
  var MAX_QTY = 99;
  var ORIGIN_TEXT = "국내산";

  var JSBARCODE_OPTS = {
    format: "CODE128",
    displayValue: true,
    fontOptions: "bold",
    font: "Arial, sans-serif",
    fontSize: 9,
    textMargin: 0.5,
    width: 1.4,
    height: 36,
    margin: 0,
  };

  function getAssetUrl(path) {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.getURL === "function"
    ) {
      return chrome.runtime.getURL(path);
    }
    return path;
  }

  function getSealUrl() {
    return getAssetUrl(SEAL_PATH);
  }

  function getGomgomLogoUrl() {
    return getAssetUrl(GOMGOM_LOGO_PATH) + "?v=2";
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function clampQty(raw) {
    var n = parseInt(String(raw || "").trim(), 10);
    if (!isFinite(n) || n < 1) return 1;
    if (n > MAX_QTY) return MAX_QTY;
    return n;
  }

  function trimField(raw) {
    return String(raw || "").trim();
  }

  function collectFormData(fields) {
    return {
      productName: trimField(fields.productName && fields.productName.value),
      productName2: trimField(fields.productName2 && fields.productName2.value),
      weight: trimField(fields.weight && fields.weight.value),
      packager: trimField(fields.packager && fields.packager.value),
      customerService: trimField(
        fields.customerService && fields.customerService.value
      ),
      mfgDate: trimField(fields.mfgDate && fields.mfgDate.value),
      barcode: trimField(fields.barcode && fields.barcode.value),
      showSeal: true,
      showGomgom: !!(fields.showGomgom && fields.showGomgom.checked),
    };
  }

  function disableForeignLabelPrintCss() {
    var nodes = document.querySelectorAll(
      'style[id^="yna4-rcrt-label-print-css"]'
    );
    var i;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].disabled = true;
      nodes[i].setAttribute("data-yna4-print-disabled", "1");
    }
  }

  function restoreForeignLabelPrintCss() {
    var nodes = document.querySelectorAll(
      'style[id^="yna4-rcrt-label-print-css"][data-yna4-print-disabled="1"]'
    );
    var i;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].disabled = false;
      nodes[i].removeAttribute("data-yna4-print-disabled");
    }
  }

  function ensurePrintCss() {
    disableForeignLabelPrintCss();
    var old = document.getElementById(CSS_ID);
    if (old) old.remove();
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent =
      "#" +
      HOST_ID +
      "{display:none}" +
      "@media print{" +
      "@page{size:" +
      LABEL_WIDTH_MM +
      "mm " +
      LABEL_HEIGHT_MM +
      "mm;margin:0}" +
      "html,body{width:" +
      LABEL_WIDTH_MM +
      "mm!important;height:auto!important;max-height:none!important;overflow:visible!important;margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "body." +
      PRINT_BODY_CLASS +
      ">*:not(#" +
      HOST_ID +
      "){display:none!important}" +
      "body." +
      PRINT_BODY_CLASS +
      " #" +
      HOST_ID +
      "{display:block!important;position:static!important;width:" +
      LABEL_WIDTH_MM +
      "mm!important;height:auto!important;margin:0!important;padding:0!important}" +
      ".yna4-bipyo-label-page{page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;" +
      "width:" +
      LABEL_WIDTH_MM +
      "mm;height:" +
      LABEL_HEIGHT_MM +
      "mm;max-width:" +
      LABEL_WIDTH_MM +
      "mm;max-height:" +
      LABEL_HEIGHT_MM +
      "mm;box-sizing:border-box;padding:" +
      LABEL_INSET_MM +
      "mm;overflow:hidden;background:#fff}" +
      ".yna4-bipyo-label-page--last{page-break-after:auto;break-after:auto}" +
      ".yna4-bipyo-label-frame{width:100%;height:100%;box-sizing:border-box;" +
      "border:" +
      LABEL_BORDER_MM +
      "mm solid #000;padding:" +
      LABEL_FRAME_PAD_MM +
      "mm " +
      LABEL_FRAME_PAD_MM +
      "mm " +
      LABEL_FRAME_PAD_BOTTOM_MM +
      "mm " +
      LABEL_FRAME_PAD_MM +
      "mm;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;overflow:visible}" +
      ".yna4-bipyo-brand-row{width:100%;box-sizing:border-box;flex:0 0 auto;display:flex;align-items:center;justify-content:center;" +
      "overflow:visible;margin:0 0 1mm 0;padding-top:0.2mm}" +
      ".yna4-bipyo-gomgom-logo{display:block;width:auto;height:auto;max-height:" +
      GOMGOM_LOGO_MAX_MM +
      "mm;max-width:90%;object-fit:contain;object-position:center top;margin-top:3pt}" +
      ".yna4-bipyo-product-name{width:100%;box-sizing:border-box;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial Black,sans-serif;font-weight:900;color:#000;" +
      "line-height:1.05;letter-spacing:-0.01em;white-space:nowrap;text-align:center;margin:2.5mm 0 0.4mm 0;" +
      "-webkit-text-stroke:0.9px #000;text-stroke:0.9px #000;paint-order:stroke fill}" +
      ".yna4-bipyo-product-name--solo{margin-bottom:1.2mm}" +
      ".yna4-bipyo-product-name--line2{margin:0 0 1.2mm 0}" +
      ".yna4-bipyo-label-frame--twoline .yna4-bipyo-product-name{transform:translateY(-5pt)}" +
      ".yna4-bipyo-label-frame--twoline .yna4-bipyo-product-name--line2{margin-bottom:0.4mm}" +
      ".yna4-bipyo-label-frame--twoline .yna4-bipyo-mid-row{min-height:9.5mm;margin:0.4mm 0 0.2mm 0;overflow:visible;z-index:5}" +
      ".yna4-bipyo-label-frame--twoline .yna4-bipyo-weight-pill{position:relative;z-index:10;transform:translateY(-6pt)}" +
      ".yna4-bipyo-label-frame--twoline .yna4-bipyo-seal{top:42%;transform:translateY(calc(-50% + 4pt));z-index:10}" +
      ".yna4-bipyo-label-frame--twoline .yna4-bipyo-mfg-date{top:42%;right:17pt;transform:translateY(calc(-50% + 7pt));z-index:2}" +
      ".yna4-bipyo-label-frame--twoline .yna4-bipyo-info{position:relative;z-index:1;flex:0 0 auto;min-height:auto;" +
      "margin-top:auto;margin-bottom:0;padding-top:0;padding-bottom:0.4mm;" +
      "background:transparent;gap:0.2mm;line-height:1.25;overflow:visible}" +
      ".yna4-bipyo-label-frame--twoline .yna4-bipyo-foot{margin-top:0.8mm;padding-top:0.4mm;flex:0 0 auto;position:relative;z-index:1}" +
      ".yna4-bipyo-mid-row{width:100%;box-sizing:border-box;position:relative;display:flex;flex-direction:row;align-items:center;justify-content:center;" +
      "min-height:" +
      SEAL_MM +
      "mm;margin:2.2mm 0 1.4mm 0;z-index:5}" +
      ".yna4-bipyo-weight-pill{flex:0 0 auto;width:fit-content;max-width:fit-content;box-sizing:border-box;background:#000;color:#fff;border-radius:999px;" +
      "padding:0.7mm 2.4mm;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-weight:900;line-height:1.15;white-space:nowrap;text-align:center;position:relative;z-index:10}" +
      ".yna4-bipyo-seal{position:absolute;left:-8pt;top:50%;transform:translateY(calc(-50% + 8pt));width:" +
      SEAL_MM +
      "mm;height:" +
      SEAL_MM +
      "mm;object-fit:contain;display:block;z-index:10}" +
      ".yna4-bipyo-mfg-date{position:absolute;right:17pt;top:50%;transform:translateY(calc(-50% + 25pt));box-sizing:border-box;" +
      "max-width:" +
      SEAL_MM +
      "mm;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-weight:900;color:#000;" +
      "line-height:1.1;white-space:nowrap;text-align:right;overflow:hidden;z-index:2}" +
      ".yna4-bipyo-info{width:100%;box-sizing:border-box;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;justify-content:flex-start;gap:0.2mm;" +
      "margin-top:1.2mm;padding-left:10pt;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-weight:700;font-size:9pt;line-height:1.25;color:#000;position:relative;z-index:1}" +
      ".yna4-bipyo-info-line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".yna4-bipyo-foot{width:100%;box-sizing:border-box;margin-top:auto;padding-top:0.8mm;transform:translateY(-1.5pt)}" +
      ".yna4-bipyo-bc-wrap{width:100%;display:flex;align-items:flex-end;justify-content:center;height:" +
      BARCODE_ROW_MM +
      "mm;overflow:visible}" +
      ".yna4-bipyo-bc{display:block;width:100%!important;max-width:100%!important;height:auto!important;max-height:" +
      BARCODE_ROW_MM +
      "mm!important}" +
      "}";
    document.head.appendChild(st);
  }

  function ensurePrintHost() {
    var host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    document.body.appendChild(host);
    return host;
  }

  function fitTextToWidth(el, text, widthPx, minPt, maxPt) {
    if (!el || widthPx <= 0) return minPt;
    el.textContent = String(text || "");
    el.style.fontFamily = "'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
    el.style.fontWeight = "900";
    el.style.whiteSpace = "nowrap";
    el.style.width = Math.floor(widthPx) + "px";
    var lo = minPt;
    var hi = maxPt;
    var best = minPt;
    while (lo <= hi) {
      var mid = Math.floor((lo + hi) / 2);
      el.style.fontSize = mid + "pt";
      if (el.scrollWidth <= widthPx) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    el.style.fontSize = best + "pt";
    return best;
  }

  function fitWeightPill(el, text, maxWidthPx) {
    if (!el) return 13;
    var val = String(text || "");
    el.textContent = val;
    el.style.width = "auto";
    el.style.maxWidth = "none";
    if (!val || maxWidthPx <= 0) {
      el.style.fontSize = "13pt";
      return 13;
    }
    var probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.left = "-9999px";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "nowrap";
    probe.style.fontFamily = "'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
    probe.style.fontWeight = "900";
    probe.textContent = val;
    document.body.appendChild(probe);
    var lo = 10;
    var hi = 18;
    var best = 13;
    while (lo <= hi) {
      var mid = Math.floor((lo + hi) / 2);
      probe.style.fontSize = mid + "pt";
      if (probe.offsetWidth <= maxWidthPx) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    document.body.removeChild(probe);
    el.style.fontSize = best + "pt";
    return best;
  }

  function fitMfgDate(el, text, maxWidthPx, weightPt) {
    if (!el) return;
    var val = String(text || "").trim();
    el.textContent = val;
    if (!val) {
      el.style.fontSize = "11pt";
      return;
    }
    var target = Math.max(9, Math.round((weightPt || 13) * 0.88) + 2);
    var probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.left = "-9999px";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "nowrap";
    probe.style.fontFamily = "'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
    probe.style.fontWeight = "900";
    probe.textContent = val;
    document.body.appendChild(probe);
    var lo = 6;
    var hi = target;
    var best = 6;
    while (lo <= hi) {
      var mid = Math.floor((lo + hi) / 2);
      probe.style.fontSize = mid + "pt";
      if (!maxWidthPx || probe.offsetWidth <= maxWidthPx) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    document.body.removeChild(probe);
    el.style.fontSize = best + "pt";
  }

  function fitAllLabelTypography(host) {
    var pages = host.querySelectorAll(".yna4-bipyo-label-page");
    if (!pages.length) return;
    var frame0 = pages[0].querySelector(".yna4-bipyo-label-frame");
    if (!frame0) return;
    var widthPx = frame0.clientWidth;
    if (widthPx < 40) {
      widthPx = Math.floor(
        (LABEL_WIDTH_MM - LABEL_INSET_MM * 2 - LABEL_BORDER_MM * 2 - LABEL_FRAME_PAD_MM * 2) *
          3.7795275591
      );
    }
    var sealW = SEAL_MM * 3.7795275591;
    var weightMax = Math.max(40, widthPx - sealW * 2 - 8);
    var i;
    for (i = 0; i < pages.length; i++) {
      var nameEls = pages[i].querySelectorAll(".yna4-bipyo-product-name");
      var weightEl = pages[i].querySelector(".yna4-bipyo-weight-pill");
      var mfgEl = pages[i].querySelector(".yna4-bipyo-mfg-date");
      var ni;
      for (ni = 0; ni < nameEls.length; ni++) {
        fitTextToWidth(nameEls[ni], nameEls[ni].textContent, widthPx, 15, 24);
      }
      var weightPt = weightEl
        ? fitWeightPill(weightEl, weightEl.textContent, weightMax)
        : 13;
      if (mfgEl) fitMfgDate(mfgEl, mfgEl.textContent, sealW, weightPt);
    }
  }

  function appendInfoLine(parent, prefix, value) {
    var line = document.createElement("div");
    line.className = "yna4-bipyo-info-line";
    line.textContent = prefix + " " + String(value || "");
    parent.appendChild(line);
  }

  function appendLabelPage(host, data, isLast) {
    var page = document.createElement("div");
    page.className =
      "yna4-bipyo-label-page" + (isLast ? " yna4-bipyo-label-page--last" : "");

    var frame = document.createElement("div");
    frame.className = "yna4-bipyo-label-frame";

    var brandRow = document.createElement("div");
    brandRow.className = "yna4-bipyo-brand-row";
    if (data.showGomgom !== false) {
      var gomgomLogo = document.createElement("img");
      gomgomLogo.className = "yna4-bipyo-gomgom-logo";
      gomgomLogo.alt = "gomgom";
      gomgomLogo.src = getGomgomLogoUrl();
      brandRow.appendChild(gomgomLogo);
    }

    var nameEl = document.createElement("div");
    nameEl.className = "yna4-bipyo-product-name";
    nameEl.textContent = data.productName || " ";

    var name2Text = String(data.productName2 || "").trim();
    var nameEl2 = null;
    if (name2Text) {
      frame.classList.add("yna4-bipyo-label-frame--twoline");
      nameEl2 = document.createElement("div");
      nameEl2.className = "yna4-bipyo-product-name yna4-bipyo-product-name--line2";
      nameEl2.textContent = name2Text;
    } else {
      nameEl.classList.add("yna4-bipyo-product-name--solo");
    }

    var mid = document.createElement("div");
    mid.className = "yna4-bipyo-mid-row";

    var weightEl = document.createElement("div");
    weightEl.className = "yna4-bipyo-weight-pill";
    weightEl.textContent = data.weight || " ";

    mid.appendChild(weightEl);
    if (data.showSeal !== false) {
      var seal = document.createElement("img");
      seal.className = "yna4-bipyo-seal";
      seal.alt = "FARM FRESH";
      seal.src = getSealUrl();
      mid.appendChild(seal);
    }

    var mfgEl = document.createElement("div");
    mfgEl.className = "yna4-bipyo-mfg-date";
    mfgEl.textContent = data.mfgDate || "";
    mid.appendChild(mfgEl);

    var info = document.createElement("div");
    info.className = "yna4-bipyo-info";
    appendInfoLine(info, "[원산지]", ORIGIN_TEXT);
    appendInfoLine(info, "[포장업체]", data.packager);
    appendInfoLine(info, "[소비자상담실]", data.customerService);

    var foot = document.createElement("div");
    foot.className = "yna4-bipyo-foot";
    var bcWrap = document.createElement("div");
    bcWrap.className = "yna4-bipyo-bc-wrap";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "yna4-bipyo-bc");
    bcWrap.appendChild(svg);
    foot.appendChild(bcWrap);

    if (brandRow.childNodes.length) frame.appendChild(brandRow);
    frame.appendChild(nameEl);
    if (nameEl2) frame.appendChild(nameEl2);
    frame.appendChild(mid);
    frame.appendChild(info);
    frame.appendChild(foot);
    page.appendChild(frame);
    host.appendChild(page);

    if (data.barcode && typeof JsBarcode !== "undefined") {
      try {
        JsBarcode(svg, data.barcode, JSBARCODE_OPTS);
        svg.removeAttribute("width");
        svg.style.width = "100%";
        svg.style.maxHeight = BARCODE_ROW_MM + "mm";
        svg.style.display = "block";
      } catch (eBc) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[yna4 bipyo label] JsBarcode", data.barcode, eBc);
        }
      }
    }
  }

  async function buildPrintHost(data, qty) {
    ensurePrintCss();
    var host = ensurePrintHost();
    host.innerHTML = "";
    document.body.classList.remove(PRINT_BODY_CLASS);

    var count = clampQty(qty);
    var i;
    for (i = 0; i < count; i++) {
      appendLabelPage(host, data, i === count - 1);
      if (i % 20 === 19) await sleep(0);
    }

    fitAllLabelTypography(host);

    var imgs = host.querySelectorAll(".yna4-bipyo-seal, .yna4-bipyo-gomgom-logo");
    if (imgs.length) {
      await Promise.all(
        Array.prototype.map.call(imgs, function (img) {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise(function (resolve) {
            function done() {
              img.removeEventListener("load", done);
              img.removeEventListener("error", done);
              resolve();
            }
            img.addEventListener("load", done);
            img.addEventListener("error", done);
          });
        })
      );
    }

    return host;
  }

  /** 남은 ATS 보충지 인쇄 상태를 지움 — 안 지우면 이 출력에 ATS 보충지가 섞여 찍힘 */
  function clearStaleAtsPrintState() {
    document.body.classList.remove("yna4-ats-print-mode");
    var atsHost = document.getElementById("yna4AtsPrintChunkHost");
    if (atsHost) atsHost.innerHTML = "";
    var hidden = document.querySelectorAll(".yna4-ats-hidden-for-print-pages");
    var hi;
    for (hi = 0; hi < hidden.length; hi++) {
      hidden[hi].classList.remove("yna4-ats-hidden-for-print-pages");
    }
  }

  function triggerPrint(host, onDone, pdfName, mode) {
    clearStaleAtsPrintState();
    document.body.classList.add(PRINT_BODY_CLASS);
    var wantPdf = mode === "pdf";
    function runCleanup() {
      document.body.classList.remove(PRINT_BODY_CLASS);
      if (host) host.innerHTML = "";
      restoreForeignLabelPrintCss();
      if (typeof onDone === "function") onDone();
    }
    function cleanupAfterPrint() {
      window.removeEventListener("afterprint", cleanupAfterPrint);
      if (window.__YAN4_DESKTOP_SHELL__) {
        window.setTimeout(runCleanup, 1500);
      } else {
        runCleanup();
      }
    }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (
          wantPdf &&
          window.__YAN4_DESKTOP_SHELL__ &&
          window.yan4ShellDesktop &&
          typeof window.yan4ShellDesktop.printToPdf === "function"
        ) {
          window.yan4ShellDesktop
            .printToPdf({
              filename: pdfName || "bipyo.pdf",
              open: true,
            })
            .then(function (res) {
              runCleanup();
              if (!res || !res.ok) {
                alert(
                  "PDF 저장 실패: " + ((res && res.error) || "알 수 없음")
                );
              }
            });
          return;
        }
        window.addEventListener("afterprint", cleanupAfterPrint);
        window.print();
      });
    });
  }

  async function runBipyoLabelPrint(data, qty, statusEl, btnPrint, mode) {
    if (!data.productName) {
      if (statusEl) statusEl.textContent = "상품명을 입력하세요";
      return;
    }
    if (!data.barcode) {
      if (statusEl) statusEl.textContent = "바코드 번호를 입력하세요";
      return;
    }
    if (typeof JsBarcode === "undefined") {
      if (statusEl) statusEl.textContent = "JsBarcode 없음";
      return;
    }

    if (btnPrint) btnPrint.disabled = true;
    if (statusEl) statusEl.textContent = "라벨 준비…";

    try {
      var host = await buildPrintHost(data, qty);
      if (statusEl) {
        statusEl.textContent = window.__YAN4_DESKTOP_SHELL__
          ? "PDF 저장 중…"
          : "PDF 저장…";
      }
      var dPdf = new Date();
      function p2(n) {
        return (n < 10 ? "0" : "") + n;
      }
      var safeName = String(data.productName || "bipyo")
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 40);
      var pdfName =
        "수박비표_" +
        safeName +
        "_" +
        clampQty(qty) +
        "_" +
        dPdf.getFullYear() +
        p2(dPdf.getMonth() + 1) +
        p2(dPdf.getDate()) +
        "_" +
        p2(dPdf.getHours()) +
        p2(dPdf.getMinutes()) +
        p2(dPdf.getSeconds()) +
        ".pdf";
      triggerPrint(
        host,
        function () {
          if (btnPrint) btnPrint.disabled = false;
          if (statusEl) {
            statusEl.textContent =
              "완료 · " + data.productName + " × " + clampQty(qty);
          }
        },
        pdfName,
        "pdf"
      );
    } catch (eRun) {
      if (btnPrint) btnPrint.disabled = false;
      if (statusEl) statusEl.textContent = "실패";
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[yna4 bipyo label print]", eRun);
      }
    }
  }

  function addFieldCell(label, key, placeholder, fields) {
    var cell = document.createElement("div");
    cell.className = "yna4-bipyo-field";
    var k = document.createElement("span");
    k.className = "yna4-pane-k";
    k.textContent = label;
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "yna4-pane-inp";
    inp.style.flex = "1 1 auto";
    inp.style.minWidth = "0";
    if (placeholder) inp.placeholder = placeholder;
    fields[key] = inp;
    cell.appendChild(k);
    cell.appendChild(inp);
    return cell;
  }

  function addDualRow(hostEl, cellA, cellB) {
    var row = document.createElement("div");
    row.className = "yna4-bipyo-dual-row";
    row.appendChild(cellA);
    if (cellB) row.appendChild(cellB);
    else {
      var spacer = document.createElement("div");
      spacer.className = "yna4-bipyo-field";
      row.appendChild(spacer);
    }
    hostEl.appendChild(row);
    return row;
  }

  function initBipyoLabelPrintPane(hostEl) {
    if (!hostEl) return;
    hostEl.innerHTML = "";
    hostEl.style.overflow = "hidden";

    var mod = document.createElement("div");
    mod.className = "yna4-pane-mod yna4-pane-mod--bipyo";
    mod.style.padding = "2px 4px";
    mod.style.gap = "3px";
    mod.style.height = "100%";
    mod.style.boxSizing = "border-box";
    mod.style.overflow = "hidden";

    var style = document.createElement("style");
    style.textContent =
      ".yna4-pane-mod--bipyo .yna4-bipyo-dual-row{display:flex;flex-direction:row;align-items:center;gap:4px;min-width:0;}" +
      ".yna4-pane-mod--bipyo .yna4-bipyo-field{flex:1 1 0;min-width:0;display:flex;flex-direction:row;align-items:center;gap:3px;}" +
      ".yna4-pane-mod--bipyo .yna4-bipyo-field .yna4-pane-k{flex:0 0 auto;min-width:2.6em;font-size:10px;}" +
      ".yna4-pane-mod--bipyo .yna4-pane-inp{height:22px;font-size:11px;padding:0 4px;}" +
      ".yna4-pane-mod--bipyo .yna4-pane-btn{height:22px;font-size:10px;padding:0 6px;}" +
      ".yna4-pane-mod--bipyo .yna4-bipyo-check{display:flex;flex-direction:row;align-items:center;gap:4px;font-size:11px;color:#334155;cursor:pointer;user-select:none;}" +
      ".yna4-pane-mod--bipyo .yna4-bipyo-check input{width:14px;height:14px;margin:0;flex:0 0 auto;cursor:pointer;}" +
      ".yna4-pane-mod--bipyo .yna4-pane-status{font-size:9px;line-height:1.2;margin:0;}";
    mod.appendChild(style);

    var fields = {};

    addDualRow(
      mod,
      addFieldCell("상품명", "productName", "당도선별", fields),
      addFieldCell("상품명2", "productName2", "둘째줄", fields)
    );
    addDualRow(
      mod,
      addFieldCell("중량", "weight", "5kg 이상", fields),
      addFieldCell("포장업체", "packager", "", fields)
    );
    addDualRow(
      mod,
      addFieldCell("상담실", "customerService", "1577-7011", fields),
      addFieldCell("제조일", "mfgDate", "H03", fields)
    );

    var cellBarcode = addFieldCell("바코드", "barcode", "PL02002108087", fields);
    var cellQty = document.createElement("div");
    cellQty.className = "yna4-bipyo-field";
    var kQty = document.createElement("span");
    kQty.className = "yna4-pane-k";
    kQty.textContent = "매수";
    var inpQty = document.createElement("input");
    inpQty.type = "number";
    inpQty.min = "1";
    inpQty.max = String(MAX_QTY);
    inpQty.step = "1";
    inpQty.value = "1";
    inpQty.className = "yna4-pane-inp";
    inpQty.style.width = "3.5em";
    inpQty.style.flex = "0 0 auto";
    cellQty.appendChild(kQty);
    cellQty.appendChild(inpQty);
    addDualRow(mod, cellBarcode, cellQty);

    var cellGom = document.createElement("div");
    cellGom.className = "yna4-bipyo-field";
    var labGom = document.createElement("label");
    labGom.className = "yna4-bipyo-check";
    var chkGom = document.createElement("input");
    chkGom.type = "checkbox";
    chkGom.checked = true;
    var spGom = document.createElement("span");
    spGom.textContent = "gomgom";
    labGom.appendChild(chkGom);
    labGom.appendChild(spGom);
    cellGom.appendChild(labGom);
    fields.showGomgom = chkGom;
    addDualRow(mod, cellGom, null);

    var rowAct = document.createElement("div");
    rowAct.className = "yna4-bipyo-dual-row";
    var btnPdf = document.createElement("button");
    btnPdf.type = "button";
    btnPdf.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnPdf.textContent = "PDF 저장";
    btnPdf.title = "Downloads에 PDF 저장";
    btnPdf.style.flex = "1 1 auto";
    var status = document.createElement("div");
    status.className = "yna4-pane-status";
    status.style.flex = "1 1 auto";
    status.style.minWidth = "0";
    status.textContent = "";
    rowAct.appendChild(btnPdf);
    rowAct.appendChild(status);
    mod.appendChild(rowAct);

    btnPdf.addEventListener("click", function () {
      runBipyoLabelPrint(
        collectFormData(fields),
        inpQty.value,
        status,
        btnPdf,
        "pdf"
      );
    });

    hostEl.appendChild(mod);
  }

  window.__YAN4_INIT_BIPYO_LABEL_PRINT_PANE__ = initBipyoLabelPrintPane;
})();
