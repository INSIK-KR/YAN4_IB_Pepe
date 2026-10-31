(function () {
  "use strict";

  var HOST_ID = "yna4RcrtLabelPrintHost";
  var CSS_ID = "yna4-rcrt-label-print-css-v31";
  /** 상단 YAN4 행 우측 QR */
  var QR_TOP_MM = 14;
  /** 하단 CODE128 전체 너비 높이 */
  var BARCODE_ROW_MM = 20;
  /** 하단 바코드 가로 — 라벨 대비 비율(스캔용, 테두리 안쪽 여백 유지) */
  var BARCODE_MAX_WIDTH_PCT = 80;
  /** RCRT 줄 최대 폰트 — 표시용(1007- 제외) 최장 문자열 */
  var LONGEST_RCRT_REF = "RCRT88-1-999";
  var RCRT_DISPLAY_STRIP_PREFIX = "1007-";
  var LABEL_INSET_MM = 1.2;
  var LABEL_BORDER_MM = 1.4;
  /** 프레임 하단 — QR이 굵은 테두리와 겹치지 않도록 상단보다 여유 */
  var LABEL_FRAME_PAD_BOTTOM_MM = 1.6;
  var PRINT_BODY_CLASS = "yna4-rcrt-print-mode";
  var MAX_QTY = 999;
  var BUILD_CHUNK = 40;

  var LABEL_WIDTH_MM = 80;
  var LABEL_HEIGHT_MM = 60;


  var JSBARCODE_OPTS = {
    format: "CODE128",
    displayValue: false,
    /** 모듈 폭 — CSS로 가로만 줄일 때 너무 가늘어지지 않게 여유 */
    width: 1.5,
    height: 72,
    /** 스캔용 quiet zone */
    margin: 8,
  };

  var QTY_PRESETS = [10, 50, 100, 200, 400, 500, 600, 999];

  var RCRT_ZONES = [
    {
      id: "rcrt2-am",
      label: "냉장 오전",
      prefix: "1007-RCRT2-1-",
      zoneKey: "2-1",
      caption: "CHILLED (AM)",
    },
    {
      id: "rcrt2-pm",
      label: "냉장 오후",
      prefix: "1007-RCRT2-2-",
      zoneKey: "2-2",
      caption: "CHILLED (PM)",
    },
    {
      id: "rcrt3",
      label: "상온",
      prefix: "1007-RCRT3-1-",
      zoneKey: "3-1",
      caption: "AMBIENT",
    },
    {
      id: "rcrt4",
      label: "냉동",
      prefix: "1007-RCRT4-1-",
      zoneKey: "4-1",
      caption: "FROZEN",
    },
    {
      id: "rcrt22",
      label: "프로젝트 (RCRT22)",
      prefix: "1007-RCRT22-1-",
      zoneKey: "22-1",
      caption: "PROJECT",
    },
    {
      id: "rcrt44",
      label: "프로젝트 (RCRT44)",
      prefix: "1007-RCRT44-1-",
      zoneKey: "44-1",
      caption: "PROJECT",
    },
    {
      id: "rcrt18",
      label: "RCRT18",
      prefix: "1007-RCRT18-1-",
      zoneKey: "18-1",
      caption: "CONSOL",
    },
    {
      id: "rcrt88",
      label: "RCRT88",
      prefix: "1007-RCRT88-1-",
      zoneKey: "88-1",
      caption: "SR&PACK",
    },
  ];

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /** qrcodejs는 img를 비동기로 채움 — canvas를 즉시 img로 옮겨 인쇄 전 빈 QR 방지 */
  function finalizeQrWrap(qrWrap) {
    var canvas = qrWrap.querySelector("canvas");
    if (!canvas) return;
    var img = qrWrap.querySelector("img");
    try {
      var dataUrl = canvas.toDataURL("image/png");
      if (!img) {
        img = document.createElement("img");
        img.alt = "";
        qrWrap.appendChild(img);
      }
      img.src = dataUrl;
      img.style.display = "block";
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    } catch (eFinalize) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[yna4 rcrt label] QR finalize", eFinalize);
      }
    }
  }

  function waitForQrImages(host) {
    var imgs = host.querySelectorAll(".yna4-rcrt-label-qr img");
    if (!imgs.length) return Promise.resolve();
    return Promise.all(
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

  function clampQty(raw) {
    var n = parseInt(String(raw || "").trim(), 10);
    if (!isFinite(n) || n < 1) return 1;
    if (n > MAX_QTY) return MAX_QTY;
    return n;
  }

  function zoneById(id) {
    var i;
    for (i = 0; i < RCRT_ZONES.length; i++) {
      if (RCRT_ZONES[i].id === id) return RCRT_ZONES[i];
    }
    return RCRT_ZONES[0];
  }

  function buildBarcodeList(prefix, qty) {
    var out = [];
    var i;
    for (i = 1; i <= qty; i++) out.push(String(prefix || "") + i);
    return out;
  }

  function rangePreview(prefix, qty) {
    if (!qty) return "—";
    if (qty === 1) return prefix + "1";
    return prefix + "1 ~ " + prefix + qty;
  }

  /** 용지 표기용 — 선두 1007- 만 제거 (바코드·QR 데이터는 그대로) */
  function rcrtDisplayText(fullCode) {
    var s = String(fullCode || "");
    if (s.indexOf(RCRT_DISPLAY_STRIP_PREFIX) === 0) {
      return s.slice(RCRT_DISPLAY_STRIP_PREFIX.length);
    }
    return s;
  }

  function ensurePrintCss() {
    var bipyoCss = document.querySelectorAll(
      'style[id^="yna4-bipyo-label-print-css"]'
    );
    var bi;
    for (bi = 0; bi < bipyoCss.length; bi++) {
      bipyoCss[bi].disabled = true;
      bipyoCss[bi].setAttribute("data-yna4-print-disabled", "1");
    }
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
      "html,body{margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;height:auto!important;max-height:none!important;overflow:visible!important}" +
      "body." +
      PRINT_BODY_CLASS +
      ">*:not(#" +
      HOST_ID +
      "){display:none!important}" +
      "body." +
      PRINT_BODY_CLASS +
      " #" +
      HOST_ID +
      "{display:block!important;position:static!important;width:100%!important;height:auto!important;overflow:visible!important;margin:0!important;padding:0!important}" +
      ".yna4-rcrt-label-page{page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;" +
      "width:" +
      LABEL_WIDTH_MM +
      "mm;height:" +
      LABEL_HEIGHT_MM +
      "mm;box-sizing:border-box;padding:" +
      LABEL_INSET_MM +
      "mm;overflow:hidden;background:#fff}" +
      ".yna4-rcrt-label-page--last{page-break-after:auto;break-after:auto}" +
      ".yna4-rcrt-label-frame{width:100%;height:100%;box-sizing:border-box;" +
      "border:" +
      LABEL_BORDER_MM +
      "mm solid #000;padding:1mm 0.9mm " +
      LABEL_FRAME_PAD_BOTTOM_MM +
      "mm 0.9mm;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;overflow:hidden;position:relative}" +
      /* 세로 구분선 — 바코드 오른쪽 끝 + 3pt, 테두리와 동일 두께 */
      ".yna4-rcrt-label-vline{position:absolute;top:0;bottom:0;left:calc(0.9mm + (100% - 1.8mm)*" +
      BARCODE_MAX_WIDTH_PCT / 100 +
      " + 3pt);width:" +
      LABEL_BORDER_MM +
      "mm;background:#000}" +
      ".yna4-rcrt-label-head{width:100%;box-sizing:border-box;display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:0.7mm}" +
      ".yna4-rcrt-label-zone-caption{width:100%;box-sizing:border-box;flex:1 1 auto;min-height:0;margin:0;display:flex;flex-direction:column;justify-content:center;position:relative;top:4pt;" +
      "font-family:Arial Black,Arial,sans-serif;font-weight:900;color:#000;" +
      "line-height:1.05;letter-spacing:0;white-space:pre-line;text-align:left}" +
      ".yna4-rcrt-label-text{box-sizing:border-box;font-family:Arial Black,Arial,sans-serif;font-weight:900;color:#000;" +
      "line-height:1;letter-spacing:0;white-space:nowrap;text-align:center}" +
      ".yna4-rcrt-label-title-wrap{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:0.6mm}" +
      ".yna4-rcrt-label-head .yna4-rcrt-label-text{flex:0 0 auto;min-width:0;margin-top:0}" +
      ".yna4-rcrt-label-foot{width:100%;box-sizing:border-box;flex:0 0 auto;margin-top:auto;padding-top:1.2mm}" +
      ".yna4-rcrt-label-qr{flex:0 0 auto;width:" +
      QR_TOP_MM +
      "mm;height:" +
      QR_TOP_MM +
      "mm;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden}" +
      ".yna4-rcrt-label-code128-wrap{width:100%;display:flex;align-items:center;justify-content:flex-start;height:" +
      BARCODE_ROW_MM +
      "mm;overflow:hidden}" +
      ".yna4-rcrt-label-code128{display:block;width:" +
      BARCODE_MAX_WIDTH_PCT +
      "%!important;max-width:" +
      BARCODE_MAX_WIDTH_PCT +
      "%!important;height:" +
      BARCODE_ROW_MM +
      "mm!important;max-height:" +
      BARCODE_ROW_MM +
      "mm!important}" +
      ".yna4-rcrt-label-qr canvas{display:none!important}" +
      ".yna4-rcrt-label-qr img{display:block!important;width:100%!important;height:100%!important;object-fit:contain}" +
      ".yna4-rcrt-label-qr table{display:none!important}" +
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

  /** 가로 px 안에 문자열이 꽉 차도록 pt 이진 탐색 */
  function fitTextToWidth(el, text, widthPx, minPt, maxPt) {
    if (!el || widthPx <= 0) return minPt;
    el.textContent = String(text || "");
    el.style.fontFamily = "Arial Black, Arial, sans-serif";
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

  function measureRcrtLinePt(widthPx) {
    var probe = document.createElement("div");
    probe.className = "yna4-rcrt-label-text";
    probe.style.position = "absolute";
    probe.style.left = "-9999px";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    var pt = fitTextToWidth(probe, LONGEST_RCRT_REF, widthPx, 9, 18);
    document.body.removeChild(probe);
    return pt;
  }

  function applyRcrtLinePt(el, pt) {
    if (!el) return;
    el.style.fontFamily = "Arial Black, Arial, sans-serif";
    el.style.fontWeight = "900";
    el.style.whiteSpace = "nowrap";
    el.style.textAlign = "left";
    el.style.fontSize = pt + "pt";
  }

  function fitAllLabelTypography(host) {
    var mmPx = 3.7795275591;
    var pages = host.querySelectorAll(".yna4-rcrt-label-page");
    if (!pages.length) return;
    var frame0 = pages[0].querySelector(".yna4-rcrt-label-frame");
    if (!frame0) return;
    var widthPx = frame0.clientWidth - 2;
    if (widthPx < 40) widthPx = Math.floor((LABEL_WIDTH_MM - 6) * mmPx);
    /** QR 옆 RCRT 번호 폭 = 전체 − QR − 간격 */
    var titleWidthPx = Math.max(
      60,
      widthPx - Math.ceil(QR_TOP_MM * mmPx) - Math.ceil(0.7 * mmPx)
    );
    var rcrtPt = Math.max(7, measureRcrtLinePt(titleWidthPx) - 5);
    /** 가운데 RCRT 번호 — 라벨마다 세로선(바코드 폭% + 3pt) 직전까지 꽉 차게 개별 맞춤 */
    var midWidthPx = Math.max(
      60,
      Math.floor(widthPx * (BARCODE_MAX_WIDTH_PCT / 100) + 3 * (96 / 72)) - 3
    );
    /** 세로 예산 상한 — 캡션 영역 높이 초과 방지 (한 줄 기준) */
    var midBudgetMm =
      LABEL_HEIGHT_MM -
      2 * LABEL_INSET_MM -
      2 * LABEL_BORDER_MM -
      1 -
      LABEL_FRAME_PAD_BOTTOM_MM -
      QR_TOP_MM -
      BARCODE_ROW_MM -
      1.2 -
      1.5;
    var midHeightCapPt = Math.max(
      10,
      Math.floor(((midBudgetMm * mmPx) / 1.05) * 0.75)
    );
    var midProbe = document.createElement("div");
    midProbe.style.position = "absolute";
    midProbe.style.left = "-9999px";
    midProbe.style.visibility = "hidden";
    document.body.appendChild(midProbe);
    var midPtByText = Object.create(null);
    var i;
    for (i = 0; i < pages.length; i++) {
      var capEl = pages[i].querySelector(".yna4-rcrt-label-zone-caption");
      var textEls = pages[i].querySelectorAll(".yna4-rcrt-label-text");
      if (capEl) {
        var midText = String(capEl.textContent || "");
        var midPt = midPtByText[midText];
        if (midPt == null) {
          midPt = Math.min(
            fitTextToWidth(midProbe, midText, midWidthPx, 8, 72),
            midHeightCapPt
          );
          midPtByText[midText] = midPt;
        }
        capEl.style.fontFamily = "Arial Black, Arial, sans-serif";
        capEl.style.fontWeight = "900";
        capEl.style.whiteSpace = "pre-line";
        capEl.style.textAlign = "left";
        capEl.style.width = "";
        capEl.style.fontSize = midPt + "pt";
      }
      var ti;
      for (ti = 0; ti < textEls.length; ti++) {
        applyRcrtLinePt(
          textEls[ti],
          textEls[ti].classList.contains("yna4-rcrt-label-text--brand")
            ? rcrtPt + 7
            : rcrtPt
        );
        textEls[ti].style.width = "";
      }
    }
    document.body.removeChild(midProbe);
  }

  function normalizeCode128Svg(svg) {
    if (!svg) return;
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "xMinYMid meet");
    svg.style.width = BARCODE_MAX_WIDTH_PCT + "%";
    svg.style.maxWidth = BARCODE_MAX_WIDTH_PCT + "%";
    svg.style.height = BARCODE_ROW_MM + "mm";
    svg.style.maxHeight = BARCODE_ROW_MM + "mm";
    svg.style.display = "block";
    svg.style.margin = "0 auto 0 0";
  }

  function appendLabelPage(host, text, zoneCaption, isLast) {
    var page = document.createElement("div");
    page.className =
      "yna4-rcrt-label-page" + (isLast ? " yna4-rcrt-label-page--last" : "");

    var frame = document.createElement("div");
    frame.className = "yna4-rcrt-label-frame";

    var head = document.createElement("div");
    head.className = "yna4-rcrt-label-head";

    var qrWrap = document.createElement("div");
    qrWrap.className = "yna4-rcrt-label-qr";

    var titleWrap = document.createElement("div");
    titleWrap.className = "yna4-rcrt-label-title-wrap";

    /** 윗줄(큰 글씨)=YAN4 IB, 아랫줄=캡션, 가운데(큰 자리)=RCRT 번호 */
    var brandLine = document.createElement("div");
    brandLine.className = "yna4-rcrt-label-text yna4-rcrt-label-text--brand";
    brandLine.textContent = "YAN4 IB";

    var title = document.createElement("div");
    title.className = "yna4-rcrt-label-text";
    title.textContent = String(zoneCaption || "");

    titleWrap.appendChild(brandLine);
    titleWrap.appendChild(title);

    head.appendChild(qrWrap);
    head.appendChild(titleWrap);

    var cap = document.createElement("div");
    cap.className = "yna4-rcrt-label-zone-caption";
    cap.textContent = rcrtDisplayText(text);

    var vline = document.createElement("div");
    vline.className = "yna4-rcrt-label-vline";

    var foot = document.createElement("div");
    foot.className = "yna4-rcrt-label-foot";

    var bcWrap = document.createElement("div");
    bcWrap.className = "yna4-rcrt-label-code128-wrap";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "yna4-rcrt-label-code128");
    bcWrap.appendChild(svg);

    foot.appendChild(bcWrap);

    frame.appendChild(head);
    frame.appendChild(cap);
    frame.appendChild(foot);
    frame.appendChild(vline);
    page.appendChild(frame);
    host.appendChild(page);

    if (typeof JsBarcode !== "undefined") {
      try {
        JsBarcode(svg, text, JSBARCODE_OPTS);
        normalizeCode128Svg(svg);
      } catch (eBc) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[yna4 rcrt label] JsBarcode", text, eBc);
        }
      }
    }

    if (typeof QRCode !== "undefined") {
      try {
        qrWrap.innerHTML = "";
        new QRCode(qrWrap, {
          text: text,
          width: 120,
          height: 120,
          correctLevel: QRCode.CorrectLevel.M,
        });
        finalizeQrWrap(qrWrap);
      } catch (eQr) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[yna4 rcrt label] QRCode", text, eQr);
        }
      }
    }
  }

  async function buildPrintHost(barcodes, zoneCaption, onProgress) {
    ensurePrintCss();
    var host = ensurePrintHost();
    host.innerHTML = "";
    document.body.classList.remove(PRINT_BODY_CLASS);

    var total = barcodes.length;
    var start = 0;
    while (start < total) {
      var end = Math.min(start + BUILD_CHUNK, total);
      if (onProgress) onProgress(end, total);
      var i;
      for (i = start; i < end; i++) {
        appendLabelPage(host, barcodes[i], zoneCaption, i === total - 1);
      }
      start = end;
      if (start < total) await sleep(0);
    }
    fitAllLabelTypography(host);
    await waitForQrImages(host);
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
      var bipyoCss = document.querySelectorAll(
        'style[id^="yna4-bipyo-label-print-css"][data-yna4-print-disabled="1"]'
      );
      var bi;
      for (bi = 0; bi < bipyoCss.length; bi++) {
        bipyoCss[bi].disabled = false;
        bipyoCss[bi].removeAttribute("data-yna4-print-disabled");
      }
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
              filename: pdfName || "RCRT.pdf",
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

  async function runRcrtLabelPrint(zoneId, qty, statusEl, btnPrint, mode) {
    if (typeof JsBarcode === "undefined") {
      if (statusEl) statusEl.textContent = "JsBarcode 없음";
      return;
    }
    if (typeof QRCode === "undefined") {
      if (statusEl) statusEl.textContent = "QRCode 없음";
      return;
    }

    var zone = zoneById(zoneId);
    var count = clampQty(qty);
    var barcodes = buildBarcodeList(zone.prefix, count);

    if (btnPrint) btnPrint.disabled = true;
    if (statusEl) statusEl.textContent = "라벨 준비 0/" + count;

    try {
      var host = await buildPrintHost(
        barcodes,
        zone.caption,
        function (done, total) {
          if (statusEl) statusEl.textContent = "라벨 준비 " + done + "/" + total;
        }
      );
      if (statusEl) {
        statusEl.textContent = window.__YAN4_DESKTOP_SHELL__
          ? "PDF 저장 중…"
          : "PDF 저장…";
      }
      var dPdf = new Date();
      function p2(n) {
        return (n < 10 ? "0" : "") + n;
      }
      var pdfName =
        "RCRT_" +
        String(zone.caption || zone.label || "label")
          .replace(/[\\/:*?"<>|]+/g, "_")
          .replace(/\s+/g, "_") +
        "_" +
        count +
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
              "완료 · " + zone.caption + " " + rangePreview(zone.prefix, count);
          }
        },
        pdfName,
        "pdf"
      );
    } catch (eRun) {
      if (btnPrint) btnPrint.disabled = false;
      if (statusEl) statusEl.textContent = "실패";
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[yna4 rcrt label print]", eRun);
      }
    }
  }

  function initRcrtLabelPrintPane(hostEl) {
    if (!hostEl) return;
    hostEl.innerHTML = "";
    hostEl.style.overflow = "hidden";

    var mod = document.createElement("div");
    mod.className = "yna4-pane-mod yna4-pane-mod--rcrt-qr";
    mod.style.height = "100%";
    mod.style.boxSizing = "border-box";
    mod.style.overflow = "hidden";

    var rowZone = document.createElement("div");
    rowZone.className = "yna4-pane-row";
    var kZone = document.createElement("span");
    kZone.className = "yna4-pane-k";
    kZone.textContent = "종류";
    var selZone = document.createElement("select");
    selZone.className = "yna4-pane-inp";
    selZone.style.flex = "1 1 auto";
    selZone.style.minWidth = "0";
    var zi;
    for (zi = 0; zi < RCRT_ZONES.length; zi++) {
      var opt = document.createElement("option");
      opt.value = RCRT_ZONES[zi].id;
      opt.textContent =
        RCRT_ZONES[zi].label + " · " + RCRT_ZONES[zi].caption;
      selZone.appendChild(opt);
    }
    rowZone.appendChild(kZone);
    rowZone.appendChild(selZone);

    var rowQty = document.createElement("div");
    rowQty.className = "yna4-pane-row";
    var kQty = document.createElement("span");
    kQty.className = "yna4-pane-k";
    kQty.textContent = "매수";
    var selPreset = document.createElement("select");
    selPreset.className = "yna4-pane-inp";
    selPreset.style.minWidth = "4.5em";
    var optCustom = document.createElement("option");
    optCustom.value = "";
    optCustom.textContent = "직접";
    selPreset.appendChild(optCustom);
    var pi;
    for (pi = 0; pi < QTY_PRESETS.length; pi++) {
      var optP = document.createElement("option");
      optP.value = String(QTY_PRESETS[pi]);
      optP.textContent = String(QTY_PRESETS[pi]);
      selPreset.appendChild(optP);
    }
    selPreset.value = "100";

    var inpQty = document.createElement("input");
    inpQty.type = "number";
    inpQty.min = "1";
    inpQty.max = String(MAX_QTY);
    inpQty.step = "1";
    inpQty.value = "100";
    inpQty.className = "yna4-pane-inp";
    inpQty.style.width = "6.5em";
    inpQty.style.minWidth = "6.5em";
    inpQty.style.boxSizing = "border-box";
    inpQty.style.paddingRight = "1.4em";
    inpQty.style.textAlign = "left";

    rowQty.appendChild(kQty);
    rowQty.appendChild(selPreset);
    rowQty.appendChild(inpQty);

    var preview = document.createElement("div");
    preview.className = "yna4-pane-status";
    preview.style.fontSize = "11px";
    preview.style.lineHeight = "1.35";
    preview.style.wordBreak = "break-all";

    function syncPreview() {
      var zone = zoneById(selZone.value);
      var qty = clampQty(inpQty.value);
      inpQty.value = String(qty);
      preview.textContent =
        zone.caption + " · " + rangePreview(zone.prefix, qty);
    }

    selPreset.addEventListener("change", function () {
      var v = String(selPreset.value || "").trim();
      if (v) inpQty.value = String(clampQty(v));
      syncPreview();
    });
    inpQty.addEventListener("input", function () {
      selPreset.value = "";
      syncPreview();
    });
    inpQty.addEventListener("change", function () {
      inpQty.value = String(clampQty(inpQty.value));
      syncPreview();
    });
    selZone.addEventListener("change", syncPreview);

    var btnRow = document.createElement("div");
    btnRow.className = "yna4-pane-actions";
    var btnPdf = document.createElement("button");
    btnPdf.type = "button";
    btnPdf.className = "yna4-pane-btn yna4-pane-btn--primary";
    btnPdf.textContent = "PDF 저장";
    btnPdf.title = "Downloads에 PDF 저장";
    btnRow.appendChild(btnPdf);

    var status = document.createElement("div");
    status.className = "yna4-pane-status";
    status.textContent = "준비";

    btnPdf.addEventListener("click", function () {
      var qty = clampQty(inpQty.value);
      inpQty.value = String(qty);
      syncPreview();
      runRcrtLabelPrint(selZone.value, qty, status, btnPdf, "pdf");
    });

    mod.appendChild(rowZone);
    mod.appendChild(rowQty);
    mod.appendChild(preview);
    mod.appendChild(btnRow);
    mod.appendChild(status);
    hostEl.appendChild(mod);
    syncPreview();
  }

  window.__YAN4_INIT_RCRT_LABEL_PRINT_PANE__ = initRcrtLabelPrintPane;
})();
