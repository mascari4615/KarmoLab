---
description: How to configure environment variables for YawnBot on Linux (Systemd)
---

This workflow guides you through setting up the necessary environment variables (`DISCORD_TOKEN`, `GEMINI_API_KEY`) on the Linux server hosting YawnBot.

# Prerequisites

- SSH access to the target Linux server (e.g., `ssh root@<IP>`)
- Root or sudo privileges

# Steps

1. **Connect to the Server**
   Open your terminal and SSH into the server:

   ```powershell
   ssh root@<YOUR_SERVER_IP>
   ```

2. **Open the Service Configuration File**
   Edit the systemd service file for YawnBot:

   ```bash
   sudo nano /etc/systemd/system/yawn-bot.service
   ```

3. **Add Environment Variables**
   Locate the `[Service]` section and add the following `Environment` lines.
   *(Replace the placeholder values with your actual keys)*

   ```ini
   [Service]
   # ... existing config ...
   Environment="DISCORD_TOKEN=YOUR_ACTUAL_DISCORD_TOKEN_HERE"
   Environment="GEMINI_API_KEY=YOUR_ACTUAL_GEMINI_API_KEY_HERE"
   Environment="GEMINI_MODEL=gemini-flash-latest"
   # ... existing config ...
   ```

   > **Note**: Do not use quotes around the values if they don't contain spaces, but quotes recommended to be safe.

4. **Save and Exit**
   - Press `Ctrl + O` then `Enter` to save.
   - Press `Ctrl + X` to exit.

5. **Reload and Restart Service**
   Apply the changes and restart the bot:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart yawn-bot
   ```

6. **Verify Status**
   Check if the bot started correctly with the new variables:

   ```bash
   sudo systemctl status yawn-bot
   ```
