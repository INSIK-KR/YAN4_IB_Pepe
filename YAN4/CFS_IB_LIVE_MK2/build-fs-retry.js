"use strict";

/**
 * 프로젝트 폴더 파일이 0.1초쯤 잠겨 fs 호출이 UNKNOWN 등으로 실패할 때가 있음
 * → 빌드 스크립트의 파일 쓰기를 잠시 뒤 다시 시도
 */
const fs = require("fs");

const RETRY_CODES = { UNKNOWN: 1, EBUSY: 1, EPERM: 1, EACCES: 1 };
const MAX_ATTEMPTS = 10;
const WAIT_MS = 200;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

["copyFileSync", "writeFileSync", "rmSync"].forEach(function (name) {
  const original = fs[name];
  fs[name] = function () {
    for (let attempt = 1; ; attempt++) {
      try {
        return original.apply(fs, arguments);
      } catch (e) {
        if (!RETRY_CODES[e.code] || attempt >= MAX_ATTEMPTS) throw e;
        sleepSync(WAIT_MS);
      }
    }
  };
});
