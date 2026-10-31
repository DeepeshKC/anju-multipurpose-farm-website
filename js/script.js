
// =====================================
// MOBILE NAVIGATION
// =====================================

const menuToggle = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");

if (menuToggle && navLinks) {

    menuToggle.addEventListener("click", function () {

        navLinks.classList.toggle("active");

        const isOpen = navLinks.classList.contains("active");

        menuToggle.setAttribute("aria-expanded", isOpen);
        menuToggle.innerHTML = isOpen ? "&times;" : "&#9776;";
    });

    // Close menu after clicking a navigation link

    navLinks.querySelectorAll("a").forEach(function (link) {

        link.addEventListener("click", function () {

            navLinks.classList.remove("active");

            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.innerHTML = "&#9776;";
        });

    });
    
}


 // =====================================
// COMPANY INFORMATION
// =====================================

if (typeof businessConfig !== "undefined") {

    // Update company logo
    const companyLogo = document.getElementById("company-logo");

    if (companyLogo) {
        companyLogo.textContent = businessConfig.companyName.toUpperCase();
    }

    // Update homepage tagline
    const companyTagline = document.getElementById("company-tagline");

    if (companyTagline) {
        companyTagline.textContent = businessConfig.tagline;
    }

    // Update footer company name
    const footerCompany = document.getElementById("footer-company");

    if (footerCompany) {
        footerCompany.textContent = businessConfig.companyName;
    }

 // Update copyright year
const footerYear = document.getElementById("footer-year");

if (footerYear) {
    footerYear.textContent = new Date().getFullYear();
}

// Update contact email
const contactEmail = document.getElementById("contact-email");

if (contactEmail) {
    contactEmail.href = "mailto:" + businessConfig.email;
}

}
