# sunmint_beta

Sunmint Farmer App — simplified email-link + tree-planting report, TrueSight DAO.

Deployed at **beta.sunmint.truesight.me** via GitHub Pages.

This is the working base. All changes land here first; `sunmint_prod` (deployed at
**sunmint.truesight.me**) is a GitHub **fork** of this repo, promoted via:

```bash
gh repo sync TrueSightDAO/sunmint_prod --source TrueSightDAO/sunmint_beta
```

**⚠️ Never edit `CNAME` here to anything other than `beta.sunmint.truesight.me`.**
`sunmint_prod`'s `CNAME` (`sunmint.truesight.me`) is a deliberately-diverged file —
`gh repo sync` only fast-forwards commits, so it never touches a file that beta
doesn't also change. If beta's CNAME is ever edited, that change *will* flow into
prod on the next sync and silently break the live domain (this is exactly what
happened to `truesight_me_prod` on 2025-11-30 — its CNAME got overwritten with
`beta.truesight.me` during a promotion, breaking truesight.me for months
undetected).
