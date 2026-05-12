# Graph Report - .  (2026-05-12)

## Corpus Check
- 39 files · ~52,657 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 437 nodes · 578 edges · 26 communities (21 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.81)
- Token cost: 178,000 input · 17,000 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth Middleware & Security|Auth Middleware & Security]]
- [[_COMMUNITY_SEO & Artist Links|SEO & Artist Links]]
- [[_COMMUNITY_Photo Upload & Storage|Photo Upload & Storage]]
- [[_COMMUNITY_Campaign & Click Tracking|Campaign & Click Tracking]]
- [[_COMMUNITY_Project Conventions & Rationale|Project Conventions & Rationale]]
- [[_COMMUNITY_Server Architecture Rationale|Server Architecture Rationale]]
- [[_COMMUNITY_Links Service CRUD|Links Service CRUD]]
- [[_COMMUNITY_Gallery Service CRUD|Gallery Service CRUD]]
- [[_COMMUNITY_Image Resize & Cache|Image Resize & Cache]]
- [[_COMMUNITY_User Activity Logging|User Activity Logging]]
- [[_COMMUNITY_Campaign Manager|Campaign Manager]]
- [[_COMMUNITY_CSS Build Pipeline|CSS Build Pipeline]]
- [[_COMMUNITY_Signed Image URLs|Signed Image URLs]]
- [[_COMMUNITY_Text Utils & SEO Data|Text Utils & SEO Data]]
- [[_COMMUNITY_Photo Click Tracking|Photo Click Tracking]]
- [[_COMMUNITY_Tracking Middleware|Tracking Middleware]]
- [[_COMMUNITY_Server Config Singleton|Server Config Singleton]]
- [[_COMMUNITY_LQIP Placeholder Generation|LQIP Placeholder Generation]]
- [[_COMMUNITY_CSS Autoprefixer|CSS Autoprefixer]]
- [[_COMMUNITY_Gallery Card Rendering|Gallery Card Rendering]]
- [[_COMMUNITY_Thumbnail WebP Conversion|Thumbnail WebP Conversion]]
- [[_COMMUNITY_Email Sending|Email Sending]]
- [[_COMMUNITY_Home Hero & SEO Data|Home Hero & SEO Data]]
- [[_COMMUNITY_Image Processing Scripts|Image Processing Scripts]]
- [[_COMMUNITY_Email Test Script|Email Test Script]]

