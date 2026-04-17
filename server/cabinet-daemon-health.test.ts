import assert from "node:assert/strict";
import test from "node:test";
import {
  handleCabinetDaemonHealthRequest,
  type CabinetDaemonHealthResponse,
} from "./cabinet-daemon-health";
import type { ServiceHealth, ServiceModule } from "./service-module";

function createFakeServiceModule(name: string, health: ServiceHealth): ServiceModule {
  return {
    name,
    async start() {},
    async stop() {},
    health() {
      return health;
    },
  };
}

test("GET /health aggregates service health and returns 503 when any service is down", () => {
  const serviceModules: ServiceModule[] = [
    createFakeServiceModule("terminal-server", { status: "up" }),
    createFakeServiceModule("multica-poller", { status: "starting" }),
    createFakeServiceModule("telegram-bot", {
      status: "down",
      lastError: "Telegram polling failed",
    }),
  ];
  let statusCode = 0;
  let responseBody = "";
  let headers: Record<string, string> = {};

  const handled = handleCabinetDaemonHealthRequest(
    {
      method: "GET",
      url: "/health",
    },
    {
      writeHead(code: number, responseHeaders: Record<string, string>) {
        statusCode = code;
        headers = responseHeaders;
        return this;
      },
      end(chunk?: string) {
        responseBody = chunk ?? "";
        return this;
      },
    },
    serviceModules,
  );

  const body = JSON.parse(responseBody) as CabinetDaemonHealthResponse;

  assert.equal(handled, true);
  assert.equal(statusCode, 503);
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(body, {
    services: [
      { name: "terminal-server", status: "up" },
      { name: "multica-poller", status: "starting" },
      {
        name: "telegram-bot",
        status: "down",
        lastError: "Telegram polling failed",
      },
    ],
    overall: "down",
  });
});
