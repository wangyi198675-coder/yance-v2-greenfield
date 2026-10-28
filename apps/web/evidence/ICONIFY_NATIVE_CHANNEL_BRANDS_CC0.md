# Native channel brand SVG resources (2026-10-29)

The UI uses real third-party brand icons from the open-source **Iconify SVG Logos** collection, not homemade letters, Unicode approximations or emoji.

Sources:
- https://api.iconify.design/logos/facebook.svg — Facebook channel (official circle-f visual form)
- https://api.iconify.design/logos/messenger.svg — Facebook personal Messenger
- https://api.iconify.design/logos/whatsapp-icon.svg — WhatsApp
- https://api.iconify.design/logos/telegram.svg — Telegram
- https://api.iconify.design/simple-icons/meta.svg?color=%230086FF — Meta company symbol, in the user's provided blue infinity reference style

License on icon package: SVG Logos by Gil Barbara **CC0** (https://icon-sets.iconify.design/logos/); Simple Icons Collaborators **CC0 1.0** for Meta (https://icon-sets.iconify.design/simple-icons/meta/). Trademark ownership and brand guidelines remain with respective companies, not transferred by the CC0 distribution.

Important brand distinction: https://www.meta.com/brand/resources/meta/company-brand/ says Meta company logo must not represent Facebook. Consequently each contact's avatar badge uses its actual app/channel logo; the Meta infinity symbol appears only as the family/provider indicator in the chat header for Meta-owned platforms. The user-requested infinity icon is not mislabeled as an official Facebook Page logo. The actual channel and current capability are accessible via header title and aria-label; no transmission privilege is inferred from appearance.

The SVGs are vendored locally in apps/web/src/assets/channels; runtime makes no external logo fetch. No changes to provider auth, contact mapping, sender, permissions or database.
