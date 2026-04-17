import { reloadTelegramBot, startTelegramBot, stopTelegramBot } from "../telegram-bot";
import {
  createServiceState,
  waitForAbort,
  type ServiceModule,
} from "../service-module";

interface TelegramModuleOptions {
  waitUntilReady?: (signal: AbortSignal) => Promise<void>;
}

export function createTelegramModule(options: TelegramModuleOptions = {}): ServiceModule {
  const state = createServiceState();

  return {
    name: "telegram-bot",
    async start(ctx) {
      state.starting();
      try {
        await options.waitUntilReady?.(ctx.signal);
        if (ctx.signal.aborted) {
          state.down();
          return;
        }

        await startTelegramBot();
        state.up();
        await waitForAbort(ctx.signal);
      } catch (err) {
        state.down(err);
        throw err;
      } finally {
        stopTelegramBot();
        if (ctx.signal.aborted) {
          state.down();
        }
      }
    },
    async stop() {
      stopTelegramBot();
      state.down();
    },
    async reload() {
      state.starting();
      try {
        await reloadTelegramBot();
        state.up();
      } catch (err) {
        state.down(err);
        throw err;
      }
    },
    health() {
      return state.health();
    },
  };
}

export const telegramModule = createTelegramModule();
