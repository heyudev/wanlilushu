---
name: refresh-data
description: Verify and update Wanlilushu admission prices, pet policies, fuel prices, border policies, and other data in data/research/. Arguments specify the scope, such as entries due for review, attraction names, or policy fuel prices.
---

# Verify and update road trip data

English | [简体中文](SKILL.zh-CN.md)

Scope: $ARGUMENTS. If empty, first run `npm run data:check` and select the entries categorized as `到了复核日期` (due for review) and `超过有效期未复核` (stale).

## Rules

- Edit only `data/research/*.json`. If necessary, update the `tip` and `dog` text in `data/route.json`. Do not change application code.
- Every value needs a source. Prefer attraction websites, official public-account announcements, and government sites, followed by online travel agencies and news from the past year. Cite only links you actually opened.
- If a value cannot be verified, keep `null` and explain it in `note`. Do not fill it with an estimate.
- Use `high` for original official sources, `medium` for online travel agencies or news, and `low` for search snippets alone, outdated information, or conflicting sources. Explain conflicting figures in `note`.
- Set `checked` to today's date for each edited or reviewed entry. Set `review_by` and `review_note` when a future change is known; remove `review_by` once the due review has been completed.
- Use objective wording. Do not include process narration such as “I found” or “in this check.” Keep application data text in Chinese.

## Steps

1. List the entries to verify, with file, `node`, and `name`.
2. Research each entry and edit its JSON. Preserve valid UTF-8 JSON and the file's existing one- or two-space indentation.
3. Run `npm run data`, `npm test`, and `npm run build`. All must pass.
4. Report changed entries, previous and new values, and source links. List anything that could not be verified. Do not commit automatically.
