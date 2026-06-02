/**
 * ══════════════════════════════════════════════
 *  ADAPTIVE IMAGE LOADER — keunststudio.id
 *  Menyesuaikan kualitas gambar otomatis
 *  berdasarkan kecepatan internet pengguna
 * ══════════════════════════════════════════════
 *
 *  CARA PAKAI:
 *  1. Simpan file ini sebagai adaptive-image-loader.js
 *  2. Tambahkan sebelum </body>:
 *     <script src="adaptive-image-loader.js"></script>
 *
 *  OPSI UNTUK GAMBAR LOKAL (img/hero.png, dll):
 *  Siapkan versi berbeda:
 *    img/hero.png          → kualitas penuh (original)
 *    img/hero-medium.png   → 70% kualitas / resize 800px
 *    img/hero-low.png      → 40% kualitas / resize 400px
 *
 *  Atau gunakan query string jika pakai CDN seperti
 *  Cloudinary / imgix (sudah didukung otomatis).
 * ══════════════════════════════════════════════
 */

(function () {
  "use strict";

  // ── 1. DETEKSI KUALITAS JARINGAN ──────────────────────────────────────────

  /**
   * Mengembalikan tier jaringan: 'high' | 'medium' | 'low' | 'offline'
   * Menggunakan Network Information API + fallback pengukuran manual
   */
  function getNetworkTier() {
    // Jika offline
    if (!navigator.onLine) return "offline";

    const conn =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    if (conn) {
      const { effectiveType, downlink, saveData } = conn;

      // Hormati mode hemat data pengguna
      if (saveData) return "low";

      // Berdasarkan effective connection type
      if (effectiveType === "4g") {
        if (downlink && downlink >= 5) return "high";
        return "medium";
      }
      if (effectiveType === "3g") return "medium";
      if (effectiveType === "2g" || effectiveType === "slow-2g") return "low";
    }

    // Fallback: asumsikan medium jika API tidak tersedia
    return "medium";
  }

  // ── 2. KONFIGURASI TIER ───────────────────────────────────────────────────

  const TIER_CONFIG = {
    high: {
      quality: 90,
      maxWidth: 1600,
      loading: "eager", // gambar above-fold langsung muat
      lazyOffset: "400px", // preload 400px sebelum masuk viewport
      label: "Kualitas Penuh",
    },
    medium: {
      quality: 70,
      maxWidth: 800,
      loading: "lazy",
      lazyOffset: "200px",
      label: "Kualitas Sedang",
    },
    low: {
      quality: 40,
      maxWidth: 400,
      loading: "lazy",
      lazyOffset: "0px",
      label: "Hemat Data",
    },
    offline: {
      quality: 0,
      maxWidth: 200,
      loading: "lazy",
      lazyOffset: "0px",
      label: "Offline",
    },
  };

  // ── 3. TRANSFORMASI URL GAMBAR ────────────────────────────────────────────

  /**
   * Ubah URL gambar sesuai tier.
   * Mendukung: Unsplash, Cloudinary, imgix, dan file lokal
   */
  function transformImageUrl(src, tier) {
    const cfg = TIER_CONFIG[tier];
    if (!src) return src;

    // — Unsplash (sudah dipakai di website ini) —
    if (src.includes("unsplash.com")) {
      const base = src.split("?")[0];
      return `${base}?w=${cfg.maxWidth}&q=${cfg.quality}&auto=format&fit=crop`;
    }

    // — Cloudinary —
    if (src.includes("cloudinary.com")) {
      return src.replace(
        /\/upload\//,
        `/upload/w_${cfg.maxWidth},q_${cfg.quality},f_auto/`,
      );
    }

    // — imgix —
    if (src.includes("imgix.net")) {
      const url = new URL(src);
      url.searchParams.set("w", cfg.maxWidth);
      url.searchParams.set("q", cfg.quality);
      url.searchParams.set("auto", "format,compress");
      return url.toString();
    }

    // — File lokal (img/hero.png, img/tshirt1.png, dst.) —
    // Cari versi bertingkat: -low, -medium, atau original
    if (!src.startsWith("http")) {
      const dot = src.lastIndexOf(".");
      const name = src.substring(0, dot);
      const ext = src.substring(dot); // .png / .jpg / .webp

      if (tier === "low") return `${name}-low${ext}`;
      if (tier === "medium") return `${name}-medium${ext}`;
      return src; // tier high / offline → pakai original
    }

    return src; // tidak dikenali → kembalikan asli
  }

  // ── 4. LAZY LOADING DENGAN INTERSECTION OBSERVER ─────────────────────────

  function setupLazyLoading(tier) {
    const cfg = TIER_CONFIG[tier];

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const img = entry.target;
          const originalSrc =
            img.dataset.adaptiveSrc ||
            img.dataset.src ||
            img.getAttribute("src");

          if (!originalSrc) return;

          const newSrc = transformImageUrl(originalSrc, tier);

          // Muat gambar dengan fade-in halus
          const tempImg = new Image();
          tempImg.onload = () => {
            img.src = newSrc;
            img.style.transition = "opacity 0.4s ease";
            img.style.opacity = "1";
            img.dataset.loaded = "true";
          };
          tempImg.onerror = () => {
            // Fallback ke src asli jika versi bertingkat tidak ada
            img.src = originalSrc;
            img.style.opacity = "1";
            img.dataset.loaded = "true";
            img.dataset.fallback = "true";
          };
          tempImg.src = newSrc;

          obs.unobserve(img);
        });
      },
      {
        rootMargin: cfg.lazyOffset,
        threshold: 0.01,
      },
    );

    return observer;
  }

  // ── 5. TERAPKAN KE SEMUA GAMBAR ───────────────────────────────────────────

  function applyAdaptiveLoading() {
    const tier = getNetworkTier();
    const cfg = TIER_CONFIG[tier];

    // Simpan info di window untuk debugging
    window.__adaptiveTier = tier;
    window.__adaptiveConfig = cfg;

    const observer = setupLazyLoading(tier);
    const allImages = document.querySelectorAll("img");

    allImages.forEach((img) => {
      const src = img.getAttribute("src");
      if (!src) return;

      // Simpan src asli sebelum diubah
      if (!img.dataset.adaptiveSrc) {
        img.dataset.adaptiveSrc = src;
      }

      if (tier === "high") {
        // Koneksi cepat: langsung set URL yang dioptimasi tanpa lazy loading
        const newSrc = transformImageUrl(src, tier);
        if (newSrc !== src) img.src = newSrc;
        return;
      }

      // Koneksi lambat/sedang: gunakan placeholder dulu, lazy load berikutnya
      img.style.opacity = "0.3";
      img.style.filter = "blur(4px)";
      img.style.transition = "opacity 0.4s ease, filter 0.4s ease";

      // Lepaskan blur saat selesai dimuat
      const originalOnLoad = img.onload;
      img.onload = () => {
        img.style.opacity = "1";
        img.style.filter = "none";
        if (originalOnLoad) originalOnLoad.call(img);
      };

      observer.observe(img);
    });

    // Tampilkan indikator (bisa dinonaktifkan)
    if (window.__adaptiveDebug) {
      showNetworkIndicator(tier, cfg.label);
    }
  }

  // ── 6. INDIKATOR JARINGAN (OPSIONAL, untuk debug) ─────────────────────────

  function showNetworkIndicator(tier, label) {
    const colors = {
      high: "#22c55e",
      medium: "#f59e0b",
      low: "#ef4444",
      offline: "#6b7280",
    };

    const indicator = document.createElement("div");
    indicator.id = "network-quality-indicator";
    indicator.style.cssText = `
      position: fixed;
      bottom: 72px;
      right: 24px;
      z-index: 9999;
      background: ${colors[tier]};
      color: white;
      padding: 6px 12px;
      font-family: var(--font-sans, sans-serif);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    `;
    indicator.textContent = `📶 ${label}`;
    document.body.appendChild(indicator);

    // Tampilkan 3 detik lalu hilang
    requestAnimationFrame(() => {
      indicator.style.opacity = "1";
      setTimeout(() => {
        indicator.style.opacity = "0";
        setTimeout(() => indicator.remove(), 400);
      }, 3000);
    });
  }

  // ── 7. PERUBAHAN KONEKSI REAL-TIME ────────────────────────────────────────

  function watchConnectionChanges() {
    const conn =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    if (!conn) return;

    conn.addEventListener("change", () => {
      const newTier = getNetworkTier();
      if (newTier === window.__adaptiveTier) return;

      window.__adaptiveTier = newTier;

      // Re-apply ke gambar yang belum dimuat
      const unloadedImages = document.querySelectorAll(
        "img:not([data-loaded])",
      );
      unloadedImages.forEach((img) => {
        const originalSrc = img.dataset.adaptiveSrc || img.getAttribute("src");
        if (originalSrc) {
          img.src = transformImageUrl(originalSrc, newTier);
        }
      });

      if (window.__adaptiveDebug) {
        showNetworkIndicator(newTier, TIER_CONFIG[newTier].label);
      }
    });

    // Deteksi offline/online
    window.addEventListener("offline", () => {
      showNetworkIndicator("offline", "Offline");
    });
    window.addEventListener("online", () => {
      const tier = getNetworkTier();
      showNetworkIndicator(tier, TIER_CONFIG[tier].label);
    });
  }

  // ── 8. OBSERVER UNTUK GAMBAR YANG DITAMBAH DINAMIS (produk grid, dll) ─────

  function watchDynamicImages() {
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;

          const imgs =
            node.tagName === "IMG" ? [node] : [...node.querySelectorAll("img")];

          const tier = window.__adaptiveTier || getNetworkTier();
          const cfg = TIER_CONFIG[tier];
          const lazyObserver = setupLazyLoading(tier);

          imgs.forEach((img) => {
            const src = img.getAttribute("src");
            if (!src || img.dataset.adaptiveSrc) return;

            img.dataset.adaptiveSrc = src;

            if (tier === "high") {
              img.src = transformImageUrl(src, tier);
            } else {
              img.style.opacity = "0.3";
              img.style.filter = "blur(4px)";
              img.style.transition = "opacity 0.4s ease, filter 0.4s ease";
              img.onload = () => {
                img.style.opacity = "1";
                img.style.filter = "none";
              };
              lazyObserver.observe(img);
            }
          });
        });
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ── 9. ENTRY POINT ────────────────────────────────────────────────────────

  function init() {
    applyAdaptiveLoading();
    watchConnectionChanges();
    watchDynamicImages();

    // Expose API publik untuk kebutuhan kustom
    window.AdaptiveImages = {
      getTier: () => window.__adaptiveTier,
      getConfig: () => window.__adaptiveConfig,
      transformUrl: transformImageUrl,
      enableDebug: () => {
        window.__adaptiveDebug = true;
        showNetworkIndicator(
          window.__adaptiveTier,
          TIER_CONFIG[window.__adaptiveTier].label,
        );
      },
    };
  }

  // Jalankan setelah DOM siap
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
