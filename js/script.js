const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");
const languageToggle = document.getElementById("language-toggle");
const currentYear = document.getElementById("current-year");

let currentLanguage = "en";
const pageTitles = {
  home: {en:"Anju Multipurpose Agriculture Farm | Farm & Homestay in Basdol", ne:"अञ्जु बहुउद्देश्यीय कृषि फार्म | बसडोल, बनेपा"},
  blog: {en:"Blog | Anju Farm", ne:"ब्लग | अञ्जु फार्म"},
  post: {en:"Farm Story | Anju Farm", ne:"फार्म कथा | अञ्जु फार्म"}
};

// Keep the footer year current.
if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

// Apply the selected language to all elements with English and Nepali text.
function setLanguage(language) {
  if (language !== "en" && language !== "ne") {
    language = "en";
  }

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

  const page = location.pathname.endsWith('/blog.html') ? 'blog' : location.pathname.endsWith('/post.html') ? 'post' : 'home';
  if (page !== 'post' || !document.querySelector('#post h1')) document.title = pageTitles[page][language];
  document.dispatchEvent(new CustomEvent('anju-language-change', {detail:{language}}));

  try {
    localStorage.setItem("anjuFarmLanguage", language);
  } catch {
    // The website still works if browser storage is unavailable.
  }
}

// Language switcher.
if (languageToggle) {
  languageToggle.addEventListener("click", () => {
    setLanguage(currentLanguage === "en" ? "ne" : "en");
  });
}

// Mobile navigation.
if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("active");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation" : "Open navigation"
    );
  });

  // Close the mobile menu after a navigation link is selected.
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation");
    });
  });
}

// Restore the visitor's last selected language; English is the default.
try {
  const savedLanguage = localStorage.getItem("anjuFarmLanguage");

  if (savedLanguage === "en" || savedLanguage === "ne") {
    setLanguage(savedLanguage);
  }
} catch {
  // English is the default language when browser storage is unavailable.
}
