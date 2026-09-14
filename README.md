# The Slate

A weekly call on the real NFL season, made for one person. Each week the actual slate of games is dealt as cards. Tap a side to call the winner, drag the handle to rank how sure you are (top of the stack is worth the most), and every card locks at its own kickoff, shown in Perth time. When the games are final, Reveal runs the week in stack order and the wall is what you screenshot.

Plain HTML, CSS and JavaScript. Schedule and scores come from ESPN's public schedule feed: the 2026 season is baked into `data/season-2026.json` by `tools/bake-season.mjs`, the current week is fetched on open, and finals are cached in the browser. One Vercel function (`api/week.js`, pinned to Sydney) proxies the same feed for the case where the browser cannot reach it directly. Progress lives in localStorage; there are no accounts.

    node tools/bake-season.mjs      # refresh the baked schedule
    node --test tests/              # season logic: locks, Perth times, ordering, scoring, rival links
    python -m http.server 8801      # then open http://127.0.0.1:8801/
