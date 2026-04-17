import fs from "fs/promises";
import path from "path";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import type {
  Channel,
  ChannelRepository,
  ChatMessage,
  UpdateChannelInput,
} from "./repository";

export class FsChannelRepository implements ChannelRepository {
  private readonly chatDir: string;
  private readonly channelsFile: string;
  private readonly db: Database.Database;

  constructor(dataDir: string, db: Database.Database = getDb()) {
    this.chatDir = path.join(dataDir, ".chat");
    this.channelsFile = path.join(this.chatDir, "channels.json");
    this.db = db;
  }

  private async ensureChatDir(): Promise<void> {
    await fs.mkdir(this.chatDir, { recursive: true });
  }

  async listChannels(): Promise<Channel[]> {
    await this.ensureChatDir();
    try {
      const raw = await fs.readFile(this.channelsFile, "utf-8");
      return JSON.parse(raw) as Channel[];
    } catch {
      return [];
    }
  }

  async getChannel(slug: string): Promise<Channel | null> {
    const channels = await this.listChannels();
    return channels.find((channel) => channel.slug === slug) || null;
  }

  async createChannel(channel: Channel): Promise<void> {
    await this.ensureChatDir();
    const channels = await this.listChannels();

    if (channels.find((existing) => existing.slug === channel.slug)) {
      throw new Error(`Channel "${channel.slug}" already exists`);
    }

    channels.push(channel);
    await fs.writeFile(this.channelsFile, JSON.stringify(channels, null, 2));
  }

  async updateChannel(slug: string, updates: UpdateChannelInput): Promise<Channel | null> {
    const channels = await this.listChannels();
    const index = channels.findIndex((channel) => channel.slug === slug);
    if (index === -1) return null;

    channels[index] = { ...channels[index], ...updates };
    await fs.writeFile(this.channelsFile, JSON.stringify(channels, null, 2));
    return channels[index];
  }

  getMessages(channelSlug: string, limit = 100, before?: string): ChatMessage[] {
    let query = "SELECT * FROM messages WHERE channel_slug = ?";
    const params: Array<string | number> = [channelSlug];

    if (before) {
      query += " AND created_at < ?";
      params.push(before);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: string;
      channel_slug: string;
      from_id: string;
      from_type: string;
      content: string;
      reply_to: string | null;
      pinned: number;
      created_at: string;
    }>;

    return rows
      .map((row) => ({
        id: row.id,
        channelSlug: row.channel_slug,
        fromId: row.from_id,
        fromType: row.from_type as ChatMessage["fromType"],
        content: row.content,
        replyTo: row.reply_to || undefined,
        pinned: row.pinned === 1,
        createdAt: row.created_at,
      }))
      .reverse();
  }

  postMessage(
    channelSlug: string,
    fromId: string,
    fromType: ChatMessage["fromType"],
    content: string,
    replyTo?: string,
  ): ChatMessage {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO messages (id, channel_slug, from_id, from_type, content, reply_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, channelSlug, fromId, fromType, content, replyTo || null, now);

    return {
      id,
      channelSlug,
      fromId,
      fromType,
      content,
      replyTo,
      pinned: false,
      createdAt: now,
    };
  }

  togglePin(messageId: string): boolean {
    const row = this.db.prepare("SELECT pinned FROM messages WHERE id = ?").get(messageId) as
      | { pinned: number }
      | undefined;
    if (!row) return false;

    const newPinned = row.pinned === 1 ? 0 : 1;
    this.db.prepare("UPDATE messages SET pinned = ? WHERE id = ?").run(newPinned, messageId);
    return newPinned === 1;
  }

  getLatestMessageTime(channelSlug: string): string | null {
    const row = this.db
      .prepare("SELECT MAX(created_at) as latest FROM messages WHERE channel_slug = ?")
      .get(channelSlug) as { latest: string | null } | undefined;
    return row?.latest || null;
  }
}
