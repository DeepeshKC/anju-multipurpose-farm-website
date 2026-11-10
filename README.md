# Business Website Template

A reusable, responsive business website template built with **HTML, CSS, and JavaScript**.

Designed for small businesses, consultancies, IT companies, retail stores, restaurants, and professional service providers.

## Features

- Responsive desktop and mobile layout
- Mobile hamburger navigation
- Customizable company information
- Hero section with configurable image and text
- About and services sections
- Contact information and email links
- Social media links
- Configurable footer
- SEO title and meta description
- Open Graph metadata for social sharing
- Customizable favicon

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript

No frontend framework or build tools are required.

## Project Structure

```text
business-website-template/
│
├── index.html
├── README.md
│
├── css/
│   └── style.css
│
├── js/
│   ├── config.js
│   └── script.js
│
└── images/
    └── favicon.png
```

## Customization Guide

Most website content can be changed through:

`js/config.js`

### 1. Company Information

Update the company name and other general information.

### 2. SEO Settings

Customize:
- Page title
- Meta description
- Open Graph title
- Open Graph description
- Open Graph image

These settings help search engines and social platforms understand the website.

### 3. Hero Section

Change the following:
- Hero heading
- Description
- Label
- Button text
- Hero image URL
- Image description (alt text)

### 4. About Section

Update the About heading and description to introduce the business.

### 5. Services

Edit the services array in `config.js` to change service names and descriptions.

### 6. Contact Information

Update:
- Email address
- Phone number
- Business address

The email and phone links use `mailto:` and `tel:`.

### 7. Social Media

Add the appropriate social media URLs for Facebook, Instagram, LinkedIn, and YouTube.

Leave a field empty if the business does not use that platform.

### 8. Footer

Customize the company name and copyright text.

### 9. Favicon

Replace:

`images/favicon.png`

with the client's favicon image. Keep the filename and location unchanged unless you also update the favicon setting in `config.js`.

## Styling

The website's appearance is controlled by:

`css/style.css`

You can customize:
- Colors
- Fonts
- Spacing
- Layout
- Buttons
- Responsive styles

## JavaScript

The file `js/script.js` controls the website's interactive features and applies the settings from `config.js`.

Avoid placing website content or configuration data directly into this file unless necessary.

## Deployment

This project can be deployed as a static website using a compatible hosting service.

The current project is connected to Cloudflare through GitHub. Changes pushed to the connected repository can trigger a new deployment, depending on the deployment settings.

## Creating a Client Website

For each new client:

1. Create a separate copy of the template.
2. Update `js/config.js` with the client's information.
3. Replace the hero image and favicon.
4. Customize the colors and styling if required.
5. Test the website on desktop and mobile.
6. Deploy the website using the client's hosting arrangement.

## Important Notes

- Keep the existing file and folder structure unless you update the corresponding references.
- Use valid image URLs or images stored in the project.
- Test all navigation links and contact information before publishing.
- This template currently uses an email link rather than a server-powered contact form.

---

**Business Website Template**  
Built with HTML, CSS, and JavaScript.
Website deployment verification — November 2026.
