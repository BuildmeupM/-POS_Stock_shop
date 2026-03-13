# Agent Working Rules

> **สำคัญ:** Agent ต้องอ่านไฟล์นี้ทุกครั้งก่อนเริ่มทำงาน เพื่อกำหนดเงื่อนไขการทำงานให้ถูกต้อง

## Environment: Windows

- Always use `cmd /c` for terminal commands to ensure the process terminates correctly.
- Avoid interactive prompts; always use non-interactive flags (e.g., `-y`, `--force`).
- If reading files, prefer `type` or `more` via cmd instead of PowerShell's `Get-Content`.
