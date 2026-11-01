"use strict";

(function () {
  const tabs = document.querySelectorAll(".tab");
  const views = document.querySelectorAll(".view");

  function show(name) {
    tabs.forEach(function (t) {
      t.classList.toggle("active", t.dataset.view === name);
    });
    views.forEach(function (v) {
      v.hidden = v.dataset.view !== name;
    });
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      show(t.dataset.view);
    });
  });

  if (window.cfsHtp) {
    window.cfsHtp.appInfo().then(function (info) {
      document.getElementById("appVersion").textContent = "v" + info.version;
    });
  }
})();
