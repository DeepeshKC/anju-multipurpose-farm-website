
// =====================================
// 1. MOBILE NAVIGATION
// =====================================

const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");

if (menuToggle && navLinks) {

    menuToggle.addEventListener("click", function () {

        navLinks.classList.toggle("active");

        const isOpen = navLinks.classList.contains("active");

        menuToggle.setAttribute("aria-expanded", isOpen);
        menuToggle.textContent = isOpen ? "✕" : "☰";
    });

    // Close menu after selecting a navigation link

    navLinks.querySelectorAll("a").forEach(function (link) {

        link.addEventListener("click", function () {
            navLinks.classList.remove("active");
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.textContent = "☰";
        });

    });
}


// =====================================
// 2. ENGLISH / NEPALI LANGUAGE SWITCH
// =====================================

const languageToggle = document.getElementById("language-toggle");

let currentLanguage = localStorage.getItem("websiteLanguage") || "en";

function updateLanguage() {

    const elements = document.querySelectorAll("[data-en][data-ne]");

    elements.forEach(function (element) {

        if (currentLanguage === "ne") {
            element.textContent = element.getAttribute("data-ne");
        } else {
            element.textContent = element.getAttribute("data-en");
        }

    });

    document.documentElement.lang = currentLanguage;

    if (languageToggle) {
        languageToggle.textContent =
            currentLanguage === "en" ? "नेपाली" : "English";
    }

}

if (languageToggle) {

    languageToggle.addEventListener("click", function () {

        currentLanguage = currentLanguage === "en" ? "ne" : "en";

        localStorage.setItem("websiteLanguage", currentLanguage);

        updateLanguage();

    });

}

// Apply saved language when page loads

updateLanguage();
