/**
 * Electron preload가 window.yna4Desktop 을 노출할 때만 동작.
 * 폴더(기본: 시스템 다운로드) + auto-load.json 경로를 합쳐
 * 파일명 규칙으로 ① SLA · ② 이관(진열대기·진열중·이동중 병합)만 채움.
 */
(function () {
  "use strict";

  function b64ToArrayBuffer(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var u8 = new Uint8Array(len);
    var i;
    for (i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function showBar() {
    var bar = document.getElementById("yna4DesktopFileBar");
    if (bar) bar.style.display = "block";
  }

  function loadSlotFromPath(api, slot, absPath) {
    return api.readFileAsBase64(absPath).then(function (rb) {
      if (!rb || !rb.ok) {
        if (rb && rb.error) throw new Error(rb.error);
        return;
      }
      var ab = b64ToArrayBuffer(rb.data);
      var name = String(absPath).replace(/^.*[\\/]/, "");
      if (typeof window.YNA4_REPLENISH_LOAD_WORKBOOK === "function") {
        window.YNA4_REPLENISH_LOAD_WORKBOOK(slot, ab, name);
      }
    });
  }

  function applyResolvedImport(api, dl) {
    if (!dl || !dl.ok) return Promise.resolve();
    var chain = Promise.resolve();
    if (dl.slot0Path) {
      chain = chain.then(function () {
        return loadSlotFromPath(api, 0, dl.slot0Path);
      });
    } else if (typeof window.YNA4_REPLENISH_CLEAR_SLOT === "function") {
      window.YNA4_REPLENISH_CLEAR_SLOT(0);
    }
    chain = chain.then(function () {
      var tsv = dl.slot1Tsv;
      if (tsv && String(tsv).trim()) {
        if (typeof window.YNA4_REPLENISH_APPLY_TSV_TO_SLOT === "function") {
          window.YNA4_REPLENISH_APPLY_TSV_TO_SLOT(1, String(tsv));
        }
      } else if (typeof window.YNA4_REPLENISH_APPLY_TSV_TO_SLOT === "function") {
        window.YNA4_REPLENISH_APPLY_TSV_TO_SLOT(1, "");
      }
    });
    return chain;
  }

  function runDiskImport(api) {
    return api.resolveDownloadExcels().then(function (dl) {
      if (!dl || !dl.ok) {
        throw new Error((dl && dl.error) || "파일 목록을 가져오지 못했습니다.");
      }
      return applyResolvedImport(api, dl).then(function () {
        return dl;
      });
    });
  }

  function setRefreshStatus(msg, mode) {
    var el = document.getElementById("yna4DesktopRefreshStatus");
    if (!el) return;
    el.textContent = msg || "";
    var cls = "yna4-desktop-status";
    if (mode === "err") cls += " err";
    else if (mode === "ok") cls += " ok";
    el.className = cls;
  }

  function formatDiskImportDone(dl) {
    var has0 = !!(dl && dl.slot0Path);
    var has1 = !!(dl && dl.slot1Tsv && String(dl.slot1Tsv).trim());
    if (has0 && has1) return "완료 · SLA·이관현황 반영됨";
    if (has0) return "완료 · SLA 반영됨";
    if (has1) return "완료 · 이관현황 반영됨";
    return "완료 · 이름 규칙에 맞는 엑셀 없음";
  }

  /**
   * MERGE_TABLE_HEADERS 와 동일: GC 열 = tbody td 0-based 5(표시 순서 6번째).
   * 재고조회 화면의 input.input-location-barcode(로케이션 바코드)에 넣는 값과 동일한 GC 문자열을 조회 키로 씀.
   */
  var MERGE_PREVIEW_COL_GC_0 = 5;

  /** mergePreviewCellTextForSheetsTsv 와 동일: 탭/줄바꿈 정리 + NBSP → 공백 (보충조회 키 = 표 복사와 동일). */
  function mergePreviewCellTextForGlocLookup(td) {
    if (!td || td.textContent == null) return "";
    var s = String(td.textContent);
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    s = s.replace(/\t/g, " ");
    s = s.replace(/\n/g, " ");
    s = s.replace(/\u00a0/g, " ");
    return s.trim();
  }

  /** 통합표: GC 조회 키 → 해당 GC 행의 완료키(SKU|GC) 목록. 완료(초록) 행·⑨·빈 GC 제외. */
  function collectGcLocKeysToDoneKeysFromMergeTables() {
    var grid = document.getElementById("mergeDashboardsGrid");
    var byLookupKey = Object.create(null);
    var lookupKeys = [];
    var doneKeyFn = window.YNA4_REPLENISH_DONE_KEY;
    if (!grid) return { byLookupKey: byLookupKey, lookupKeys: lookupKeys };
    var rows = grid.querySelectorAll("table.merge-table tbody tr");
    var i, tr, tds, sku, gc, arr, dk, tbl, k;
    for (i = 0; i < rows.length; i++) {
      tr = rows[i];
      if (!tr || tr.classList.contains("merge-row-done")) continue;
      tbl = tr.closest && tr.closest("table");
      if (tbl && tbl.id === "mergePreviewTable9") continue;
      tds = tr.querySelectorAll("td");
      if (tds.length <= MERGE_PREVIEW_COL_GC_0) continue;
      sku = mergePreviewCellTextForGlocLookup(tds[0]);
      gc = mergePreviewCellTextForGlocLookup(tds[MERGE_PREVIEW_COL_GC_0]);
      if (!gc) continue;
      dk = tr.getAttribute("data-merge-done-key") || "";
      if (!dk && typeof doneKeyFn === "function") {
        dk = doneKeyFn(sku, gc);
      }
      if (!dk || dk.indexOf("|") < 0) continue;
      if (!byLookupKey[gc]) {
        byLookupKey[gc] = [];
        lookupKeys.push(gc);
      }
      arr = byLookupKey[gc];
      for (k = 0; k < arr.length; k++) {
        if (arr[k] === dk) break;
      }
      if (k === arr.length) arr.push(dk);
    }
    return { byLookupKey: byLookupKey, lookupKeys: lookupKeys };
  }

  function runGlocLookupAndMarkDone(api) {
    var markFn = window.YNA4_REPLENISH_MARK_DONE_KEYS;
    if (typeof markFn !== "function") {
      return Promise.reject(new Error("보충 코어가 아직 준비되지 않았습니다."));
    }
    if (typeof api.glocLookupBatch !== "function") {
      return Promise.reject(new Error("preload 에 glocLookupBatch 가 없습니다."));
    }
    var pack = collectGcLocKeysToDoneKeysFromMergeTables();
    if (!pack.lookupKeys.length) {
      setRefreshStatus("조회 생략 · GC 없음(완료 행·빈 GC 제외)", "ok");
      return Promise.resolve({ ok: true, skipped: true });
    }
    setRefreshStatus("재고조회용 GC(로케이션 바코드와 동일) 조회 중…");
    return api
      .glocLookupBatch({ barcodes: pack.lookupKeys })
      .then(function (res) {
        if (!res || !res.ok) {
          var msg = (res && res.error) || "조회 실패";
          if (res && res.configHint) msg += " — " + res.configHint;
          setRefreshStatus(msg, "err");
          if (res && res.configPath && typeof console !== "undefined" && console.warn) {
            console.warn("[yna4 gloc]", res.configPath);
          }
          return res;
        }
        var doneKeysToMark = [];
        var seenDoneKey = Object.create(null);
        var results = res.results || [];
        var j, r, locKey, dks, s, dk;
        for (j = 0; j < results.length; j++) {
          r = results[j];
          if (!r || r.error) continue;
          if (!r.markComplete) continue;
          locKey = r.barcode;
          dks = pack.byLookupKey[locKey];
          if (!dks) continue;
          for (s = 0; s < dks.length; s++) {
            dk = dks[s];
            if (!dk || seenDoneKey[dk]) continue;
            seenDoneKey[dk] = 1;
            doneKeysToMark.push(dk);
          }
        }
        var markOut = doneKeysToMark.length ? markFn(doneKeysToMark) : { marked: 0 };
        var nd = typeof res.noDataCount === "number" ? res.noDataCount : 0;
        var errCt = 0;
        for (var e = 0; e < results.length; e++) {
          if (results[e] && results[e].error) errCt += 1;
        }
        var line =
          "완료 · 빈 응답(또는 설정상 '데이터 없음') " +
          nd +
          "건 → GC 행 초록 " +
          (markOut && markOut.marked != null ? markOut.marked : doneKeysToMark.length) +
          "건";
        if (errCt) line += " · 조회 오류 " + errCt + "건(완료 처리 안 함)";
        if (
          !errCt &&
          pack.lookupKeys.length &&
          !doneKeysToMark.length &&
          nd === 0
        ) {
          line +=
            " · GC " +
            pack.lookupKeys.length +
            "건은 응답이 모두 '재고 있음'으로 판정됨(gloc-lookup.json 의 hasDataJsonPath·본문 형식 확인)";
        }
        setRefreshStatus(line, "ok");
        return res;
      });
  }

  ready(function () {
    var api = window.yna4Desktop;
    if (!api || typeof api.resolveDownloadExcels !== "function") return;
    try {
      document.documentElement.classList.add("yna4-electron");
    } catch (eHtml) {}
    showBar();

    setRefreshStatus("불러오는 중…");
    runDiskImport(api)
      .then(function (dl) {
        setRefreshStatus(formatDiskImportDone(dl), "ok");
      })
      .catch(function (e) {
        setRefreshStatus("실패 · " + String(e && e.message ? e.message : e), "err");
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[yna4 import]", e);
        }
      });

    var btnRefresh = document.getElementById("yna4DesktopRefreshDisk");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", function () {
        setRefreshStatus("불러오는 중…");
        btnRefresh.disabled = true;
        runDiskImport(api)
          .then(function (dl) {
            setRefreshStatus(formatDiskImportDone(dl), "ok");
          })
          .catch(function (e) {
            setRefreshStatus("실패 · " + String(e && e.message ? e.message : e), "err");
            alert(String(e && e.message ? e.message : e));
          })
          .then(function () {
            btnRefresh.disabled = false;
          });
      });
    }

    var btnScan = document.getElementById("yna4DesktopPickScanDir");
    if (btnScan && typeof api.pickScanFolder === "function") {
      btnScan.addEventListener("click", function () {
        api
          .pickScanFolder()
          .then(function (r) {
            if (!r || !r.ok) return;
            try {
              window.location.reload();
            } catch (eR) {}
          })
          .catch(function (e) {
            alert(String(e && e.message ? e.message : e));
          });
      });
    }

    var btnGloc = document.getElementById("yna4DesktopGlocLookup");
    if (btnGloc) {
      btnGloc.addEventListener("click", function () {
        btnGloc.disabled = true;
        runGlocLookupAndMarkDone(api)
          .catch(function (e) {
            setRefreshStatus("실패 · " + String(e && e.message ? e.message : e), "err");
            alert(String(e && e.message ? e.message : e));
          })
          .then(function () {
            btnGloc.disabled = false;
          });
      });
    }

    var btnInvLogin = document.getElementById("yna4DesktopInventoryLogin");
    if (btnInvLogin && typeof api.openInventoryLogin === "function") {
      btnInvLogin.addEventListener("click", function () {
        setRefreshStatus("재고 목록 창 열기…");
        api
          .openInventoryLogin({})
          .then(function (r) {
            if (r && r.ok) {
              setRefreshStatus(
                r.reused
                  ? "재고 창 포커스(이미 열려 있음)"
                  : "재고 페이지 열림 · 로그인 후 창을 닫아도 됩니다",
                "ok"
              );
            } else {
              setRefreshStatus((r && r.error) || "열기 실패", "err");
            }
          })
          .catch(function (e) {
            setRefreshStatus("실패 · " + String(e && e.message ? e.message : e), "err");
          });
      });
    }
  });
})();
