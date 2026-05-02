import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    {
      // 毎日 0:00 UTC = 09:00 JST
      path: "/api/cron/reminders",
      schedule: "0 0 * * *",
    },
  ],
};
