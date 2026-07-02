const NAV_HTML = `
<header class="hq-nav" data-page="daily">
  <a class="hq-brand" href="/">LIFE HQ</a>
  <nav class="hq-tabs">
    <a class="hq-tab" href="/">Journal</a>
    <a class="hq-tab active" href="/daily">Daily</a>
    <a class="hq-tab" href="/radar">Radar</a>
  </nav>
</header>`;

const NAV_CSS_LINK = `<link rel="stylesheet" href="/nav.css">`;

export async function onRequest(context) {
  const obj = await context.env.NATEPAREIL.get("daily.html");

  if (!obj) {
    // no edition: still show the nav so the site doesn't dead-end
    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
      `<title>The Daily Natepareil</title>${NAV_CSS_LINK}</head>` +
      `<body style="margin:0;background:#fff;">${NAV_HTML}` +
      `<p style="font-family:Georgia,serif;padding:2rem;color:#1a1a1a;">No edition today.</p>` +
      `</body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const upstream = new Response(obj.body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

  // stream-transform the broadsheet: stylesheet into <head>, nav after <body>.
  // The R2 object itself is never modified.
  return new HTMLRewriter()
    .on("head", {
      element(el) {
        el.append(NAV_CSS_LINK, { html: true });
      },
    })
    .on("body", {
      element(el) {
        el.prepend(NAV_HTML, { html: true });
      },
    })
    .transform(upstream);
}
