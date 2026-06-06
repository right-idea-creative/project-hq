# lifeweb

A spatial canvas for personal life organization. Nodes are widgets (countdown,
checklist, hero-todo, sticky note, brainstorm cluster) that read from a shared
data layer. The canvas is the frontend; the table is the spine.

## Status

- [x] Base canvas shell — pannable surface, single placeholder hex
- [ ] Widget types
- [ ] Postgres/Supabase data layer
- [ ] n8n agents feeding structured data in

## Run

It's a single static file. Open `index.html`, or serve locally:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000
