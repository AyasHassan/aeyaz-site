# aeyaz.com

Portfolio website for Aeyaz, Director of Photography.

- `content/`: all the site's text and project data. Edit it through the admin panel at https://app.pagescms.org.
- `images/`: thumbnails and stills uploaded through the admin panel.
- `assets/`: the design (style.css) and small scripts (site.js).
- `build.js`: turns the content into the website. Cloudflare runs it automatically.

## Cloudflare Pages settings

- Framework preset: None
- Build command: `node build.js`
- Build output directory: `dist`

## Tips

- Thumbnails: 16:9 JPG, about 1600 px wide.
- Stills: JPG, about 2000–2400 px wide, under 1 MB each.
- Videos stay on Vimeo; paste the link in the project. For a private or unlisted Vimeo, paste the full link including the code at the end.
- Contact form: get a free access key at https://web3forms.com (enter email@aeyaz.com), then paste it in Site settings → Contact form key.
