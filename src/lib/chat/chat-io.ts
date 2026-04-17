import { DATA_DIR } from "@/lib/storage/path-utils";
import { getDb } from "@/lib/db";
import { FsChannelRepository } from "./fs-repository";
import type {
  Channel,
  ChannelRepository,
  ChatMessage,
  UpdateChannelInput,
} from "./repository";

let repository: ChannelRepository = new FsChannelRepository(DATA_DIR, getDb());

export type { Channel, ChannelRepository, ChatMessage, UpdateChannelInput };

export function setChannelRepository(nextRepository: ChannelRepository): void {
  repository = nextRepository;
}

export function resetChannelRepository(): void {
  repository = new FsChannelRepository(DATA_DIR, getDb());
}

export async function listChannels(): Promise<Channel[]> {
  return repository.listChannels();
}

export async function getChannel(slug: string): Promise<Channel | null> {
  return repository.getChannel(slug);
}

export async function createChannel(channel: Channel): Promise<void> {
  return repository.createChannel(channel);
}

export async function updateChannel(
  slug: string,
  updates: UpdateChannelInput
): Promise<Channel | null> {
  return repository.updateChannel(slug, updates);
}

export function getMessages(
  channelSlug: string,
  limit = 100,
  before?: string
): ChatMessage[] {
  return repository.getMessages(channelSlug, limit, before);
}

export function postMessage(
  channelSlug: string,
  fromId: string,
  fromType: "agent" | "human" | "system",
  content: string,
  replyTo?: string
): ChatMessage {
  return repository.postMessage(channelSlug, fromId, fromType, content, replyTo);
}

export function togglePin(messageId: string): boolean {
  return repository.togglePin(messageId);
}

export function getLatestMessageTime(channelSlug: string): string | null {
  return repository.getLatestMessageTime(channelSlug);
}
