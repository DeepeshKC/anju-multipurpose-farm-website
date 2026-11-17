# Anju Multipurpose Agriculture Farm Website

Official website for **Anju Multipurpose Agriculture Farm**, a family-run farm and homestay in **Basdol, Banepa–12, Kavrepalanchowk, Nepal**.

**Website:** https://www.anjumultipurposefarm.com.np/  
**Hosting:** Cloudflare Pages  
**Repository:** `DeepeshKC/anju-multipurpose-farm-website`

The website introduces the farm, agriculture and livestock, traditional Nepali food, family homestay, village experiences, and farm stories. The interface supports **English and Nepali**.

## Main features

- Responsive homepage and mobile navigation
- English/Nepali language switcher with saved language preference
- Farm, homestay, food, experiences, location, and contact sections
- Blog listing and individual story pages
- Password-protected blog administration and draft/published workflow
- Search-engine metadata, Open Graph sharing image, `robots.txt`, and `sitemap.xml`
- Phone, email, Facebook, and WhatsApp contact links

## Project structure

```text
├── index.html                 # Main homepage
├── blog.html                  # Blog listing
├── post.html                  # Individual story template
├── admin/index.html           # Blog administration interface
├── css/style.css              # Website styles and responsive layout
├── js/
│   ├── script.js              # Navigation and language switching
│   ├── blog.js                # Blog listing
│   ├── post.js                # Individual story rendering
│   └── admin.js               # Blog administration UI
├── functions/                 # Cloudflare Pages Functions and API
├── migrations/0001_posts.sql # D1 database schema
├── images/                    # Website photos, sharing image, favicon
├── _routes.json               # Pages Functions routing
├── robots.txt
└── sitemap.xml
```

`anju-farm-index.html`, if still present, is an older duplicate and is **not** the homepage served at `/`; verify that nothing references it before removing it.

## Technology and hosting

- HTML5, CSS3, and vanilla JavaScript
- GitHub source repository
- Cloudflare Pages for hosting and deployments
- Cloudflare Pages Functions for blog APIs
- Cloudflare D1 for storing blog posts and login-attempt records

The public site requires no frontend build framework. The dynamic blog and admin features require the configured Cloudflare environment; opening HTML files locally does not reproduce those APIs.

## Deployment

1. Make and review changes in the GitHub repository.
2. Commit and push to the branch connected to the Cloudflare Pages project.
3. Wait for the Cloudflare Pages deployment to complete.
4. Check the permanent website and test both desktop and mobile layouts.
5. Verify the English/Nepali switcher, blog, contact links, and sharing preview.

**Cloudflare Pages project:** `anju-multipurpose-farm-website`  
**Permanent public URL:** https://www.anjumultipurposefarm.com.np/

The non-`www` domain is configured to redirect permanently to the `www` address. The `pages.dev` address may remain available for hosting and deployment previews, but public-facing SEO and sharing links should use the permanent domain.

## Blog administration

The admin interface is located at `/admin/`. Authorized editors can create, edit, publish, and delete stories. Published stories are listed on `blog.html` and displayed by `post.html?slug=...`.

The server-side environment needs:

- A **D1 binding named `DB`** with the schema in `migrations/0001_posts.sql` applied
- An **`ADMIN_PASSWORD`** secret
- An **`ADMIN_SECRET`** secret for signing admin sessions

Configure these in the Cloudflare Pages project settings. **Never commit actual passwords, secret values, or database credentials to GitHub.**

The interface is bilingual, but switching the interface language does **not** automatically translate the text of published articles.

## SEO and social sharing

- `index.html`, `blog.html`, and `post.html` contain page-level metadata.
- `images/anju-farm-social-preview.jpg` is used for social-sharing previews.
- `robots.txt` points search engines to `sitemap.xml`.
- The sitemap currently lists the homepage and blog index; individual dynamic blog articles are not yet listed automatically.
- Dynamic article pages currently have limitations for article-specific search crawler metadata and previews.

After updating public URLs or metadata, verify them on the permanent domain and resubmit the sitemap in Google Search Console when appropriate.

## Important notes

- Keep **Basdol** as the English place spelling and **बाँसडोल** in Nepali.
- The family homestay is **operating**, not a future project.
- The farm's Google Maps location is awaiting verification; do not replace the current notice with an unverified map pin.
- Keep image filenames and paths consistent with their references in HTML/CSS/JS.
- Preserve existing DNS email records when managing the domain.
- Test any admin or database changes on the deployed Cloudflare environment.

## Maintenance checklist

- Confirm homepage and blog work in both languages.
- Test mobile navigation, footer, and all contact links.
- Confirm the latest social preview image appears when sharing the permanent URL.
- Check `https://www.anjumultipurposefarm.com.np/robots.txt` and `/sitemap.xml`.
- Review published blog content and indexing as the blog grows.

---

**Anju Multipurpose Agriculture Farm**  
Basdol, Banepa–12, Kavrepalanchowk, Nepal
