
const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");
const languageToggle = document.getElementById("language-toggle");

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const translations = document.querySelectorAll("[data-en][data-ne]");
const languageStorageKey = "anju-farm-language";

function setLanguage(language) {
  const selectedLanguage = language === "ne" ? "ne" : "en";

  document.documentElement.lang = selectedLanguage;

  translations.forEach((element) => {
    element.textContent = element.dataset[selectedLanguage];
  });

  if (languageToggle) {
    languageToggle.textContent = selectedLanguage === "en" ? "नेपाली" : "English";
    languageToggle.setAttribute(
      "aria-label",
      selectedLanguage === "en" ? "Switch to Nepali" : "Switch to English"
    );
  }

  try {
    localStorage.setItem(languageStorageKey, selectedLanguage);
  } catch (error) {
    // Language switching still works when storage is unavailable.
  }
}

let savedLanguage = "en";

try {
  savedLanguage = localStorage.getItem(languageStorageKey) || "en";
} catch (error) {
  savedLanguage = "en";
}

setLanguage(savedLanguage);

if (languageToggle) {
  languageToggle.addEventListener("click", () => {
    const nextLanguage = document.documentElement.lang === "ne" ? "en" : "ne";
    setLanguage(nextLanguage);
  });
}
