/* ═══════════════════════════════════════════════════
   Smart Parking — Main Script
   ═══════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Init Lucide ── */
  lucide.createIcons();

  /* ── Refs ── */
  var navbar     = document.getElementById("navbar");
  var hamburger  = document.getElementById("hamburger");
  var navLinks   = document.getElementById("navLinks");
  var yearEl     = document.getElementById("footerYear");
  var lineFill   = document.getElementById("stepsLineFill");
  var viChart    = document.getElementById("viChart");
  var yearEl     = document.getElementById("footerYear");
  var lineFill   = document.getElementById("stepsLineFill");
  var viChart    = document.getElementById("viChart");

  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ═══════════════════════════════════════════════
     1 — NAVBAR: scroll shadow + shrink
     ═══════════════════════════════════════════════ */
  window.addEventListener("scroll", function () {
    navbar.classList.toggle("scrolled", window.scrollY > 20);
  });

  /* ═══════════════════════════════════════════════
     2 — MOBILE MENU
     ═══════════════════════════════════════════════ */
  hamburger.addEventListener("click", function () {
    hamburger.classList.toggle("open");
    navLinks.classList.toggle("open");
  });

  navLinks.querySelectorAll(".nav-link").forEach(function (link) {
    link.addEventListener("click", function () {
      hamburger.classList.remove("open");
      navLinks.classList.remove("open");
    });
  });

  /* ═══════════════════════════════════════════════
     3 — ACTIVE NAV via IntersectionObserver
     ═══════════════════════════════════════════════ */
  var sectionEls = document.querySelectorAll("section[id]");
  var navLinkEls = document.querySelectorAll(".nav-link");

  var navObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var id = entry.target.getAttribute("id");
        navLinkEls.forEach(function (l) {
          l.classList.toggle("active", l.getAttribute("href") === "#" + id);
        });
      }
    });
  }, { rootMargin: "-35% 0px -60% 0px" });

  sectionEls.forEach(function (s) { navObserver.observe(s); });

  /* ═══════════════════════════════════════════════
     4 — SCROLL REVEAL
     ═══════════════════════════════════════════════ */
  var reveals = document.querySelectorAll(".reveal");

  var revealObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  reveals.forEach(function (el) { revealObs.observe(el); });

  /* ═══════════════════════════════════════════════
     5 — COUNT-UP ANIMATION for stats
     ═══════════════════════════════════════════════ */
  var statNumbers = document.querySelectorAll(".stat-number");

  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-target"));
    var duration = 1500;
    var start = 0;
    var startTime = null;

    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 4); // easeOutQuart
      var current = eased * target;
      
      el.textContent = Math.ceil(current).toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target.toLocaleString(); // force exact finish
        el.classList.add("pop-done");
      }
    }
    requestAnimationFrame(step);
  }

  var countObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach(function (el) { countObserver.observe(el); });

  /* ═══════════════════════════════════════════════
     6 — STEPS LINE FILL
     ═══════════════════════════════════════════════ */
  if (lineFill) {
    var lineObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          lineFill.style.width = "100%";
          lineObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    lineObserver.observe(lineFill.parentElement);
  }



  /* ═══════════════════════════════════════════════
     9 — MOCK CHART (visual section)
     ═══════════════════════════════════════════════ */
  if (viChart) {
    var heights = [45, 65, 38, 80, 56, 72, 90, 60, 48, 85, 70, 55];
    heights.forEach(function (h) {
      var bar = document.createElement("div");
      bar.className = "vi-bar";
      bar.style.height = "0%";
      viChart.appendChild(bar);
    });

    var chartObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var bars = viChart.querySelectorAll(".vi-bar");
          bars.forEach(function (bar, i) {
            setTimeout(function () {
              bar.style.height = heights[i] + "%";
            }, i * 60);
          });
          chartObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    chartObs.observe(viChart);
  }



})();
