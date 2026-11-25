# The VE Collection

A static website and travel office toolkit. The public site opens at `index.html`. Open `staff.html` for the quote builder, voucher builder, quote and booking tracker, and traveller payments.

## Preview locally

Extract the entire ZIP to a normal Windows folder. Double-click `OPEN WEBSITE.cmd` to open the site in your default browser. Keep the preview window open. The home page is at `http://127.0.0.1:8771/index.html` and the staff tools are at `http://127.0.0.1:8771/staff.html`.

If your browser reports that it cannot reach the preview, double-click `OPEN HOME PAGE.cmd` in the extracted folder to open the public site directly from disk. This shortcut does not need Python or a running preview. For shared staff records, use `OPEN WEBSITE.cmd` and the address displayed in its window. If port 8771 is busy, the launcher selects an available port.

The full preview launcher uses Python 3. Opening an individual HTML file from a ZIP or a file preview can omit its companion scripts, images and styles. Use the local preview for tools that share records between pages, and use the same address and browser profile each time. Existing records saved on a different origin stay there.

## Put this on GitHub

Create a separate GitHub repository for The VE Collection and upload the contents of this folder to its root, including `assets` and `locales`. Enable GitHub Pages from the branch containing these files and select its root. There is no build step. The repository root should contain `index.html`, rather than another enclosing folder.

Before opening the site to customers, add your confirmed enquiry email or HTTPS form endpoint in `site-config.js` and review the privacy policy and booking terms for the new company. The contact form can prepare and download an enquiry brief until delivery is configured. Enter your new site URL and contact details in the quote builder. Add supplier or customer payment URLs only in the appropriate staff tool.

GitHub Pages serves static pages. Staff pages have no login and anyone with their URLs can open the tools. Booking and payment records remain in your browser, use new storage keys, and are not synced. Keep drafts, vouchers, quotes, backups and client details outside the public repository. The .gitignore covers common generated file names.

## Included

- All public site pages from the original project, with the same navigation, holiday catalogue, filters, saved journeys, and English, French, German, Spanish and Italian language selector.
- The selected Interlocking Monogram artwork, with web-sized variants and embedded artwork for quote and voucher exports.
- Quote and ticket builders with existing import formats, along with traveller payment tools and the quote line-item tracker.
- Destination photography in the campaign preview slots, replacing artwork carrying the previous brand.
