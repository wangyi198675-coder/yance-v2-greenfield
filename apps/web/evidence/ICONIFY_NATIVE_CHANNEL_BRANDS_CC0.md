# Yance native channel SVG resources / user-approved mapping (2026-10-29)

Assets are vendored locally from open-source Iconify icon sets; no remote runtime requests or handcrafted emoji/letters.

Assets / sources:
- Messenger personal / Facebook personal: https://api.iconify.design/logos/messenger.svg
- Facebook Page: https://api.iconify.design/simple-icons/meta.svg?color=%230086FF
- WhatsApp: https://api.iconify.design/logos/whatsapp-icon.svg
- Telegram: https://api.iconify.design/logos/telegram.svg

User-approved **UI identification convention**, rather than a declaration about official platform logos:
- `FB_PERSONAL`: one Messenger logo at bottom-right of avatar.
- `FB_PAGE`: one blue Meta infinity logo at bottom-right of avatar.
- `WHATSAPP_PERSONAL` and `TELEGRAM_PERSONAL`: corresponding channel logos.
- No duplicate logos after contact name or beneath chat heading. No FB/Page text capsule. Complete channel/account details remain available through the accessible contact name and avatar tooltip, without implying a send permission.

Trademark note: Meta is the parent-company brand, not the official Facebook Page app brand; using the blue infinity for Page is this user's explicit in-app visual convention, not an assertion that Meta officially designates Page with that logo. This deliberately differs from Meta's public brand guidance (https://www.meta.com/brand/resources/meta/company-brand/).

License: SVG Logos by Gil Barbara CC0 (https://icon-sets.iconify.design/logos/); Simple Icons Collaborators CC0 1.0 for Meta (https://icon-sets.iconify.design/simple-icons/meta/). Trademarks belong to respective owners, not transferred with CC0 SVG distribution.

Only front-end visual assets and presentation are affected. Account, recipient, platform, message MID, authorizations, Page sending and provider behaviors remain unchanged.
