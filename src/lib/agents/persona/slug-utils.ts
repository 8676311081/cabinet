import { HttpError } from "@/lib/http/create-handler";

const SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
const FILENAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isValidSlug(slug: string): boolean {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

export function assertValidSlug(slug: string, fieldName = "slug"): void {
  if (!isValidSlug(slug)) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }
}

export function isValidFilename(name: string): boolean {
  return (
    typeof name === "string" &&
    FILENAME_PATTERN.test(name) &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

export function assertValidFilename(name: string, fieldName = "file"): void {
  if (!isValidFilename(name)) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }
}