## God Nodes (most connected - your core abstractions)
1. `UserActivityLogger` - 13 edges
2. `CampaignManager` - 12 edges
3. `loadLinksConfig()` - 11 edges
4. `saveLinksConfig()` - 10 edges
5. `PhotoClickTracker` - 10 edges
6. `ServerConfig` - 9 edges
7. `TextUtils` - 8 edges
8. `pagesRouter (public pages, home/contact/galleries/sitemap)` - 8 edges
9. `CampaignService` - 7 edges
10. `loadGalleries()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `CampaignService (runtime user-campaign cache, 24h TTL)` --semantically_similar_to--> `CampaignManager (persistent campaign storage in campaigns.json)`  [INFERRED] [semantically similar]
  server/utils/campaignService.js → scripts/CampaignManager.js
- `Admin Logs Viewer` --shares_data_with--> `UserActivityLogger Class`  [INFERRED]
  pages/admin/logs.html → scripts/UserActivityLogger.js
- `Precompressed Assets Middleware (br/gz)` --conceptually_related_to--> `CSS Pipeline (autoprefixer → csso → fingerprint → precompress)`  [INFERRED]
  server.js → AGENTS.md
- `Event Banner API Handler` --conceptually_related_to--> `Link-in-Bio Page (/links)`  [INFERRED]
  server.js → pages/links.html
- `Admin Logs Viewer` --conceptually_related_to--> `7-Day FIFO Log Cleanup`  [EXTRACTED]
  pages/admin/logs.html → scripts/UserActivityLogger.js

## Hyperedges (group relationships)
- **Admin Authentication System (HMAC cookie + Express session)** — middleware_auth_checkAdminPassword, middleware_auth_requireAdminSession, middleware_auth_requireAdminPage, middleware_auth_restoreAdminSessionFromCookie, concept_admin_hmac_cookie_auth [EXTRACTED 0.95]
- **End-to-end Campaign Tracking Pipeline (URL params → cache → logging → analytics)** — utils_campaignService_CampaignService, scripts_CampaignManager_CampaignManager, middleware_tracking_userTrackingMiddleware, middleware_tracking_campaignMiddleware, routes_content_contentRouter [INFERRED 0.85]
- **SEO Meta Tag & Schema.org JSON-LD Generation Pipeline** — utils_textUtils_TextUtils, routes_pages_pagesRouter, utils_linksService_linksServiceModule [INFERRED 0.80]
- **CSS Build → Precompress → Serve Pipeline** — scripts_build_assets, server_precompressed_assets_middleware, agents_css_pipeline [INFERRED 0.90]
- **Admin Dashboard Navigation Hub** — page_admin_admin_html, page_admin_logs_html, page_admin_campaigns_html, page_admin_text_editor_html, page_admin_galleries_html, page_admin_links_html [EXTRACTED 1.00]
- **Public Pages Share Design Patterns (Blobs + Navbar + Photo Protection)** — animated_blobs_pattern, common_navbar_alpine, photo_protection_client_js, page_home_html, page_about_me_html, page_contact_html, page_mentions_html [EXTRACTED 1.00]

## Communities (26 total, 5 thin omitted)

### Community 0 - "Auth Middleware & Security"
Cohesion: 0.05
Nodes (48): clearAdminAuthCookie(), computeAdminToken(), crypto, requireAdminPage(), requireAdminSession(), restoreAdminSessionFromCookie(), serverConfig, setAdminAuthCookie() (+40 more)

### Community 1 - "SEO & Artist Links"
Cohesion: 0.04
Nodes (45): artistLinksSection, artistName, artistNames, artistSameAs, artistsSeoIndexHtml, bottomArtists, bottomVenues, cached (+37 more)

### Community 2 - "Photo Upload & Storage"
Cohesion: 0.06
Nodes (30): config, dateStr, exifr, express, finalPath, fs, images, multer (+22 more)

### Community 3 - "Campaign & Click Tracking"
Cohesion: 0.06
Nodes (33): allowedOrigins, allowedPages, campaignInfo, campaignService, clickData, crypto, date, dates (+25 more)

### Community 4 - "Project Conventions & Rationale"
Cohesion: 0.1
Nodes (31): Admin Dark Theme Design System, Cookie HMAC Admin Auth Pattern, CSS Pipeline (autoprefixer → csso → fingerprint → precompress), AGENTS.md Project Conventions, French Language Convention, HMAC-Signed HD Image URLs, Animated Blobs Background Pattern, Shared Alpine.js Navbar Component (+23 more)

### Community 5 - "Server Architecture Rationale"
Cohesion: 0.1
Nodes (28): HMAC Cookie Admin Authentication (sha256, 30-day expiry), Config file precedence (CONFIG_FILE env → config.json → config.local.json → .example fallback), Contact form anti-abuse (rate-limit, honeypot, CSRF token, timestamp signature, origin check, spam keywords), EXIF date extraction (EXIF → filename pattern → file mtime fallback), SSR first-images LCP optimization (server-renders first 4 gallery images, injects full photo data as JSON in page), ServerConfig (singleton), checkAdminPassword (header-based auth middleware), requireAdminPage (page session auth middleware) (+20 more)

### Community 6 - "Links Service CRUD"
Cohesion: 0.16
Nodes (22): addLink(), clearEventBanner(), deleteLink(), fs, generateAvatarHtml(), generateEventBannerHtml(), generateWatermarkHtml(), getActiveLinks() (+14 more)

### Community 7 - "Gallery Service CRUD"
Cohesion: 0.22
Nodes (18): createGallery(), deleteGallery(), fs, galleriesPath, generateId(), generateUniqueSlug(), getGalleryById(), getGalleryBySlug() (+10 more)

### Community 8 - "Image Resize & Cache"
Cohesion: 0.11
Nodes (15): allowedWidths, base, cacheDir, cachePath, config, express, fmt, fs (+7 more)

### Community 9 - "User Activity Logging"
Cohesion: 0.22
Nodes (3): fs, path, UserActivityLogger

### Community 10 - "Campaign Manager"
Cohesion: 0.24
Nodes (3): CampaignManager, fs, path

### Community 11 - "CSS Build Pipeline"
Cohesion: 0.21
Nodes (14): buildCss(), cleanupOldFingerprinted(), crypto, csso, fileExists(), fs, hashContent(), loadOldFingerprintedName() (+6 more)

### Community 12 - "Signed Image URLs"
Cohesion: 0.15
Nodes (13): crypto, expiresAt, express, fs, fullPath, generateSignature(), normalized, now (+5 more)

### Community 13 - "Text Utils & SEO Data"
Cohesion: 0.22
Nodes (5): fs, path, seoDataPath, serverConfig, TextUtils

### Community 14 - "Photo Click Tracking"
Cohesion: 0.22
Nodes (3): fs, path, PhotoClickTracker

### Community 17 - "LQIP Placeholder Generation"
Cohesion: 0.33
Nodes (6): fs, generatePlaceholders(), path, photosDir, placeholdersDir, sharp

### Community 18 - "CSS Autoprefixer"
Cohesion: 0.29
Nodes (6): autoprefixer, fs, inPath, outPath, path, postcss

### Community 19 - "Gallery Card Rendering"
Cohesion: 0.33
Nodes (6): artistPlatformIcon(), escapeAttr(), formatGalleryDate(), renderArtistLinksSection(), renderGalleryCard(), safeExternalUrl()

### Community 20 - "Thumbnail WebP Conversion"
Cohesion: 0.4
Nodes (5): convertThumbnailsToWebP(), fs, path, sharp, thumbnailsDir

### Community 21 - "Email Sending"
Cohesion: 0.4
Nodes (4): mailOptions, nodemailer, port, transporter

## Ambiguous Edges - Review These
- `French Language Convention` → `Contact Form Anti-Spam Protections`  [AMBIGUOUS]
  AGENTS.md · relation: conceptually_related_to

## Knowledge Gaps
- **229 isolated node(s):** `fs`, `path`, `crypto`, `serverConfig`, `campaignService` (+224 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `French Language Convention` and `Contact Form Anti-Spam Protections`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ServerConfig` connect `Server Config Singleton` to `Auth Middleware & Security`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `requireAdminSession()` connect `Auth Middleware & Security` to `Photo Upload & Storage`, `Campaign & Click Tracking`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `crypto` to the rest of the system?**
  _229 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth Middleware & Security` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `SEO & Artist Links` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Photo Upload & Storage` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._