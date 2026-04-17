import type { IncomingMessage } from "http";
import type { ServiceHealth, ServiceModule } from "./service-module";

type ServiceHealthSource = Pick<ServiceModule, "name" | "health">;
type HealthRequest = Pick<IncomingMessage, "method" | "url">;

interface HealthResponseWriter {
  writeHead(statusCode: number, headers: Record<string, string>): unknown;
  end(body: string): unknown;
}

export interface CabinetDaemonServiceHealth extends ServiceHealth {
  name: string;
}

export type CabinetDaemonOverallHealth = "up" | "degraded" | "down";

export interface CabinetDaemonHealthResponse {
  services: CabinetDaemonServiceHealth[];
  overall: CabinetDaemonOverallHealth;
}

export function resolveCabinetDaemonOverallHealth(
  services: readonly Pick<CabinetDaemonServiceHealth, "status">[],
): CabinetDaemonOverallHealth {
  if (services.some((service) => service.status === "down")) {
    return "down";
  }

  if (services.every((service) => service.status === "up")) {
    return "up";
  }

  return "degraded";
}

export function buildCabinetDaemonHealthResponse(
  serviceModules: readonly ServiceHealthSource[],
): CabinetDaemonHealthResponse {
  const services = serviceModules.map((module) => ({
    name: module.name,
    ...module.health(),
  }));

  return {
    services,
    overall: resolveCabinetDaemonOverallHealth(services),
  };
}

export function writeCabinetDaemonHealthResponse(
  res: HealthResponseWriter,
  serviceModules: readonly ServiceHealthSource[],
): void {
  const payload = buildCabinetDaemonHealthResponse(serviceModules);

  res.writeHead(payload.overall === "down" ? 503 : 200, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

export function handleCabinetDaemonHealthRequest(
  req: HealthRequest,
  res: HealthResponseWriter,
  serviceModules: readonly ServiceHealthSource[],
): boolean {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname !== "/health" || req.method !== "GET") {
    return false;
  }

  writeCabinetDaemonHealthResponse(res, serviceModules);
  return true;
}
