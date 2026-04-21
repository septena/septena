(function () {
  try {
    var t = localStorage.getItem("theme") || "system";
    var d = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var el = document.documentElement;
    if (d) el.classList.add("dark");
    el.style.colorScheme = d ? "dark" : "light";
  } catch (e) {}
})();
