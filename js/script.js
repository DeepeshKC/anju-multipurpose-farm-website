
const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");
const languageToggle = document.getElementById("language-toggle");
const currentYear = document.getElementById("current-year");

const pageTitles = {
  home: {
    en: "Anju Multipurpose Agriculture Farm | Farm & Homestay in Basdol",
    ne: "अञ्जु बहुउद्देश्यीय कृषि फार्म | बाँसडोल, बनेपा"
  },
  blog: {
    en: "Blog | Anju Farm",
    ne: "ब्लग | अञ्जु फार्म"
  },
  post: {
    en: "Farm Story | Anju Farm",
    ne: "फार्म कथा | अञ्जु फार्म"
  }
};

function getPage() {
  const path = window.location.pathname.replace(/\/+$/, "");

  if (path.endsWith("/post") || path.endsWith("/post.html")) {
    return "post";
  }

  if (path.endsWith("/blog") || path.endsWith("/blog.html")) {
    return "blog";
  }

  return "home";
}

function normalizeLanguage(language) {
  return language === "ne" ? "ne" : "en";
}

function readSavedLanguage() {
  try {
    const saved = localStorage.getItem("anjuFarmLanguage");

    if (saved === "en" || saved === "ne") {
      return saved;
    }
  } catch (error) {
    console.warn("Language preference unavailable:", error);
  }

  return "en";
}

function getInitialLanguage() {
  // Article links can explicitly request English or Nepali.
  // The URL takes priority over the saved preference.
  if (getPage() === "post") {
    const urlLanguage = new URLSearchParams(
      window.location.search
    ).get("lang");

    if (urlLanguage === "en" || urlLanguage === "ne") {
      return urlLanguage;
    }
  }

  return readSavedLanguage();
}

// Initialize the language before applying page translations.
let currentLanguage = getInitialLanguage();

function saveLanguage(language) {
  try {
    localStorage.setItem("anjuFarmLanguage", language);
  } catch (error) {
    console.warn("Unable to save language preference:", error);
  }
}

function updateYear(language) {
  if (!currentYear) return;

  const year = String(new Date().getFullYear());

  if (language === "ne") {
    currentYear.textContent = year.replace(
      /[0-9]/g,
      digit => "०१२३४५६७८९"[Number(digit)]
    );
  } else {
    currentYear.textContent = year;
  }
}

function updateLanguageButton(language) {
  if (!languageToggle) return;

  const isEnglish = language === "en";

  languageToggle.textContent = isEnglish
    ? "नेपाली"
    : "English";

  languageToggle.setAttribute(
    "aria-label",
    isEnglish
      ? "Switch to Nepali"
      : "Switch to English"
  );
}

function updatePageTitle(language) {
  const page = getPage();

  // Published article titles are managed by post.js.
  // Avoid replacing an already rendered article title.
  if (page === "post" && document.querySelector("#post h1")) {
    return;
  }

  document.title = pageTitles[page][language];
}

function updateArticleURL(language) {
  // Only article pages need the language in the URL.
  if (getPage() !== "post") return;

  const url = new URL(window.location.href);

  if (url.searchParams.get("lang") === language) {
    return;
  }

  url.searchParams.set("lang", language);

  window.history.replaceState(
    null,
    "",
    url.pathname + url.search + url.hash
  );
}

// Apply the selected language to the website.
function setLanguage(language) {
  language = normalizeLanguage(language);

  // Update the shared state first.
  currentLanguage = language;

  // Save before notifying other scripts.
  // post.js reads this value when loading the article.
  saveLanguage(language);

  document.documentElement.lang = language;

  updateYear(language);

  // Translate static website elements.
  document.querySelectorAll("[data-en][data-ne]").forEach(
    element => {
      const translation = element.getAttribute(
        `data-${language}`
      );

      if (translation !== null) {
        element.innerHTML = translation;
      }
    }
  );

  // Translate image descriptions.
  document.querySelectorAll(
    "img[data-alt-en][data-alt-ne]"
  ).forEach(img => {
    img.alt = img.getAttribute(
      `data-alt-${language}`
    );
  });

  // Translate metadata.
  document.querySelectorAll(
    "meta[data-content-en][data-content-ne]"
  ).forEach(meta => {
    meta.setAttribute(
      "content",
      meta.getAttribute(`data-content-${language}`)
    );
  });

  updateLanguageButton(language);
  updatePageTitle(language);
  updateArticleURL(language);

  // Notify blog.js and post.js only after all
  // language state has been synchronized.
  document.dispatchEvent(
    new CustomEvent("anju-language-change", {
      detail: {
        language
      }
    })
  );
}

// Language switcher.
if (languageToggle) {
  languageToggle.addEventListener("click", () => {
    const nextLanguage =
      currentLanguage === "en" ? "ne" : "en";

    setLanguage(nextLanguage);
  });
}

// Mobile navigation.
if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("active");

    menuToggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );

    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation" : "Open navigation"
    );
  });

  // Close the mobile menu after a navigation link is selected.
  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");

      menuToggle.setAttribute(
        "aria-expanded",
        "false"
      );

      menuToggle.setAttribute(
        "aria-label",
        "Open navigation"
      );
    });
  });
}

// Initialize the website using the URL language
// or the visitor's saved preference.
setLanguage(currentLanguage);
