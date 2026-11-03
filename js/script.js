
const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");
const languageToggle = document.getElementById("language-toggle");
const currentYear = document.getElementById("current-year");

let currentLanguage = "en";

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

function setLanguage(language) {
  currentLanguage = language;

  document.documentElement.lang = language;

  document.querySelectorAll("[data-en][data-ne]").forEach((element) => {
    const translation = element.getAttribute(`data-${language}`);

    if (translation !== null) {
      element.innerHTML = translation;
    }
  });

  if (languageToggle) {
    languageToggle.textContent = language === "en" ? "नेपाली" : "English";

    languageToggle.setAttribute(
      "aria-label",
      language === "en" ? "Switch to Nepali" : "Switch to English"
    );
  }

  document.title =
    language === "en"
      ? "Anju Multipurpose Agricultural Farm | Farm & Homestay in Basdol"
      : "अञ्जु बहुउद्देश्यीय कृषि फार्म | बसडोल, बनेपा";

  try {
    localStorage.setItem("anjuFarmLanguage", language);
  } catch {
    // The website still works if browser storage is unavailable.
  }
}

if (languageToggle) {
  languageToggle.addEventListener("click", () => {
    setLanguage(currentLanguage === "en" ? "ne" : "en");
  });
}

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("active");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation" : "Open navigation"
    );
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation");
    });
  });
}

try {
  const savedLanguage = localStorage.getItem("anjuFarmLanguage");

  if (savedLanguage === "en" || savedLanguage === "ne") {
    setLanguage(savedLanguage);
  }
} catch {
  // English is the default language.
}
