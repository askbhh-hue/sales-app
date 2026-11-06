# Secrets inventory

| Secret | Where it lives | Who can read | Rotation |
|---|---|---|---|
| Supabase `anon` key | Browser (safe by design) | Anyone with the app | Rotate from Supabase API settings if abused |
| Supabase `service_role` key | Supabase Edge Function secrets only | Edge Functions | Rotate from Supabase API settings; never put in browser/GitHub |
| Gemini API key | Supabase Edge Function secret `GEMINI_API_KEY` (Phase 3) | Edge Functions | Delete/create in Google AI Studio |
| OpenRouter key | Supabase secret `OPENROUTER_API_KEY` | Edge Functions | Rotate from OpenRouter dashboard |
| Telegram bot token | Supabase secret `TELEGRAM_BOT_TOKEN` | Edge Functions | `/token` in BotFather |
| Telegram chat ID | Supabase secret `TELEGRAM_CHAT_ID` | Edge Functions | Change chat ID if chat changes |
| GitHub Gist token (encrypted backup) | User's browser localStorage only | The user's device | Revoke/recreate token with `gist` scope only |

## Rules
- Never commit secrets.
- Never paste secrets in chat.
- Never put `service_role` in client JS.
- Use least-privilege tokens.
- Rotate on device loss.
