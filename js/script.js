
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

    // Update navigation labels
    const navHome = document.getElementById("nav-home");
    const navAbout = document.getElementById("nav-about");
    const navServices = document.getElementById("nav-services");
    const navContact = document.getElementById("nav-contact");

    if (navHome) navHome.textContent = businessConfig.navigation[0];
    if (navAbout) navAbout.textContent = businessConfig.navigation[1];
    if (navServices) navServices.textContent = businessConfig.navigation[2];
    if (navContact) navContact.textContent = businessConfig.navigation[3];

 
    // Update homepage hero section
    const heroLabel = document.getElementById("hero-label");
    const companyTagline = document.getElementById("company-tagline");
    const heroDescription = document.getElementById("hero-description");
    const heroButton = document.getElementById("hero-button");

    if (heroLabel) {
        heroLabel.textContent = businessConfig.heroLabel;
    }

    if (companyTagline) {
        companyTagline.textContent = businessConfig.heroTitle;
    }

    if (heroDescription) {
        heroDescription.textContent = businessConfig.heroDescription;
    }

    if (heroButton) {
        heroButton.textContent = businessConfig.heroButtonText;
    }
    // Update homepage hero image
    const heroImage = document.getElementById("hero-image");

    if (heroImage) {
        heroImage.src = businessConfig.heroImage;
        heroImage.alt = businessConfig.heroImageAlt;
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


    // Update contact email and button
    const contactEmail = document.getElementById("contact-email");
    const contactButton = document.getElementById("contact-button");

    if (contactEmail) {
        contactEmail.href = "mailto:" + businessConfig.email;
        contactEmail.textContent = businessConfig.email;
    }

    if (contactButton) {
        contactButton.href = "mailto:" + businessConfig.email;
    }

    // Update contact phone
    const contactPhone = document.getElementById("contact-phone");

    if (contactPhone) {
        contactPhone.href = "tel:" + businessConfig.phone.replace(/\s+/g, "");
        contactPhone.textContent = businessConfig.phone;
    }

    // Update contact address
    const contactAddress = document.getElementById("contact-address");

    if (contactAddress) {
        contactAddress.textContent = businessConfig.address;
    }


    // Update services
    const servicesGrid = document.getElementById("services-grid");

    if (servicesGrid) {
        servicesGrid.innerHTML = "";

        businessConfig.services.forEach(function (service) {
            const serviceCard = document.createElement("div");
            serviceCard.className = "service-card";

            const serviceTitle = document.createElement("h3");
            serviceTitle.textContent = service.title;

            const serviceDescription = document.createElement("p");
            serviceDescription.textContent = service.description;

            serviceCard.appendChild(serviceTitle);
            serviceCard.appendChild(serviceDescription);

            servicesGrid.appendChild(serviceCard);
        });
    }
    // Update about section
    const aboutTitle = document.getElementById("about-title");
    const aboutDescription = document.getElementById("about-description");

    if (aboutTitle) {
        aboutTitle.textContent = businessConfig.aboutTitle;
    }

    if (aboutDescription) {
        aboutDescription.textContent = businessConfig.aboutDescription;
    }
    
}
